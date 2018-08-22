'use strict';

const topLogPrefix = 'larvitfiles: ./index.js: ';
const DataWriter   = require(__dirname + '/dataWriter.js');
const Intercom     = require('larvitamintercom');
const LUtils       = require('larvitutils');
const mkdirp       = require('mkdirp');

/**
 * Main constructor
 *
 * @param {obj}  options - {db, storagePath, log, exchangeName, intercom}
 * @param {func} cb      - callback
 */
function FileLib(options, cb) {
	const logPrefix = topLogPrefix + 'User() - ';
	const that      = this;

	that.options = options || {};

	if (! that.options.db) {
		throw new Error('Required option db is missing');
	}
	that.db = that.options.db;

	if (! that.options.storagePath) {
		throw new Error('Required option storagePath is missing');
	}
	that.storagePath	= that.options.storagePath;

	if (! that.options.log) {
		const lUtils = new LUtils();

		that.options.log = new lUtils.Log();
	}
	that.log    = that.options.log;
	that.lUtils = new LUtils({'log': that.log});

	if (! that.options.exchangeName) {
		that.options.exchangeName = 'larvitfiles';
	}
	that.exchangeName = that.options.exchangeName;

	if (that.options.prefix) {
		that.prefix	= that.options.prefix;
	} else {
		that.prefix	= '/dbfiles/';
	}

	if (! that.options.mode) {
		that.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
		that.mode = 'noSync';
	} else if (['noSync', 'master', 'slave'].indexOf(that.options.mode) === - 1) {
		const err = new Error('Invalid "mode" option given: "' + that.options.mode + '"');

		that.log.error(logPrefix + err.message);
		throw err;
	} else {
		that.mode = that.options.mode;
	}

	if (! that.options.intercom) {
		that.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
		that.intercom = new Intercom('loopback interface');
	} else {
		that.intercom = that.options.intercom;
	}

	// Make sure the storage path exists
	mkdirp(that.options.storagePath, function (err) {
		if (err) {
			that.log.error(topLogPrefix + 'Could not create folder: "' + that.options.storagePath + '" err: ' + err.message);

			return cb(err);
		} else {
			that.log.debug(topLogPrefix + 'Folder "' + that.options.storagePath + '" created if it did not already exist');
		}

		that.dataWriter	= new DataWriter({
			'storagePath':    that.storagePath,
			'exchangeName':   that.exchangeName,
			'intercom':       that.intercom,
			'mode':           that.mode,
			'log':            that.log,
			'db':             that.db,
			'amsync_host':    that.options.amsync_host    || null,
			'amsync_minPort': that.options.amsync_minPort || null,
			'amsync_maxPort': that.options.amsync_maxPort || null
		}, cb);
	});
}

FileLib.prototype.file = function file(options, cb) {
	const that = this;

	let file;

	options.db          = that.db;
	options.log         = that.log;
	options.dataWriter  = that.dataWriter;
	options.storagePath = that.storagePath;

	file = new exports.File(options, function (err) {
		cb(err, file);
	});
};

FileLib.prototype.files = function files(options) {
	return new FileLib.Files(options);
};

/**
 * Get file Uuid by slug
 *
 * @param {str}  slug - The slug
 * @param {func} cb   - cb(err, uuid) - uuid being a formatted string or boolean false
 */
FileLib.prototype.getFileUuidBySlug = function getFileUuidBySlug(slug, cb) {
	const that = this;

	that.db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug], function (err, rows) {
		if (err) return cb(err);

		if (rows.length === 0) {
			return cb(null, false);
		}

		cb(err, that.lUtils.formatUuid(rows[0].uuid));
	});
};

exports = module.exports = FileLib;
exports.File  = require(__dirname + '/file.js');
exports.Files = require(__dirname + '/files.js');
