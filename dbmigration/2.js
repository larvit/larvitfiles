'use strict';

const	logPrefix	= 'larvitfiles: ./dbmigration/2.js: ',
	lFiles	= require(__dirname + '/../index.js'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	fs	= require('fs');

exports = module.exports = function (cb) {
	const	tasks	= [],
		db	= this.options.dbDriver;

	let files;

	if (lFiles.storagePath === null) {
		const e = new Error('storagePath not set on larvitfiles');
		log.warn(logPrefix + e.message);
		throw e;
	}

	if ( ! fs.existsSync(lFiles.storagePath)) {
		log.info(logPrefix + 'storagePath "' + lFiles.storagePath + '" does not exist, creating');
		fs.mkdir(lsFiles.storagePath, cb);
	}

	// get list of slugs and uuids
	tasks.push(function (cb) {
		db.query('SELECT uuid, slug FROM larvitfiles_files', function (err, rows) {
			files = rows;
			cb(err);
		});
	});

	// write files to disk and save type in db
	tasks.push(function (cb) {
		const tasks = [];

		for (const file of files) {
			tasks.push(function (cb) {
				db.query('SELECT data FROM larvitfiles_files WHERE uuid = ?', [lUtils.uuidToBuffer(file.uuid)], function (err, result) {
					if (err) return cb(err);

					if (result.length === 0) {
						log.warn(logPrefix + 'Could not find file with uuid "' + lUtils.formatUuid(file.uuid) + '"');
						return cb();
					}

					fs.writeFile(lFiles.storagePath + '/' + lUtils.formatUuid(file.uuid), result[0].data, cb);
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
