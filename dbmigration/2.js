'use strict';

const	logPrefix	= 'larvitfiles: ./dbmigration/2.js: ',
	filesLib	= require(__dirname + '/../index.js'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	fs	= require('fs');

exports = module.exports = function (cb) {
	const	tasks	= [],
		db	= this.options.dbDriver;

	let	files;

	if (filesLib.storagePath === null) {
		const	err	= new Error('storagePath not set on larvitfiles');
		log.warn(logPrefix + err.message);
		throw err;
	}

	if ( ! fs.existsSync(filesLib.storagePath)) {
		tasks.push(function (cb) {
			log.info(logPrefix + 'storagePath "' + filesLib.storagePath + '" does not exist, creating');
			fs.mkdir(filesLib.storagePath, cb);
		});
	}

	// Get list of slugs and uuids
	tasks.push(function (cb) {
		db.query('SELECT uuid, slug FROM larvitfiles_files', function (err, rows) {
			files	= rows;
			cb(err);
		});
	});

	// Write files to disk and save type in db
	tasks.push(function (cb) {
		const tasks = [];

		for (const file of files) {
			tasks.push(function (cb) {
				db.query('SELECT data FROM larvitfiles_files WHERE uuid = ?', file.uuid, function (err, result) {
					if (err) return cb(err);

					if (result.length === 0) {
						log.warn(logPrefix + 'Could not find file with uuid "' + Utils.formatUuid(file.uuid) + '"');
						return cb();
					}

					fs.writeFile(filesLib.storagePath + '/' + lUtils.formatUuid(file.uuid), result[0].data, cb);
				});
			});
		}

		async.parallelLimit(tasks, 5, cb);
	});

	tasks.push(function (cb) {
		db.query('ALTER TABLE larvitfiles_files DROP COLUMN data', cb);
	});

	async.series(tasks, cb);
};
