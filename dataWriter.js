'use strict';

const EventEmitter = require('events').EventEmitter;
const topLogPrefix = 'larvitfiles: dataWriter.js: ';
const DbMigration  = require('larvitdbmigration');
const LUtils       = require('larvitutils');
const amsync       = require('larvitamsync');
const async        = require('async');

/**
 * Datawriter
 *
 * @param {obj}  options - {log, db, intercom, exchangeName}
 * @param {func} cb      - callback
 */
function DataWriter(options, cb) {
	const that = this;

	that.readyInProgress = false;
	that.isReady         = false;

	for (const key of Object.keys(options)) {
		that[key] = options[key];
	}

	if (! that.log) {
		that.log = new (new LUtils()).Log();
	}

	that.emitter = new EventEmitter();
	that.lUtils  = new LUtils({'log': that.log});

	that.listenToQueue(cb);
}

DataWriter.prototype.listenToQueue = function listenToQueue(retries, cb) {
	const logPrefix = topLogPrefix + 'listenToQueue() - ';
	const that      = this;
	const options   = {'exchange': that.exchangeName};
	const tasks     = [];

	let listenMethod;

	if (typeof retries === 'function') {
		cb      = retries;
		retries = 0;
	}

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (retries === undefined) {
		retries = 0;
	}

	tasks.push(function (cb) {
		if (that.mode === 'master') {
			listenMethod      = 'consume';
			options.exclusive = true; // It is important no other client tries to sneak
			// out messages from us, and we want "consume"
			// since we want the queue to persist even if this
			// minion goes offline.
		} else if (that.mode === 'slave' || that.mode === 'noSync') {
			listenMethod = 'subscribe';
		} else {
			const err = new Error('Invalid that.mode. Must be either "master", "slave" or "noSync"');

			that.log.error(logPrefix + err.message);

			return cb(err);
		}

		that.log.info(logPrefix + 'listenMethod: ' + listenMethod);

		cb();
	});


	tasks.push(function (cb) {
		that.intercom.ready(cb);
	});

	tasks.push(function (cb) {
		that.intercom.ready(function (err) {
			if (err) {
				that.log.error(logPrefix + 'intercom.ready() err: ' + err.message);

				return;
			}

			that.intercom[listenMethod](options, function (message, ack, deliveryTag) {
				that.ready(function (err) {
					ack(err); // Ack first, if something goes wrong we log it and handle it manually

					if (err) {
						that.log.error(logPrefix + 'intercom.' + listenMethod + '() - that.ready() returned err: ' + err.message);

						return;
					}

					if (typeof message !== 'object') {
						that.log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');

						return;
					}

					if (typeof that[message.action] === 'function') {
						that[message.action](message.params, deliveryTag, message.uuid);
					} else {
						that.log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
					}
				});
			}, cb);
		});
	});

	// Run the ready function
	tasks.push(function (cb) {
		that.ready(cb);
	});

	async.series(tasks, cb);
};

// This is ran before each incoming message on the queue is handeled
DataWriter.prototype.ready = function ready(retries, cb) {
	const logPrefix = topLogPrefix + 'ready() - ';
	const that      = this;
	const tasks     = [];

	if (typeof retries === 'function') {
		cb      = retries;
		retries = 0;
	}

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (retries === undefined) {
		retries = 0;
	}

	if (that.isReady === true) return cb();

	if (that.readyInProgress === true) {
		that.emitter.on('ready', cb);

		return;
	}

	that.readyInProgress = true;

	tasks.push(function (cb) {
		if (that.mode === 'slave') {
			that.log.verbose(logPrefix + 'that.mode: "' + that.mode + '", so read');
			new amsync.SyncClient({
				'exchange': that.exchangeName + '_dataDump',
				'intercom': that.intercom
			}, cb);
		} else {
			cb();
		}
	});

	// Migrate database
	tasks.push(function (cb) {
		const options = {};

		let dbMigration;

		options.dbType               = 'mariadb';
		options.dbDriver             = that.db;
		options.tableName            = 'larvitfiles_db_version';
		options.migrationScriptsPath = __dirname + '/dbmigration';
		options.storagePath          = that.storagePath;
		options.log                  = that.log;
		dbMigration                  = new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				that.log.error(logPrefix + 'Database error: ' + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) return cb(err);

		that.isReady = true;
		that.emitter.emit('ready');

		if (that.mode === 'master') {
			that.runDumpServer(cb);
		} else {
			cb();
		}
	});
};

DataWriter.prototype.rm = function rm(params, deliveryTag, msgUuid) {
	const logPrefix = topLogPrefix + 'rm() - ';
	const that      = this;
	const options   = params.data;
	const tasks     = [];

	if (options.uuid === undefined) {
		const err = new Error('No uuid set, can not remove file');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(options.uuid);

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + options.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?', [uuiBuffer], cb);
	});

	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(options.uuid);

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + options.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('DELETE FROM larvitfiles_files WHERE uuid = ?', [uuiBuffer], cb);
	});

	async.series(tasks, function (err) {
		that.emitter.emit(msgUuid, err);
	});
};

DataWriter.prototype.runDumpServer = function runDumpServer(cb) {
	const that = this;
	const options = {
		'exchange': that.exchangeName + '_dataDump',
		'host':     that.amsync ? that.amsync.host : null,
		'minPort':  that.amsync ? that.amsync.minPort : null,
		'maxPort':  that.amsync ? that.amsync.maxPort : null
	};
	const args = [];

	if (that.db.conf.host) {
		args.push('-h');
		args.push(that.db.conf.host);
	}

	args.push('-u');
	args.push(that.db.conf.user);

	if (that.db.conf.password) {
		args.push('-p' + that.db.conf.password);
	}

	args.push('--single-transaction');
	args.push('--hex-blob');
	args.push(that.db.conf.database);

	// Tables
	args.push('larvitfiles_db_version');
	args.push('larvitfiles_files');
	args.push('larvitfiles_files_metadata');

	options.dataDumpCmd = {
		'command': 'mysqldump',
		'args':    args
	};

	options['Content-Type'] = 'application/sql';
	options.intercom        = that.intercom;

	new amsync.SyncServer(options, cb);
};

DataWriter.prototype.save = function save(params, deliveryTag, msgUuid) {
	const logPrefix = topLogPrefix + 'save() - ';
	const that      = this;
	const options   = params.data;
	const tasks     = [];

	if (options.slug === undefined) {
		const err = new Error('Slug must be set to save to database');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	// Check validity of slug and uuid
	tasks.push(function (cb) {
		that.db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [options.slug], function (err, rows) {
			let uuid = null;

			if (err) return cb(err);

			if (rows.length === 1) {
				uuid = that.lUtils.formatUuid(rows[0].uuid);
			}

			if (uuid !== null && uuid !== options.uuid) {
				const err = new Error('Slug "' + options.slug + '" is take by another file');

				that.log.info(logPrefix + err.message);

				return cb(err);
			}

			cb();
		});
	});

	// Insert into files
	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(options.uuid);

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + options.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('INSERT INTO larvitfiles_files VALUES(?,?) ON DUPLICATE KEY UPDATE slug = VALUES(slug)', [uuiBuffer, options.slug], cb);
	});

	// Delete metadata
	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(options.uuid);

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + options.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?;', [uuiBuffer], cb);
	});

	// Insert metadata
	tasks.push(function (cb) {
		const dbFields = [];

		let sql = 'INSERT INTO larvitfiles_files_metadata VALUES';

		for (const name of Object.keys(options.metadata)) {
			if (! (options.metadata[name] instanceof Array)) {
				options.metadata[name] = [options.metadata[name]];
			}

			for (let i = 0; options.metadata[name][i] !== undefined; i ++) {
				const uuiBuffer = that.lUtils.uuidToBuffer(options.uuid);

				if (uuiBuffer) {
					sql += '(?,?,?),';
					dbFields.push(uuiBuffer);
					dbFields.push(name);
					dbFields.push(options.metadata[name][i]);
				} else {
					that.log.info(logPrefix + 'Invalid uuid, skipping');
				}
			}
		}

		if (dbFields.length === 0) {
			return cb();
		}

		sql = sql.substring(0, sql.length - 1) + ';';
		that.db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		that.emitter.emit(msgUuid, err);
	});
};

exports = module.exports = DataWriter;
