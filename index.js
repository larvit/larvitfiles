'use strict';

const	topLogPrefix	= 'larvitfiles: ./index.js: ',
	DataWriter	= require(__dirname + '/dataWriter.js'),
	Intercom	= require('larvitamintercom'),
	lUtils	= new (require('larvitutils'))(),
	mkdirp	= require('mkdirp');

function FileLib(options, cb) {
	const logPrefix = topLogPrefix + 'User() - ',
		that = this;

	that.options	= options || {};

	if ( ! that.options.db) {
		throw new Error('Required option db is missing');
	}
	that.db	= that.options.db;

	if ( ! that.options.storagePath) {
		throw new Error('Required option storagePath is missing');
	}
	that.storagePath	= that.options.storagePath;

	if ( ! that.options.log) {
		that.log	= new lUtils.Log();
	} else {
		that.log	= options.log;
	}

	if ( ! that.options.exchangeName) {
		that.exchangeName	= 'larvitfiles';
	} else {
		that.exchangeName	= that.options.exchangeName;
	}

	if (that.options.prefix) {
		that.prefix	= that.options.prefix;
	} else {
		that.prefix	= '/dbfiles/';
	}

	if ( ! that.options.mode) {
		that.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
		that.mode	= 'noSync';
	} else if (['noSync', 'master', 'slave'].indexOf(that.options.mode) === - 1) {
		const	err	= new Error('Invalid "mode" option given: "' + that.options.mode + '"');
		that.log.error(logPrefix + err.message);
		throw err;
	} else {
		that.mode = that.options.mode;
	}

	if ( ! that.options.intercom) {
		that.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
		that.intercom	= new Intercom('loopback interface');
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
			'storagePath': that.storagePath,
			'exchangeName':	that.exchangeName,
			'intercom':	that.intercom,
			'mode':	that.mode,
			'log':	that.log,
			'db':	that.db,
			'amsync_host':	that.options.amsync_host || null,
			'amsync_minPort':	that.options.amsync_minPort || null,
			'amsync_maxPort':	that.options.amsync_maxPort || null
		}, cb);
	});
}

FileLib.prototype.file = function file(options, cb) {
	const that	= this;

	let file;

	options.db	= that.db;
	options.log	= that.log;
	options.dataWriter	= that.dataWriter;
	options.storagePath	= that.storagePath;

	 file = new exports.File(options, function (err) {
		 cb(err, file);
	 });
};

FileLib.prototype.files = function files(options) {
	return new FileLib.files(options);
};

/**
 * Get file Uuid by slug
 *
 * @param str slug
 * @param func cb(err, uuid) - uuid being a formatted string or boolean false
 */
FileLib.prototype.getFileUuidBySlug = function getFileUuidBySlug(slug, cb) {
	db.query('SELECT uuid FROM larvitfiles_files WHERE slug = ?', [slug], function (err, rows) {
		if (err) return cb(err);

		if (rows.length === 0) {
			return cb(null, false);
		}

		cb(err, lUtils.formatUuid(rows[0].uuid));
	});
};

exports = module.exports = FileLib;
exports.File	= require(__dirname + '/file.js');
exports.Files	= require(__dirname + '/files.js');