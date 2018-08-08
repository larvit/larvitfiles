'use strict';

const	topLogPrefix	= 'larvitfiles: ./index.js: ',
	dataWriter	= require(__dirname + '/dataWriter.js'),
	uuidLib	= require('uuid'),
	lUtils	= require('larvitutils'),
	mkdirp	= require('mkdirp'),
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
	exports.storagePath	= config.storagePath;
} else {
	exports.storagePath	= process.cwd() + '/larvitfiles';
}

// Make sure the storage path exists
mkdirp(exports.storagePath, function (err) {
	if (err) {
		log.error(topLogPrefix + 'Could not create folder: "' + exports.storagePath + '" err: ' + err.message);
	} else {
		log.debug(topLogPrefix + 'Folder "' + exports.storagePath + '" created if it did not already exist');
	}
});

if (config.prefix) {
	exports.prefix	= config.prefix;
} else {
	exports.prefix	= '/dbfiles/';
}

dataWriter.ready();

function File(options, cb) {
	const	logPrefix	= topLogPrefix + 'File() - ',
		tasks	= [],
		that	= this;

	if (typeof options === 'function' || options === undefined) {
		const	err	= new Error('First parameter must be an object.');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	if (cb === undefined) {
		cb	= function () {};
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

				that.uuid	= lUtils.formatUuid(rows[0].uuid);
				that.slug	= rows[0].slug;
				cb();
			});
		});
	} else if (options.uuid) {
		that.uuid	= lUtils.formatUuid(options.uuid);
		if (that.uuid === false) {
			const	err	= new Error('Invalid uuid supplied: "' + options.uuid + '"');
			log.info(logPrefix + err.message);
			return cb(err);
		}
	} else {
		const	err	= new Error('Options must contain either slug or uuid. Neither was provided.');
		log.info(logPrefix + err.message);
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
	const	logPrefix	= topLogPrefix + 'loadFromDb() - ',
		tasks	= [],
		that	= this;

	if ( ! that.uuid) {
		const	err	= new Error('uuid is not defined');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	if (exports.storagePath === null) {
		const	err	= new Error('storagePath not set');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const	uuiBuffer	= lUtils.uuidToBuffer(that.uuid);

		if ( ! uuiBuffer) {
			const	err	= new Error('Not a valid uuid: ' + that.uuid	);
			log.info(logPrefix + err.message);
			return cb(err);
		}

		db.query('SELECT uuid, slug FROM larvitfiles_files WHERE uuid = ?', [uuiBuffer], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				const	err	= new Error('No file found with uuid: ' + lUtils.formatUuid(that.uuid));
				log.info(logPrefix + err.message);
				return cb(err);
			}

			that.uuid	= lUtils.formatUuid(rows[0].uuid);
			that.slug	= rows[0].slug;
			cb();
		});
	});

	tasks.push(function (cb) {
		const	uuiBuffer	= lUtils.uuidToBuffer(that.uuid);

		that.metadata	= {};

		if (that.uuid === undefined) return cb();

		if ( ! uuiBuffer) {
			const	err	= new Error('Not a valid uuid: ' + that.uuid	);
			log.info(logPrefix + err.message);
			return cb(err);
		}

		db.query('SELECT name, value FROM larvitfiles_files_metadata WHERE fileUuid = ?', [uuiBuffer], function (err, rows) {
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
			if (err) log.warn(logPrefix + 'Failed to load file data from disk, err: ' + err.message);
			that.data	= data;
			cb(err);
		});
	});

	async.series(tasks, cb);
};

File.prototype.rm = function rm(cb) {
	const	logPrefix	= topLogPrefix + 'rm() - ',
		tasks	= [],
		that	= this;

	if ( ! that.uuid) {
		const	err	= new Error('uuid is not defined');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	if (exports.storagePath === null) {
		const	err	= new Error('storagePath not set');
		log.info(logPrefix + err.message);
		return cb(err);
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
		const	fullPath	= exports.storagePath + '/' + that.uuid;

		fs.unlink(fullPath, function (err) {
			if (err) log.warn(logPrefix + 'Could not unlink file: "' + fullPath + '", err: ' + err.message);
			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) return cb(err);

		delete that.uuid;
		delete that.slug;
		delete that.data;
		that.metadata	= {};

		cb();
	});
};

File.prototype.save = function save(cb) {
	const	logPrefix	= topLogPrefix + 'save() - ',
		tasks	= [],
		that	= this;

	if (exports.storagePath === null) {
		const	err	= new Error('storagePath not set');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const	options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'save';
		message.params	= {};
		message.params.data = {
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
		const	fullPath	= exports.storagePath + '/' + that.uuid;

		fs.writeFile(fullPath, that.data, function (err) {
			if (err) log.warn(logPrefix + 'Could not write file: "' + fullPath + '", err: ' + err.message);
			cb(err);
		});
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

	this.order = {
	};
}

Files.prototype.get = function get(cb) {
	const	fileUuids	= [],
		dbFiles	= {},
		tasks	= [],
		that	= this;

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		const	dbFields	= [];

		let	sql	= 'SELECT f.uuid, f.slug\nFROM larvitfiles_files f\n',
			sqlOrder;

		if (that.filter.operator !== 'or') {
			that.filter.operator	= 'and';
		}

		if (that.order.dir !== 'asc') {
			that.order.dir	= 'desc';
		}

		if (that.filter.operator === 'and' && Object.keys(that.filter.metadata).length !== 0) {
			let	counter	= 0;

			for (const name of Object.keys(that.filter.metadata)) {
				let	values	= that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values	= [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const	value	= values[i];

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
				const	err	= new Error('Can not select on more than a total of 60 metadata key value pairs due to database limitation in joins');
				log.warn(logPrefix + err.message);
				return cb(err);
			}
		}

		if (that.order.column) {
			if (that.order.column.startsWith('metadata:')) {
				const metadataName = that.order.column.substring(9);
				sql += 'LEFT JOIN larvitfiles_files_metadata ordm ON f.uuid = ordm.fileUuid AND ordm.name = ?';
				sqlOrder = 'ORDER BY ordm.value';

				dbFields.push(metadataName);
			} else {
				switch (that.order.column) {
				case 'slug':
					sqlOrder = 'ORDER BY f.slug';
					break;
				}
			}
		}

		if (that.filter.operator === 'or' && Object.keys(that.filter.metadata).length !== 0) {
			sql += 'WHERE f.uuid IN (SELECT fileUuid FROM larvitfiles_files_metadata WHERE ';

			for (const name of Object.keys(that.filter.metadata)) {
				let	values	= that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const	value	= values[i];

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
			sql += sqlOrder + ' ' + that.order.dir + '\n';
		}

		db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= lUtils.formatUuid(rows[i].uuid);

				fileUuids.push(fileUuid);

				dbFiles[fileUuid] = {
					'uuid':	fileUuid,
					'slug':	rows[i].slug,
					'metadata':	{}
				};
			}

			cb();
		});
	});

	// Get all metadata
	tasks.push(function (cb) {
		const	dbFields	= [];

		let	sql	= 'SELECT * FROM larvitfiles_files_metadata WHERE fileUuid IN (';

		if (fileUuids.length === 0) return cb();

		for (let i = 0; fileUuids[i] !== undefined; i ++) {
			const	fileUuidBuf	= lUtils.uuidToBuffer(fileUuids[i]);

			if (fileUuidBuf) {
				sql += '?,';
				dbFields.push(fileUuidBuf);
			}
		}

		sql = sql.substring(0, sql.length - 1) + ')';

		db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= lUtils.formatUuid(rows[i].fileUuid),
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
	const	tasks	= [];

	let	result	= false;

	tasks.push(dataWriter.ready);

	tasks.push(function (cb) {
		db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				return cb(null, false);
			}

			result	= lUtils.formatUuid(rows[0].uuid);

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
