'use strict';

const	dataWriter	= require(__dirname + '/dataWriter.js'),
	logPrefix = 'larvitfiles ./index.js: ',
	uuidLib	= require('uuid'),
	utils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	fs	= require('fs'),
	db	= require('larvitdb');

let config;

if (fs.existsSync(process.cwd() + '/config/larvitfiles.json')) {
	config	= require(process.cwd() + '/config/larvitfiles.json');
} else {
	config = {};
}

if (config.storagePath !== undefined) {
	exports.storagePath = config.storagePath;
} else {
	exports.storagePath = process.cwd() + '/larvitfiles';
}

if (config.prefix) {
	exports.prefix = config.prefix;
} else {
	exports.prefix = '/dbfiles/';
}

dataWriter.ready();

function File(options, cb) {
	const	tasks	= [],
		that	= this;

	if (typeof options === 'function' || options === undefined) {
		const err = new Error('First parameter must be an object.');
		log.info('larvitviles: File() - ' + err.message);
		return cb(err);
	}

	if (cb === undefined) {
		cb = function () {};
	}

	// There must always be a metadata object
	that.metadata	= {};

	tasks.push(dataWriter.ready);

	if (options.slug !== undefined && options.slug !== '') {
		tasks.push(function (cb) {
			db.query('SELECT uuid, slug FROM larvitfiles_files WHERE slug = ?', [options.slug], function (err, rows) {
				if (err) return cb(err);

				if (rows.length === 0) {
					that.slug	= options.slug;
					return cb();
				}

				that.uuid	= utils.formatUuid(rows[0].uuid);
				that.slug	= rows[0].slug;
				cb();
			});
		});
	} else if (options.uuid) {
		that.uuid = utils.formatUuid(options.uuid);
		if (that.uuid === false) {
			const err = new Error('Invalid uuid supplied: "' + options.uuid + '"');
			log.info('larvitviles: File() - ' + err.message);
			return cb(err);
		}
	} else {
		const err = new Error('Options must contain either slug or uuid. Neither was provided.');
		log.info('larvitviles: File() - ' + err.message);
		return cb(err);
	}

	tasks.push(function (cb) {
		if (that.uuid === undefined) {
			that.uuid	= uuidLib.v4();
			return cb();
		}

		that.loadFromDb(cb);
	});

	tasks.push(function (cb) {
		if (options.slug)	{ that.slug	= options.slug;	}
		if (options.data)	{ that.data	= options.data;	}
		if (options.metadata)	{ that.metadata	= options.metadata;	}
		cb();
	});

	async.series(tasks, cb);
}

File.prototype.loadFromDb = function loadFromDb(cb) {
	const	tasks	= [],
		that	= this;

	if ( ! that.uuid) {
		const e = new Error('uuid is not defined');
		log.info(logPrefix + 'loadFromDb() - ' + e.message);
		return cb(e);
	}

	if (exports.storagePath === null) {
		const e = new Error('storagePath not set');
		log.info(logPrefix + 'loadFromDb() - ' + e.message);
		return cb(e);
	}

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		db.query('SELECT uuid, slug FROM larvitfiles_files WHERE uuid = ?', [utils.uuidToBuffer(that.uuid)], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				const err = new Error('No file found with uuid: ' + utils.formatUuid(that.uuid));
				log.info('larvitfiles: File() - ' + err.message);
				return cb(err);
			}

			that.uuid	= utils.formatUuid(rows[0].uuid);
			that.slug	= rows[0].slug;
			cb();
		});
	});

	tasks.push(function (cb) {
		that.metadata = {};

		if (that.uuid === undefined) {
			cb();
		}

		db.query('SELECT name, value FROM larvitfiles_files_metadata WHERE fileUuid = ?', [utils.uuidToBuffer(that.uuid)], function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	row	= rows[i];

				if (that.metadata[row.name] === undefined) {
					that.metadata[row.name]	= [];
				}

				that.metadata[row.name].push(row.value);
			}

			cb();
		});
	});

	tasks.push(function (cb) {
		fs.readFile(exports.storagePath + '/' + that.uuid, function (err, data) {
			if (err) return cb(err);
			that.data = data;
			cb();
		});
	});

	async.series(tasks, cb);
};

File.prototype.rm = function rm(cb) {
	const tasks = [],
		that	= this;

	if ( ! that.uuid) {
		const e = new Error('uuid is not defined');
		log.info(logPrefix + 'rm() - ' + e.message);
		return cb(e);
	}

	if (exports.storagePath === null) {
		const e = new Error('storagePath not set');
		log.info(logPrefix + 'rm() - ' + e.message);
		return cb(e);
	}

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const	options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'rm';
		message.params	= {};
		message.params.data	= {'uuid': that.uuid};

		dataWriter.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);
			dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		fs.unlink(exports.storagePath + '/' + that.uuid, cb);
	});

	async.series(tasks, function (err) {
		if (err) return cb(err);

		delete that.uuid;
		delete that.slug;
		delete that.data;
		that.metadata = {};

		cb();
	});
};

File.prototype.save = function save(cb) {
	const	tasks	= [],
		that	= this;

	if (exports.storagePath === null) {
		const e = new Error('storagePath not set');
		log.info(logPrefix + 'save() - ' + e.message);
		return cb(e);
	}

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'save';
		message.params	= {};
		message.params.data	= {
			'uuid':	that.uuid,
			'slug':	that.slug,
			'metadata':	that.metadata
		};

		dataWriter.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);
			dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		fs.writeFile(exports.storagePath + '/' + that.uuid, that.data, cb);
	});

	tasks.push(function (cb) {
		that.loadFromDb(cb);
	});

	async.series(tasks, cb);
};

function Files() {
	this.filter = {
		'metadata':	{}
	};
}

Files.prototype.get = function get(cb) {
	const	dbFiles	= {},
		tasks	= [],
		that	= this;

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const	dbFields	= [];

		let sql = 'SELECT uuid, slug FROM larvitfiles_files WHERE 1';

		if (Object.keys(that.filter.metadata).length !== 0) {
			for (const name of Object.keys(that.filter.metadata)) {
				let values = that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const value = values[i];

					sql += ' AND uuid IN (SELECT DISTINCT fileUuid FROM larvitfiles_files_metadata WHERE ';

					if (value === true) {
						sql += 'name = ?';
						dbFields.push(name);
					} else {
						sql += 'name = ? AND value = ?';
						dbFields.push(name);
						dbFields.push(value);
					}

					sql += ')';
				}
			}
		}

		db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= utils.formatUuid(rows[i].uuid);

				dbFiles[fileUuid] = {
					'uuid':	fileUuid,
					'slug':	rows[i].slug,
					'metadata':	{}
				};
			}

			cb();
		});
	});

	tasks.push(function (cb) {
		const	dbFields	= [];

		let sql = 'SELECT * FROM larvitfiles_files_metadata WHERE 1';

		if (Object.keys(that.filter.metadata).length !== 0) {
			for (const name of Object.keys(that.filter.metadata)) {
				let values = that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const value = values[i];

					sql += ' AND fileUuid IN (SELECT DISTINCT fileUuid FROM larvitfiles_files_metadata WHERE ';

					if (value === true) {
						sql += 'name = ?';
						dbFields.push(name);
					} else {
						sql += 'name = ? AND value = ?';
						dbFields.push(name);
						dbFields.push(value);
					}

					sql += ')';
				}
			}
		}

		db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= utils.formatUuid(rows[i].fileUuid),
					row	= rows[i];

				if (dbFiles[fileUuid].metadata[row.name] === undefined) {
					dbFiles[fileUuid].metadata[row.name] = [];
				}

				dbFiles[fileUuid].metadata[row.name].push(row.value);
			}

			cb();
		});
	});

	async.series(tasks, function (err) {
		if (err) return cb(err);

		cb(null, dbFiles);
	});
};

/**
 * Get file Uuid by slug
 *
 * @param str slug
 * @param func cb(err, uuid) - uuid being a formatted string or boolean false
 */
function getFileUuidBySlug(slug, cb) {
	const tasks = [];

	let result = false;

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				return cb(null, false);
			}

			result = utils.formatUuid(rows[0].uuid);

			cb();
		});
	});

	async.series(tasks, function (err) {
		cb(err, result);
	});
};

exports.dataWriter	= dataWriter;
exports.File	= File;
exports.Files	= Files;
exports.getFileUuidBySlug	= getFileUuidBySlug;
exports.options	= dataWriter.options;
