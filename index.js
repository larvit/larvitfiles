'use strict';

const topLogPrefix = 'larvitfiles: ./index.js: ';
const DataWriter = require(__dirname + '/dataWriter.js');
const Intercom = require('larvitamintercom');
const LUtils = require('larvitutils');
const path = require('path');
const mkdirp = require('mkdirp');
const async = require('async');
const uuid = require('uuid/v4');
const fs = require('fs');

/**
 * A promise wrapper for running a database query, will resolve to the rows fetched
 *
 * @param {object} db - The db instance to run the query on
 * @param {string} sql - The query to run
 * @param {object[]} dbFields - Parameters for the query
 * @return {Promise} Promise
 */
async function _runQuery(db, sql, dbFields) {
	return new Promise((resolve, reject) => {
		db.query(sql, dbFields, (err, rows) => {
			if (err) {
				reject(err);
			} else {
				resolve(rows);
			}
		});
	});
};

/**
 * A promise wrapper for fs.readFile, will resolve to the data the file
 *
 * @param {object} log - A logging instance
 * @param {string} filePath - Path to the file to read
 * @return {Promise} Promise
 */
async function _readFile(log, filePath) {
	return new Promise((resolve, reject) => {
		fs.readFile(filePath, (err, data) => {
			if (err) {
				log.warn(logPrefix + 'Failed to load file data from disk, err: ' + err.message);
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
};

/**
 * Returns a list of files based on db instance and options
 *
 * @param {object} db - A db instance
 * @param {object} log - A logging instance
 * @param {lUtils} lUtils - An instance of larvitutils
 * @param {object} options - Options used to find the files
 * @param {string[]} options.uuids - An array of uuids of files to get
 * @param {string[]} options.slugs - An array of slugs of files to get
 * @param {object} options.filter - Filter options for when listing files
 * @param {string} options.filter.operator - Operator for filter queries, can be "and" or "or", defaults to "and"
 * @param {object} options.filter.metadata - The metadata values used to filter listed files
 * @param {string[]} options.filter.metadata.name - The key represents the name of the metadata field, and the value the value to filter on
 * @param {object} options.order - Ordering options for file listing
 * @param {string} options.order.dir - The sort order, can be "asc" or "desc", defaults to "desc"
 * @param {string} options.order.column - The metadata field name to sort by
 * @param {Number} options.offset - The offset for the query
 * @param {Number} options.limit - The maximum amount of files returned, defaults to 100
 * @returns {Promise} - A promise that resolves to an array of file objects
 */
async function _get(db, log, lUtils, options) {
	let dbFields = [];
	let sql = 'SELECT f.uuid, f.slug\nFROM larvitfiles_files f\n';
	let sqlOrder;

	if (!options) options = {};

	// Fetch by uuids as first priority
	if (Array.isArray(options.uuids)) {
		sql += 'WHERE f.uuid IN (';

		for (let i = 0; i < options.uuids.length; i++) {
			sql += '?,';

			const uuidBuf = lUtils.uuidToBuffer(options.uuids[i]);

			if (!uuidBuf) throw new Error('Invalid uuid: "' + options.uuids[i] + '"');

			dbFields.push(uuidBuf);
		}

		sql = sql.substr(0, sql.length - 1);
		sql += ')';

	// If no uuids are supplied, check for slugs
	} else if (Array.isArray(options.slugs)) {
		sql += 'WHERE f.slug IN (';

		for (let i = 0; i < options.slugs.length; i++) {
			sql += '?,';
		}

		sql = sql.substr(0, sql.length - 1);
		sql += ')';

		dbFields = options.slugs;

	// Either uuids or slugs are supplied, check other filters
	} else {
		if (!options.filter) options.filter = {};
		if (!options.order) options.order = {};

		if (options.filter.operator !== 'or') {
			options.filter.operator = 'and';
		}

		if (options.order.dir !== 'asc') {
			options.order.dir = 'desc';
		}

		if (options.filter.operator === 'and' && options.filter.metadata && Object.keys(options.filter.metadata).length !== 0) {
			let counter = 0;

			for (const name of Object.keys(options.filter.metadata)) {
				let values = options.filter.metadata[name];

				if (!(values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i++) {
					const value = values[i];

					counter++;
					sql += '	JOIN larvitfiles_files_metadata fm' + counter;
					sql += ' ON f.uuid = fm' + counter + '.fileUuid';

					if (value === true) {
						sql += ' AND fm' + counter + '.name = ?';
						dbFields.push(name);
					} else {
						sql += ' AND fm' + counter + '.name = ?';
						sql += ' AND fm' + counter + '.value = ?';
						dbFields.push(name);
						dbFields.push(value);
					}

					sql += '\n';
				}
			}

			if (counter > 60) {
				const err = new Error('Can not select on more than a total of 60 metadata key value pairs due to database limitation in joins');

				log.warn(logPrefix + err.message);

				throw err;
			}
		}

		if (options.order.column) {
			if (options.order.column.startsWith('metadata:')) {
				const metadataName = options.order.column.substring(9);

				sql += 'LEFT JOIN larvitfiles_files_metadata ordm ON f.uuid = ordm.fileUuid AND ordm.name = ?';
				sqlOrder = 'ORDER BY ordm.value';

				dbFields.push(metadataName);
			} else {
				switch (options.order.column) {
				case 'slug':
					sqlOrder = 'ORDER BY f.slug';
					break;
				}
			}
		}

		if (options.filter.operator === 'or' && options.filter.metadata && Object.keys(options.filter.metadata).length !== 0) {
			sql += 'WHERE f.uuid IN (SELECT fileUuid FROM larvitfiles_files_metadata WHERE ';

			for (const name of Object.keys(options.filter.metadata)) {
				let values = options.filter.metadata[name];

				if (!(values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i++) {
					const value = values[i];

					if (value === true) {
						sql += 'name = ? OR ';
						dbFields.push(name);
					} else {
						sql += '(name = ? AND value = ?) OR ';
						dbFields.push(name);
						dbFields.push(value);
					}
				}
			}

			sql = sql.substring(0, sql.length - 4);
			sql += ')\n';
		}

		if (sqlOrder) {
			sql += sqlOrder + ' ' + options.order.dir + '\n';
		}
	}

	if (options.limit) {
		sql += 'LIMIT ?';
		dbFields.push(options.limit);

		if (options.offset) {
			sql += ' OFFSET ?';
			dbFields.push(options.offset);
		}
	} else {
		sql += 'LIMIT 100';
	}

	const rows = await _runQuery(db, sql, dbFields);

	if (!rows || rows.length === 0) return [];

	const dbFiles = rows.map(r => {
		return {
			uuid: lUtils.formatUuid(r.uuid),
			slug: r.slug,
			metadata: {}
		};
	});

	// Fetch metadata
	const dbMetadataFields = dbFiles.map(f => lUtils.uuidToBuffer(f.uuid));
	let metadataSql = 'SELECT fileUuid, name, value FROM larvitfiles_files_metadata WHERE fileUuid IN (';

	for (let i = 0; i < dbFiles.length; i++) {
		metadataSql += '?,';
	}

	metadataSql = metadataSql.substr(0, metadataSql.length - 1);
	metadataSql += ')';

	const metadataRows = await _runQuery(db, metadataSql, dbMetadataFields);

	for (let i = 0; metadataRows[i] !== undefined; i++) {
		const row = metadataRows[i];

		const file = dbFiles.find(f => f.uuid === lUtils.formatUuid(row.fileUuid));

		if (file.metadata[row.name] === undefined) {
			file.metadata[row.name] = [];
		}

		file.metadata[row.name].push(row.value);
	}

	return dbFiles;
}

// eslint-disable-next-line padded-blocks
class Files {

	/**
	 * Options for Files instance.
	 * @param {object} options - Files options
	 * @param {object} options.db - A mysql2 compatible db instance
	 * @param {string} options.fileStoragePath - Path to where files should be stored
	 * @param {object} [options.lUtils] - Instance of larvitutils. Will be created if not set
	 * @param {object} [options.log] - Instans of logger. Will default to larvitutils logger if not set
	 * @param {string} [options.exchangeName=larvitfiles] - Name of exchange used when communicating over Rabbitmq.
	 * @param {string} [options.prefix=/dbfiles/] - Prefix used to navigate to controller serving files
	 * @param {string} [options.mode=noSync] - Listening mode of dataWriter. Can be noSync, master, slave
	 * @param {Intercom} [options.intercom] - An instance of larvitamintercom. Will default to instance using "loopback interface"
	 * @param {string} [options.amsync_host=null] - Hostname used when syncing data
	 * @param {string} [options.amsync_minPort=null] - Min. port in range used when syncing data
	 * @param {string} [options.amsync_maxPort=null] - Max. port in range used when syncing data
	 * @param {function} cb - Callback
	 */
	constructor(options, cb) {
		const logPrefix = topLogPrefix + 'constructor() - ';

		// Make sure there always is a callback function to be called
		if (!cb) {
			cb = ()=>{};
		}

		if (!options.db) throw new Error('Missing required option "db"');
		if (!options.storagePath) throw new Error('Missing required option storage path');

		if (!options.lUtils) {
			options.lUtils = new LUtils();
		}

		if (!options.log) options.log = new options.lUtils.Log('info');

		if (!options.exchangeName) {
			options.exchangeName = 'larvitfiles';
		}

		if (!options.prefix) {
			options.prefix	= '/dbfiles/';
		}

		if (!options.mode) {
			options.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
			options.mode = 'noSync';
		} else if (['noSync', 'master', 'slave'].indexOf(options.mode) === -1) {
			const err = new Error('Invalid "mode" option given: "' + options.mode + '"');

			options.log.error(logPrefix + err.message);
			throw err;
		}

		if (!options.intercom) {
			options.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
			options.intercom = new Intercom('loopback interface');
		}

		for (const key of Object.keys(options)) {
			this[key] = options[key];
		}

		mkdirp(options.storagePath, err => {
			if (err) {
				this.log.error(topLogPrefix + 'Could not create folder: "' + options.storagePath + '" err: ' + err.message);

				return cb(err);
			} else {
				this.log.debug(topLogPrefix + 'Folder "' + options.storagePath + '" created if it did not already exist');
			}

			this.dataWriter = new DataWriter({
				storagePath: this.storagePath,
				exchangeName: this.exchangeName,
				intercom: this.intercom,
				mode: this.mode,
				log: this.log,
				db: this.db,
				amsync_host: options.amsync_host || null,
				amsync_minPort: options.amsync_minPort || null,
				amsync_maxPort: options.amsync_maxPort || null
			}, cb);
		});
	};

	/**
	 * Returns the uuid of a file with a certain slug
	 * @param {string} slug - The slug to identify the file by
	 * @returns {Promise} - Promise that resolves to the string representation of the uuid found otherwise null
	 */
	async uuidFromSlug(slug) {
		if (!slug) throw new Error('Slug not set');

		const rows = await _runQuery(this.db, 'SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug]);

		if (!rows || rows.length === 0) return null;

		return this.lUtils.formatUuid(rows[0].uuid);
	}

	/**
	* Returns a file based on a uuid or a slug
	* @param {object} options - Options used to find the files
	* @param {string} options.uuid - The uuid of the file to get
	* @param {string} options.slug - The slug of the file to get. If uuid is supplied slug will be ignored.
	* @returns {Promise} - Returns a promise that resolves to a file object if found, otherwise null
	*/
	async get(options) {
		const getOptions = {};

		if (options.uuid) getOptions.uuids = [options.uuid];
		else if (options.slug) getOptions.slugs = [options.slug];
		else throw new Error('Need uuid or slug to be able to get file');

		getOptions.includeMetadata = true;
		getOptions.includeFileData = options.includeFileData === undefined ? true : options.includeFileData;

		const result = await _get(this.db, this.log, this.lUtils, getOptions);

		if (result.length === 0) return null;

		result[0].data = await _readFile(this.log, path.join(this.storagePath, result[0].uuid));

		return result[0];
	}

	/**
	* Returns a list of files based on filter options
	* @param {object} [options] - The options used to filter and order the file listing
	* @param {object} [options.filter] - Filter options for when listing files
	* @param {string} [options.filter.operator] - Operator for filter queries, can be "and" or "or", defaults to "and"
	* @param {object} [options.filter.metadata] - The metadata values used to filter listed files
	* @param {string[]} [options.filter.metadata.name] - The key represents the name of the metadata field, and the value the value to filter on
	* @param {object} [options.order] - Ordering options for file listing
	* @param {string} [options.order.dir] - The sort order, can be "asc" or "desc", defaults to "desc"
	* @param {string} [options.order.column] - The metadata field name to sort by
	* @param {Number} [options.offset] - The offset for the query
	* @param {Number} [options.limit] - The maximum amount of files returned, defaults to 100
	* @returns {Promise} - Returns a promise that resolves to an array with file objects
	*/
	list(options) {
		return _get(this.db, this.log, this.lUtils, options || {});
	}

	/**
	 * Saves a file object in the database and writes its data to disk
	 * @param {object} file - File to save
	 * @param {string} [file.uuid=uuid()] - A unique uuid used to identify the file. Will be generated if not set
	 * @param {string} file.slug - A unique slug used to identify the file
	 * @param {object} [file.metadata] - Metadata for file
	 * @param {string[]} [file.metadata.key] - Key/value pairs of metadata. A key can have multiple values.
	 * @param {Buffer} file.data - The buffered contents of the file
	 * @param {boolean} [updateMatchingSlug] - If slug is already taken, update that file. Defaults to false
	 * @returns {Promise} promise - Returns a promise that resolves to the file saved
	 */
	save(file) {
		return new Promise(async (resolve, reject) => {
			const logPrefix = topLogPrefix + 'save() - ';
			const tasks = [];

			let savedFile;

			if (!file.slug) {
				throw new Error('Slug is required to save file');
			}

			if (!file.uuid && file.updateMatchingSlug) {
				const existingFile = await this.get({slug: file.slug});

				if (existingFile) {
					this.log.verbose(logPrefix + 'Updating file by matching slug: "' + file.slug + '", uuid: "' + file.uuid + '"');
					file.uuid = existingFile.uuid;
				}
			}

			if (!file.uuid) {
				file.uuid = uuid();
				this.log.verbose(logPrefix + 'New file with slug "' + file.slug + '" was given uuid "' + file.uuid + '"');
			}

			tasks.push(cb => {
				const options = {exchange: this.dataWriter.exchangeName};
				const message = {};

				message.action = 'save';
				message.params = {};
				message.params.data = {
					uuid: file.uuid,
					slug: file.slug,
					metadata: file.metadata
				};

				this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
					if (err) return cb(err);
					this.dataWriter.emitter.once(msgUuid, cb);
				});
			});

			tasks.push(cb => {
				const fullPath = this.storagePath + '/' + file.uuid;

				fs.writeFile(fullPath, file.data, err => {
					if (err) this.log.warn(logPrefix + 'Could not write file: "' + fullPath + '", err: ' + err.message);
					cb(err);
				});
			});

			tasks.push(cb => {
				this.get({uuid: file.uuid}).then(result => {
					savedFile = result;
					cb();
				})
					.catch(err => {
						cb(err);
					});
			});

			async.series(tasks, err => {
				if (err) {
					reject(err);
				} else {
					resolve(savedFile);
				}
			});
		});
	}

	/**
	 * Removes a file with uuid
	 * @param {string} uuid - uuid of file to remove
	 * @returns {Promise} - A promise that resolves when the files is removed
	 */
	rm(uuid) {
		return new Promise((resolve, reject) => {
			const logPrefix = topLogPrefix + 'rm() - ';
			const tasks = [];
			const dataWriter = this.dataWriter;

			if (!uuid) {
				const err = new Error('uuid is not defined');

				this.log.info(logPrefix + err.message);

				return reject(err);
			}

			tasks.push(cb => {
				const options = {exchange: dataWriter.exchangeName};
				const message = {};

				message.action = 'rm';
				message.params = {};
				message.params.data = {uuid};

				dataWriter.intercom.send(message, options, (err, msgUuid) => {
					if (err) return cb(err);
					dataWriter.emitter.once(msgUuid, cb);
				});
			});

			tasks.push(cb => {
				const fullPath = this.storagePath + '/' + uuid;

				fs.unlink(fullPath, err => {
					if (err) this.log.warn(logPrefix + 'Could not unlink file: "' + fullPath + '", err: ' + err.message);
					cb(err);
				});
			});

			async.series(tasks, err => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}

exports = module.exports = Files;
