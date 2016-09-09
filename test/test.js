'use strict';

const	lFiles	= require(__dirname + '/../index.js'),
	assert	= require('assert'),
	async	= require('async'),
	utils	= require('larvitutils'),
	log	= require('winston'),
	db	= require('larvitdb'),
	fs	= require('fs');

// Set up winston
log.remove(log.transports.Console);

before(function(done) {
	const	tasks	= [];

	// Setup database
	tasks.push(function(cb) {
		let confFile;

		function runDbSetup(confFile) {
			log.verbose('DB config: ' + JSON.stringify(require(confFile)));

			db.setup(require(confFile), function(err) {
				assert( ! err, 'err should be negative');

				cb();
			});
		}

		if (process.argv[3] === undefined) {
			confFile = __dirname + '/../config/db_test.json';
		} else {
			confFile = process.argv[3].split('=')[1];
		}

		log.verbose('DB config file: "' + confFile + '"');

		fs.stat(confFile, function(err) {
			const altConfFile = __dirname + '/../config/' + confFile;

			if (err) {
				log.info('Failed to find config file "' + confFile + '", retrying with "' + altConfFile + '"');

				fs.stat(altConfFile, function(err) {
					if (err) {
						assert( ! err, 'fs.stat failed: ' + err.message);
					}

					if ( ! err) {
						runDbSetup(altConfFile);
					}
				});
			} else {
				runDbSetup(confFile);
			}
		});
	});

	// CHeck for empty db
	tasks.push(function(cb) {
		// Check for empty db
		db.query('SHOW TABLES', function(err, rows) {
			if (err) {
				assert( ! err, 'err should be negative');
				log.error(err);
				process.exit(1);
			}

			if (rows.length) {
				assert.deepEqual(rows.length, 0);
				log.error('Database is not empty. To make a test, you must supply an empty database!');
				process.exit(1);
			}

			lFiles.ready(function(err) {
				assert( ! err, 'err should be negative');

				cb();
			});
		});
	});

	async.series(tasks, done);
});

describe('Files', function() {
	it('Write to db', function(done) {
		fs.readFile(__dirname + '/dummyFile.txt', function(err, data) {
			let file;

			if (err) throw err;

			file = new lFiles.File({
				'slug':	'slug/foo/bar.txt',
				'data':	data,
				'metadata':	{'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}
			}, function(err) {
				if (err) throw err;

				file.save(function(err) {
					if (err) throw err;

					assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));
					assert.deepEqual(file.metadata.metadata1,	['metavalue1']);
					assert.deepEqual(file.metadata.metadata2,	['multiple', 'values']);
					assert.deepEqual(Object.keys(file.metadata).length,	2);
					assert.deepEqual(file.slug,	'slug/foo/bar.txt');
					assert.deepEqual(file.data,	data);

					done();
				});
			});
		});
	});

	it('Fetch from db on slug', function(done) {
		fs.readFile(__dirname + '/dummyFile.txt', function(err, data) {
			let file;

			if (err) throw err;

			file = new lFiles.File({'slug': 'slug/foo/bar.txt'}, function(err) {
				if (err) throw err;

				assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,	['metavalue1']);
				assert.deepEqual(file.metadata.metadata2,	['multiple', 'values']);
				assert.deepEqual(Object.keys(file.metadata).length,	2);
				assert.deepEqual(file.slug,	'slug/foo/bar.txt');
				assert.deepEqual(file.data,	data);

				done();
			});
		});
	});
});

after(function(done) {
	db.removeAllTables(done);
});
