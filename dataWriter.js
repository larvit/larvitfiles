'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	topLogPrefix	= 'larvitfiles: dataWriter.js: ',
	DbMigration	= require('larvitdbmigration'),
	lUtils	= require('larvitutils'),
	uuidLib = require('uuid'),
	amsync	= require('larvitamsync'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false,
	intercom;

function listenToQueue(retries, cb) {
	const	logPrefix	= topLogPrefix + 'listenToQueue() - ',
		options	= {'exchange': exports.exchangeName};

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (retries === undefined) {
		retries = 0;
	}

	if (exports.mode === 'master') {
		listenMethod	= 'consume';
		options.exclusive	= true;	// It is important no other client tries to sneak
		// out messages from us, and we want "consume"
		// since we want the queue to persist even if this
		// minion goes offline.
	} else if (exports.mode === 'slave' || exports.mode === 'noSync') {
		listenMethod = 'subscribe';
	} else {
		const	err	= new Error('Invalid exports.mode. Must be either "master", "slave" or "noSync"');
		log.error(logPrefix + err.message);
		return cb(err);
	}

	intercom	= lUtils.instances.intercom;

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 500) {
		retries ++;
		setTimeout(function () {
			listenToQueue(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		log.error(logPrefix + 'Intercom is not set!');
		return;
	}

	log.info(logPrefix + 'listenMethod: ' + listenMethod);

	intercom.ready(function (err) {
		if (err) {
			log.error(logPrefix + 'intercom.ready() err: ' + err.message);
			return;
		}

		intercom[listenMethod](options, function (message, ack, deliveryTag) {
			exports.ready(function (err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof exports[message.action] === 'function') {
					exports[message.action](message.params, deliveryTag, message.uuid);
				} else {
					log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			});
		}, ready);
	});
}
// Run listenToQueue as soon as all I/O is done, this makes sure the exports.mode can be set
// by the application before listening commences
setImmediate(listenToQueue);

// This is ran before each incoming message on the queue is handeled
function ready(retries, cb) {
	const	logPrefix	= topLogPrefix + 'ready() - ',
		tasks	= [];

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb	= function (){};
	}

	if (retries === undefined) {
		retries	= 0;
	}

	if (isReady === true) return cb();

	if (readyInProgress === true) {
		eventEmitter.on('ready', cb);
		return;
	}

	intercom	= require('larvitutils').instances.intercom;

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 10) {
		retries ++;
		setTimeout(function () {
			ready(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		log.error(logPrefix + 'Intercom is not set!');
		return;
	}

	readyInProgress = true;

	if (exports.mode === 'both' || exports.mode === 'slave') {
		log.verbose(logPrefix + 'exports.mode: "' + exports.mode + '", so read');

		tasks.push(function (cb) {
			amsync.mariadb({'exchange': exports.exchangeName + '_dataDump'}, cb);
		});
	}

	// Migrate database
	tasks.push(function (cb) {
		const	options	= {};

		let	dbMigration;

		options.dbType	= 'larvitdb';
		options.dbDriver	= db;
		options.tableName	= 'larvitfiles_db_version';
		options.migrationScriptsPath	= __dirname + '/dbmigration';
		dbMigration	= new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				log.error(logPrefix + 'Database error: ' + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) return;

		isReady	= true;
		eventEmitter.emit('ready');

		if (exports.mode === 'both' || exports.mode === 'master') {
			runDumpServer(cb);
		} else {
			cb();
		}
	});
}

function rm(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'rm() - ',
		options	= params.data,
		tasks	= [];

	if (options.uuid === undefined) {
		const err = new Error('No uuid set, can not remove file');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	tasks.push(function (cb) {
		db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	tasks.push(function (cb) {
		db.query('DELETE FROM larvitfiles_files WHERE uuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
};

function runDumpServer(cb) {
	const	options	= {'exchange': exports.exchangeName + '_dataDump'},
		args	= [];

	if (db.conf.host) {
		args.push('-h');
		args.push(db.conf.host);
	}

	args.push('-u');
	args.push(db.conf.user);

	if (db.conf.password) {
		args.push('-p' + db.conf.password);
	}

	args.push('--single-transaction');
	args.push('--hex-blob');
	args.push(db.conf.database);

	// Tables
	args.push('larvitfiles_db_version');
	args.push('larvitfiles_files');
	args.push('larvitfiles_files_metadata');

	options.dataDumpCmd = {
		'command':	'mysqldump',
		'args':	args
	};

	options['Content-Type'] = 'application/sql';

	new amsync.SyncServer(options, cb);
}

function save(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'save() - ',
		options	= params.data,
		tasks	= [];

	if (options.slug === undefined) {
		const err = new Error('Slug must be set to save to database');
		log.info(logPrefix + err.message);
		return cb(err);
	}

	// check validity of slug and uuid
	tasks.push(function (cb) {
		db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [options.slug], function (err, rows) {
			let uuid = null;

			if (err) return cb(err);

			if (rows.length === 1) {
				uuid = lUtils.formatUuid(rows[0].uuid);
			}

			if (uuid !== null && uuid !== options.uuid) {
				const err = new Error('Slug "' + options.slug + '" is take by another file');
				log.warn(logPrefix + err.message);
				return cb(err);
			}

			if (options.uuid === undefined) {
				options.uuid = uuidLib.v4();
			}

			cb();
		});
	});

	// insert into files
	tasks.push(function (cb) {
		const	dbFields	= [lUtils.uuidToBuffer(options.uuid), options.slug, options.data, options.slug, options.data],
			sql	= 'INSERT INTO larvitfiles_files VALUES(?,?,?) ON DUPLICATE KEY UPDATE slug = ?, data = ?;';

		db.query(sql, dbFields, cb);
	});

	// delete metadata
	tasks.push(function (cb) {
		db.query('DELETE FROM larvitfiles_files_metadata WHERE fileUuid = ?;', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	//insert metadata
	tasks.push(function (cb) {
		const	dbFields	= [];

		let	sql = 'INSERT INTO larvitfiles_files_metadata VALUES';

		for (const name of Object.keys(options.metadata)) {
			if ( ! (options.metadata[name] instanceof Array)) {
				options.metadata[name] = [options.metadata[name]];
			}

			for (let i = 0; options.metadata[name][i] !== undefined; i ++) {
				sql += '(?,?,?),';
				dbFields.push(lUtils.uuidToBuffer(options.uuid));
				dbFields.push(name);
				dbFields.push(options.metadata[name][i]);
			}
		}

		if (dbFields.length === 0) {
			return cb();
		}

		sql = sql.substring(0, sql.length - 1) + ';';
		db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
};

exports.emitter	= new EventEmitter();
exports.exchangeName	= 'larvitfiles';
exports.ready	= ready;
exports.rm	= rm;
exports.save	= save;
