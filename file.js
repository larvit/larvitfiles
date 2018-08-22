'use strict';

const topLogPrefix = 'larvitfiles: ./file.js: ';
const uuidLib      = require('uuid');
const LUtils       = require('larvitutils');
const async        = require('async');
const fs           = require('fs');

/**
 * Single file instance
 *
 * @param   {obj}  options - {dataWriter, log, db, storagePath}
 * @param   {func} cb      - callback
 * @returns {func}         - returns the return from the callback function... thats weird :)
 */
function File(options, cb) {
	const logPrefix = topLogPrefix + 'File() - ';
	const tasks	    = [];
	const that	    = this;

	if (typeof options === 'function' || options === undefined) {
		const log = new (new LUtils()).Log();
		const err = new Error('First parameter must be an object.');

		log.info(logPrefix + err.message);

		return cb(err);
	}

	if (cb === undefined) {
		cb = function () {};
	}

	that.options = options;

	if (! options.dataWriter)  return cb(new Error('Required option dataWriter not set'));
	if (! options.log)         return cb(new Error('Required option log not set'));
	if (! options.db)          return cb(new Error('Required option db not set'));
	if (! options.storagePath) return cb(new Error('Required option storagePath not set'));

	for (const key of Object.keys(options)) {
		that[key] = options[key];
	}

	that.lUtils = new LUtils({'log': that.log});

	// There must always be a metadata object
	that.metadata = {};

	if (options.slug !== undefined && options.slug !== '') {
		tasks.push(function (cb) {
			that.db.query('SELECT uuid, slug FROM larvitfiles_files WHERE slug = ?', [options.slug], function (err, rows) {
				if (err) return cb(err);

				if (rows.length === 0) {
					that.slug = options.slug;

					return cb();
				}

				that.uuid = that.lUtils.formatUuid(rows[0].uuid);
				that.slug = rows[0].slug;
				cb();
			});
		});
	} else if (options.uuid) {
		that.uuid = that.lUtils.formatUuid(options.uuid);
		if (that.uuid === false) {
			const err = new Error('Invalid uuid supplied: "' + options.uuid + '"');

			that.log.info(logPrefix + err.message);

			return cb(err);
		}
	} else {
		const err = new Error('Options must contain either slug or uuid. Neither was provided.');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	tasks.push(function (cb) {
		if (that.uuid === undefined) {
			that.uuid = uuidLib.v4();

			return cb();
		}

		that.loadFromDb(cb);
	});

	tasks.push(function (cb) {
		if (options.slug)     that.slug     = options.slug;
		if (options.data)     that.data     = options.data;
		if (options.metadata) that.metadata = options.metadata;
		cb();
	});

	async.series(tasks, cb);
}

File.prototype.loadFromDb = function loadFromDb(cb) {
	const logPrefix = topLogPrefix + 'loadFromDb() - ';
	const tasks     = [];
	const that      = this;

	if (! that.uuid) {
		const err = new Error('uuid is not defined');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	if (that.storagePath === null) {
		const err = new Error('storagePath not set');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(that.uuid);

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + that.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('SELECT uuid, slug FROM larvitfiles_files WHERE uuid = ?', [uuiBuffer], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				const err = new Error('No file found with uuid: ' + that.lUtils.formatUuid(that.uuid));

				that.log.info(logPrefix + err.message);

				return cb(err);
			}

			that.uuid = that.lUtils.formatUuid(rows[0].uuid);
			that.slug = rows[0].slug;

			cb();
		});
	});

	tasks.push(function (cb) {
		const uuiBuffer = that.lUtils.uuidToBuffer(that.uuid);

		that.metadata = {};

		if (that.uuid === undefined) return cb();

		if (! uuiBuffer) {
			const err = new Error('Not a valid uuid: ' + that.uuid);

			that.log.info(logPrefix + err.message);

			return cb(err);
		}

		that.db.query('SELECT name, value FROM larvitfiles_files_metadata WHERE fileUuid = ?', [uuiBuffer], function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const row = rows[i];

				if (that.metadata[row.name] === undefined) {
					that.metadata[row.name] = [];
				}

				that.metadata[row.name].push(row.value);
			}

			cb();
		});
	});

	tasks.push(function (cb) {
		fs.readFile(that.storagePath + '/' + that.uuid, function (err, data) {
			if (err) that.log.warn(logPrefix + 'Failed to load file data from disk, err: ' + err.message);
			that.data	= data;
			cb(err);
		});
	});

	async.series(tasks, cb);
};

File.prototype.rm = function rm(cb) {
	const logPrefix = topLogPrefix + 'rm() - ';
	const tasks     = [];
	const that      = this;

	if (! that.uuid) {
		const err = new Error('uuid is not defined');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	if (that.storagePath === null) {
		const err = new Error('storagePath not set');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	tasks.push(function (cb) {
		const options = {'exchange': that.dataWriter.exchangeName};
		const message = {};

		message.action      = 'rm';
		message.params      = {};
		message.params.data = {'uuid': that.uuid};

		that.dataWriter.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);
			that.dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		const fullPath = that.storagePath + '/' + that.uuid;

		fs.unlink(fullPath, function (err) {
			if (err) that.log.warn(logPrefix + 'Could not unlink file: "' + fullPath + '", err: ' + err.message);
			cb(err);
		});
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
	const logPrefix = topLogPrefix + 'save() - ';
	const tasks     = [];
	const that      = this;

	if (that.storagePath === null) {
		const err = new Error('storagePath not set');

		that.log.info(logPrefix + err.message);

		return cb(err);
	}

	tasks.push(function (cb) {
		const options = {'exchange': that.dataWriter.exchangeName};
		const message = {};

		message.action      = 'save';
		message.params      = {};
		message.params.data = {
			'uuid':     that.uuid,
			'slug':     that.slug,
			'metadata': that.metadata
		};

		that.dataWriter.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);
			that.dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		const fullPath = that.storagePath + '/' + that.uuid;

		fs.writeFile(fullPath, that.data, function (err) {
			if (err) that.log.warn(logPrefix + 'Could not write file: "' + fullPath + '", err: ' + err.message);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		that.loadFromDb(cb);
	});

	async.series(tasks, cb);
};

exports = module.exports = File;
