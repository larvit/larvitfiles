'use strict';

const	dbMigration	= require('larvitdbmigration')({'tableName': 'larvitfiles_db_version'}),
	uuidLib	= require('uuid'),
	utils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	dbReady	= false,
	readyRunning	= false;

function File(options, cb) {
	const	tasks	= [],
		that	= this;

	if (typeof options === 'function' || options === undefined) {
		const err = new Error('First parameter must be an object.');
		log.warn('larvitviles: File() - ' + err.message);
		cb(err);
		return;
	}

	if (cb === undefined) {
		cb = function() {};
	}

	// There must always be a metadata object
	that.metadata = {};

	tasks.push(ready);

	if (options.slug) {
		tasks.push(function(cb) {
			db.query('SELECT uuid, slug FROM larvitfiles_files WHERE slug = ?', [options.slug], function(err, rows) {
				if (err) { cb(err); return; }

				if (rows.length === 0) {
					that.slug = options.slug;
					cb();
					return;
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
			log.warn('larvitviles: File() - ' + err.message);
			cb(err);
			return;
		}
	} else {
		const err = new Error('Options must contain either slug or uuid. Neither was provided.');
		log.warn('larvitviles: File() - ' + err.message);
		cb(err);
		return;
	}

	tasks.push(function(cb) {
		if (that.uuid === undefined) {
			cb();
			return;
		}

		that.loadFromDb(cb);
	});

	tasks.push(function(cb) {
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

	tasks.push(ready);

	tasks.push(function(cb) {
		db.query('SELECT uuid, slug, data FROM larvitfiles_files WHERE uuid = ?', [utils.uuidToBuffer(that.uuid)], function(err, rows) {
			if (err) { cb(err); return; }

			if (rows.length === 0) {
				const err = new Error('No file found with uuid: ' + utils.formatUuid(that.uuid));
				log.info('larvitfiles: File() - ' + err.message);
				cb(err);
				return;
			}

			that.uuid	= utils.formatUuid(rows[0].uuid);
			that.slug	= rows[0].slug;
			that.data	= rows[0].data;
			cb();
		});
	});

	tasks.push(function(cb) {
		that.metadata = {};

		if (that.uuid === undefined) {
			cb();
		}

		db.query('SELECT name, value FROM larvitfiles_files_metadata WHERE fileUuid = ?', [utils.uuidToBuffer(that.uuid)], function(err, rows) {
			if (err) { cb(err); return; }

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	row	= rows[i];

				if (that.metadata[row.name] === undefined) {
					that.metadata[row.name] = [];
				}

				that.metadata[row.name].push(row.value);
			}

			cb();
		});
	});

	async.series(tasks, cb);
};

File.prototype.rm = function rm(cb) {
	const	tasks	= [],
		that	= this;

	if (that.uuid === undefined) {
		const err = new Error('No uuid set, can not remove file');
		log.warn('larvitfiles: File() - rm () - ' + err.message);
		cb(err);
		return;
	}

	tasks.push(function(cb) {
		db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?', [utils.uuidToBuffer(that.uuid)], cb);
	});

	tasks.push(function(cb) {
		db.query('DELETE FROM larvitfiles_files WHERE uuid = ?', [utils.uuidToBuffer(that.uuid)], cb);
	});

	tasks.push(function(cb) {
		delete that.uuid;
		delete that.slug;
		delete that.data;
		that.metadata = {};
		cb();
	});

	async.series(tasks, cb);
};

File.prototype.save = function save(cb) {
	const	tasks	= [],
		that	= this;

	if (that.slug === undefined) {
		const err = new Error('Slug must be set to save to database');
		log.warn('larvitfiles: File() - save() - ' + err.message);
		cb(err);
		return;
	}

	tasks.push(function(cb) {
		getFileUuidBySlug(that.slug, function(err, result) {
			if (err) { cb(err); return; }

			if (result !== that.uuid && that.uuid !== undefined) {
				const err = new Error('Slug "' + that.slug + '" is take by another file');
				log.warn('larvitfiles: File() - save() - ' + err.message);
				cb(err);
				return;
			}

			cb();
		});
	});

	tasks.push(function(cb) {
		if (that.uuid === undefined) {
			that.uuid = uuidLib.v4();
		}

		cb();
	});

	tasks.push(function(cb) {
		db.query('REPLACE INTO larvitfiles_files VALUES(?,?,?);', [utils.uuidToBuffer(that.uuid), that.slug, that.data], cb);
	});

	tasks.push(function(cb) {
		db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?;', [utils.uuidToBuffer(that.uuid)], cb);
	});

	tasks.push(function(cb) {
		const	dbFields	= [];

		let	sql = 'INSERT INTO larvitfiles_files_metadata VALUES';

		for (const name of Object.keys(that.metadata)) {
			if ( ! (that.metadata[name] instanceof Array)) {
				that.metadata[name] = [that.metadata[name]];
			}

			for (let i = 0; that.metadata[name][i] !== undefined; i ++) {
				sql += '(?,?,?),';
				dbFields.push(utils.uuidToBuffer(that.uuid));
				dbFields.push(name);
				dbFields.push(that.metadata[name][i]);
			}
		}

		if (dbFields.length === 0) {
			cb();
			return;
		}

		sql = sql.substring(0, sql.length - 1) + ';';
		db.query(sql, dbFields, cb);
	});

	tasks.push(function(cb) {
		that.loadFromDb(cb);
	});

	async.series(tasks, cb);
};

function Files() {
	this.filter = {
		'metadata': {}
	};
}

Files.prototype.get = function get(cb) {
	const	dbFiles	= {},
		tasks	= [],
		that	= this;

	tasks.push(ready);

	tasks.push(function(cb) {
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

		db.query(sql, dbFields, function(err, rows) {
			if (err) { cb(err); return; }

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

	tasks.push(function(cb) {
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

		db.query(sql, dbFields, function(err, rows) {
			if (err) { cb(err); return; }

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

	async.series(tasks, function(err) {
		if (err) { cb(err); return; }

		cb(null, dbFiles);
	});
};

// Checks if database is done migrating
function ready(cb) {
	if (readyRunning === true) {
		setTimeout(function() {
			ready(cb);
		}, 10);
	}

	if (dbReady === true) {
		cb();
		return;
	}

	readyRunning = true;

	dbMigration(function(err) {
		if ( ! err) {
			dbReady = true;
		}

		readyRunning = false;

		cb(err);
	});
}


function getFileUuidBySlug(slug, cb) {
	ready(function(err) {
		if (err) { cb(err); return; }

		db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug], function(err, rows) {
			if (err) { cb(err); return; }

			if (rows.length === 0) {
				cb(null, false);
				return;
			}

			cb(null, utils.formatUuid(rows[0].uuid));
		});
	});
}

exports.File	= File;
exports.Files	= Files;
exports.getFileUuidBySlug	= getFileUuidBySlug;
exports.ready	= ready;
