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

// eslint-disable-next-line padded-blocks
class Files {

	/**
	 * Ssdfad
	 * @param {options} options - asdfadf
	 */
	constructor(options) {
		const logPrefix = topLogPrefix + 'constructor() - ';

		if (! options.db) throw new Error('Missing required option "db"');
		if (! options.storagePath) throw new Error('Missing required option storage path');

		if (! options.lUtils) {
			options.lUtils = new LUtils();
		}

		if (! options.log) options.log = new options.lUtils.Log('info');

		if (! options.exchangeName) {
			options.exchangeName = 'larvitfiles';
		}

		if (! options.prefix) {
			options.prefix	= '/dbfiles/';
		}

		if (! options.mode) {
			options.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
			options.mode = 'noSync';
		} else if (['noSync', 'master', 'slave'].indexOf(options.mode) === - 1) {
			const err = new Error('Invalid "mode" option given: "' + options.mode + '"');

			options.log.error(logPrefix + err.message);
			throw err;
		}

		if (! options.intercom) {
			options.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
			options.intercom = new Intercom('loopback interface');
		}

		for (const key of Object.keys(options)) {
			this[key] = options[key];
		}

		mkdirp(options.storagePath, err => {
			if (err) {
				this.log.error(topLogPrefix + 'Could not create folder: "' + options.storagePath + '" err: ' + err.message);

				throw err;
			} else {
				this.log.debug(topLogPrefix + 'Folder "' + options.storagePath + '" created if it did not already exist');
			}

			this.dataWriter	= new DataWriter({
				'storagePath':    this.storagePath,
				'exchangeName':   this.exchangeName,
				'intercom':       this.intercom,
				'mode':           this.mode,
				'log':            this.log,
				'db':             this.db,
				'amsync_host':    options.amsync_host    || null,
				'amsync_minPort': options.amsync_minPort || null,
				'amsync_maxPort': options.amsync_maxPort || null
			});
		});
	};

	/**
	 * 
	 * @param {string} sql - asdfadf
	 * @param {Array} dbFields - asdfadf
	 */
	async _runQuery(sql, dbFields) {
		return new Promise((resolve, reject) => {
			this.db.query(sql, dbFields, (err, rows) => {
				if (err) {
					reject(err);
				} else {
					resolve(rows);
				}
			});
		});
	}

	/**
	 * 
	 * @param {string} filePath - asdfad
	 */
	async _readFile(filePath) {
		return new Promise((resolve, reject) => {
			fs.readFile(filePath, (err, data) => {
				if (err) {
					this.log.warn(logPrefix + 'Failed to load file data from disk, err: ' + err.message);
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}

	/**
	 * 
	 * @param {object} options - asdfadfa
	 */
	async _get(options) {
		let dbFields = [];
		let sql = 'SELECT f.uuid, f.slug\nFROM larvitfiles_files f\n';
		let sqlOrder;

		if (! options) options = {};

		if (Array.isArray(options.uuids)) {
			sql += 'WHERE f.uuid IN (';

			for (let i = 0; i < options.uuids.length; i ++) {
				sql += '?,';

				const uuidBuf = this.lUtils.uuidToBuffer(options.uuids[i]);

				if (! uuidBuf) throw new Error('Invalid uuid: "' + options.uuids[i] + '"');

				dbFields.push(uuidBuf);
			}

			sql = sql.substr(0, sql.length - 1);
			sql += ')';
		} else if (Array.isArray(options.slugs)) {
			sql += 'WHERE f.slug IN (';

			for (let i = 0; i < options.slugs.length; i ++) {
				sql += '?,';
			}

			sql = sql.substr(0, sql.length - 1);
			sql += ')';

			dbFields = options.slugs;
		} else {
			if (! options.filter) options.filter = {};
			if (! options.order) options.order = {};

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

					if (! (values instanceof Array)) {
						values = [values];
					}

					for (let i = 0; values[i] !== undefined; i ++) {
						const value = values[i];

						counter ++;
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

					this.log.warn(logPrefix + err.message);

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

					if (! (values instanceof Array)) {
						values = [values];
					}

					for (let i = 0; values[i] !== undefined; i ++) {
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

		const rows = await this._runQuery(sql, dbFields);

		if (! rows || rows.length === 0) return [];

		const dbFiles = rows.map(r => {
			return {
				'uuid':     this.lUtils.formatUuid(r.uuid),
				'slug':     r.slug,
				'metadata': {}
			};
		});

		// Fetch metadata
		const dbMetadataFields = dbFiles.map(f => this.lUtils.uuidToBuffer(f.uuid));
		let metadataSql = 'SELECT fileUuid, name, value FROM larvitfiles_files_metadata WHERE fileUuid IN (';

		for (let i = 0; i < dbFiles.length; i ++) {
			metadataSql += '?,';
		}

		metadataSql = metadataSql.substr(0, metadataSql.length - 1);
		metadataSql += ')';

		const metadataRows = await this._runQuery(metadataSql, dbMetadataFields);

		for (let i = 0; metadataRows[i] !== undefined; i ++) {
			const row = metadataRows[i];

			const file = dbFiles.find(f => f.uuid === this.lUtils.formatUuid(row.fileUuid));

			if (file.metadata[row.name] === undefined) {
				file.metadata[row.name] = [];
			}

			file.metadata[row.name].push(row.value);
		}

		return dbFiles;
	}

	/**
	 * 
	 * @param {string} slug - asdad
	 */
	async uuidFromSlug(slug) {
		if (! slug) throw new Error('Slug not set');

		const rows = await this._runQuery('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug]);

		if (! rows || rows.length === 0) return null;

		return this.lUtils.formatUuid(rows[0].uuid);
	}

	/**
	 * 
	 * @param {object} options - asdf
	 */
	async get(options) {
		const getOptions = {};

		if (options.uuid) getOptions.uuids = [options.uuid];
		else if (options.slug) getOptions.slugs = [options.slug];
		else throw new Error('Need uuid or slug to be able to get file');

		getOptions.includeMetadata = true;
		getOptions.includeFileData = options.includeFileData === undefined ? true : options.includeFileData;

		const result = await this._get(getOptions);

		if (result.length === 0) return null;

		result[0].data = await this._readFile(path.join(this.storagePath, result[0].uuid));

		return result[0];
	}

	/**
	 * 
	 * @param {object} options - asdfad 
	 */
	async list(options) {
		return this._get(options);
	}

	/**
	 * 
	 * @param {object} file - asda
	 */
	async save(file) {
		return new Promise((resolve, reject) => {
			const logPrefix = topLogPrefix + 'save() - ';
			const tasks = [];

			let savedFile;

			if (! file.slug) {
				throw new Error('Slug is required to save file');
			}

			if (! file.uuid) {
				file.uuid = uuid();
				this.log.verbose(logPrefix + 'New file with slug "' + file.slug + '" was given uuid "' +  file.uuid + '"');
			}

			tasks.push((cb) => {
				const options = {'exchange': this.dataWriter.exchangeName};
				const message = {};

				message.action      = 'save';
				message.params      = {};
				message.params.data = {
					'uuid':     file.uuid,
					'slug':     file.slug,
					'metadata': file.metadata
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
				this.get({'uuid': file.uuid}).then(result => {
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
	 * 
	 * @param {string} uuid - uuid of file to remove
	 */
	async rm(uuid) {
		return new Promise((resolve, reject) => {
			const logPrefix = topLogPrefix + 'rm() - ';
			const tasks     = [];

			if (! uuid) {
				const err = new Error('uuid is not defined');

				this.log.info(logPrefix + err.message);

				return reject(err);
			}

			tasks.push(cb => {
				const options = {'exchange': this.dataWriter.exchangeName};
				const message = {};

				message.action      = 'rm';
				message.params      = {};
				message.params.data = {'uuid': uuid};

				this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
					if (err) return cb(err);
					this.dataWriter.emitter.once(msgUuid, cb);
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

