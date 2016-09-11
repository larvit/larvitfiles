'use strict';

const	freeport	= require('freeport'),
	lFiles	= require(__dirname + '/../index.js'),
	assert	= require('assert'),
	async	= require('async'),
	utils	= require('larvitutils'),
	http	= require('http'),
	log	= require('winston'),
	db	= require('larvitdb'),
	fs	= require('fs');

// Set up winston
log.remove(log.transports.Console);
/** /log.add(log.transports.Console, {
	'colorize':	true,
	'timestamp':	true,
	'json':	false,
	'level':	'silly'
});/**/

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

	// Check for empty db
	tasks.push(function(cb) {
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
				'slug':	'/slug/foo/bar.txt',
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
					assert.deepEqual(file.slug,	'/slug/foo/bar.txt');
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

			file = new lFiles.File({'slug': '/slug/foo/bar.txt'}, function(err) {
				if (err) throw err;

				assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,	['metavalue1']);
				assert.deepEqual(file.metadata.metadata2,	['multiple', 'values']);
				assert.deepEqual(Object.keys(file.metadata).length,	2);
				assert.deepEqual(file.slug,	'/slug/foo/bar.txt');
				assert.deepEqual(file.data,	data);

				done();
			});
		});
	});

	it('Write another to db', function(done) {
		const file = new lFiles.File({
			'slug':	'boll.txt',
			'data':	new Buffer('buhu'),
			'metadata':	{'metadata1': 'metavalue2', 'other': 'value'}
		}, function(err) {
			if (err) throw err;

			file.save(function(err) {
				if (err) throw err;

				assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,	['metavalue2']);
				assert.deepEqual(file.metadata.other,	['value']);
				assert.deepEqual(Object.keys(file.metadata).length,	2);
				assert.deepEqual(file.slug,	'boll.txt');
				assert.deepEqual(file.data,	new Buffer('buhu'));

				done();
			});
		});
	});

	it('List all files in storage', function(done) {
		const	files	= new lFiles.Files();

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	2);

			for (const fileUuid of Object.keys(result)) {
				assert.deepEqual(fileUuid,	utils.formatUuid(fileUuid));
				assert.deepEqual(result[fileUuid].uuid,	utils.formatUuid(result[fileUuid].uuid));
				assert.deepEqual(Object.keys(result[fileUuid].metadata).length,	2);
				assert.deepEqual(typeof result[fileUuid].slug,	'string');
				assert.deepEqual(result[fileUuid].data,	undefined);
			}

			done();
		});
	});

	it('Write yet another to db', function(done) {
		const file = new lFiles.File({
			'slug':	'fippel.txt',
			'data':	new Buffer('ðđªßð'),
			'metadata':	{'foo': ['bar', 'baz', 'buu'], 'other': ['value', 'andThis']}
		}, function(err) {
			if (err) throw err;

			file.save(function(err) {
				if (err) throw err;

				done();
			});
		});
	});

	it('List files in storage filtered by exact metadata', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.metadata1 = 'metavalue2';

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	1);

			for (const fileUuid of Object.keys(result)) {
				assert.deepEqual(result[fileUuid].uuid,	utils.formatUuid(result[fileUuid].uuid));
				assert.deepEqual(result[fileUuid].metadata.metadata1,	['metavalue2']);
				assert.deepEqual(result[fileUuid].metadata.other,	['value']);
				assert.deepEqual(Object.keys(result[fileUuid].metadata).length,	2);
				assert.deepEqual(result[fileUuid].slug,	'boll.txt');
				assert.deepEqual(result[fileUuid].data,	undefined);
			}

			done();
		});
	});

	it('List files in storage filtered by exact metadata, multiple metadata', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.other	= 'value';
		files.filter.metadata.metadata1	= 'metavalue2';

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	1);

			done();
		});
	});

	it('List files in storage filtered by exact metadata, multiple matches', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.other = 'value';

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	2);

			done();
		});
	});

	it('List files in storage filtered by existing metadata key', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.metadata1 = true;

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	2);

			done();
		});
	});

	it('List files in storage filtered by existing metadata key in combination with exact metadata', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.metadata1	= true;
		files.filter.metadata.other	= 'value';

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	1);

			done();
		});
	});

	it('List files in storage filtered by two metadata values in combination', function(done) {
		const	files	= new lFiles.Files();

		files.filter.metadata.other	= ['value', 'andThis'];

		files.get(function(err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	1);

			done();
		});
	});

	it('Return octet stream on larvitbase controller', function(done) {
		const	tasks	= [];

		let	fileData,
			port;

		process.cwd(__dirname + '/..');

		// Get free port
		tasks.push(function(cb) {
			freeport(function(err, tmpPort) {
				port = tmpPort;
				cb(err);
			});
		});

		// Start server
		tasks.push(function(cb) {
			const lBase = require('larvitbase')({
				'port': port,
				'customRoutes': [{
					'regex':	'^/',
					'controllerName':	'getFile'
				}]
			});

			lBase.on('serverListening', cb);
		});

		// Get file content
		tasks.push(function(cb) {
			fs.readFile(__dirname + '/dummyFile.txt', function(err, data) {
				fileData = data;
				cb(err);
			});
		});

		// Make request to the server
		tasks.push(function(cb) {
			const req = http.request({'port': port, 'path': '/slug/foo/bar.txt'}, function(res) {
				assert.deepEqual(res.statusCode, 200);
				res.on('data', function(chunk) {
					assert.deepEqual(chunk, fileData);
				});
				res.on('end', cb);
			});

			req.end();
		});

		async.series(tasks, done);
	});

	it('should remove a file from storage', function(done) {
		const	tasks	= [];

		tasks.push(function(cb) {
			const file = new lFiles.File({'slug': '/slug/foo/bar.txt'}, function(err) {
				if (err) throw err;

				assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));

				file.rm(cb);
			});
		});

		tasks.push(function(cb) {
			const file = new lFiles.File({'slug': '/slug/foo/bar.txt'}, function(err) {
				if (err) throw err;

				assert.deepEqual(file.uuid,	undefined);

				cb();
			});
		});

		async.series(tasks, done);
	});

	it('should rename a slug on an existing file', function(done) {
		const	tasks	= [];

		let	fileUuid,
			file;

		tasks.push(function(cb) {
			file = new lFiles.File({'slug': 'boll.txt'}, function(err) {
				if (err) throw err;

				fileUuid = file.uuid;

				assert.deepEqual(file.uuid,	utils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,	['metavalue2']);
				assert.deepEqual(file.metadata.other,	['value']);
				assert.deepEqual(Object.keys(file.metadata).length,	2);
				assert.deepEqual(file.slug,	'boll.txt');
				assert.deepEqual(file.data,	new Buffer('buhu'));

				cb();
			});
		});

		tasks.push(function(cb) {
			file.slug = 'somethingNewAndShiny.txt';

			file.save(function(err) {
				if (err) throw err;

				file.slug = 'somethingNewAndShiny.txt';

				cb();
			});
		});

		tasks.push(function(cb) {
			const testFile = new lFiles.File({'uuid': fileUuid}, function(err) {
				if (err) throw err;

				assert.deepEqual(testFile.uuid,	utils.formatUuid(testFile.uuid));
				assert.deepEqual(testFile.metadata.metadata1,	['metavalue2']);
				assert.deepEqual(testFile.metadata.other,	['value']);
				assert.deepEqual(Object.keys(testFile.metadata).length,	2);
				assert.deepEqual(testFile.slug,	'somethingNewAndShiny.txt');
				assert.deepEqual(testFile.data,	new Buffer('buhu'));

				cb();
			});
		});

		async.series(tasks, done);
	});

	it('should fail on renaming if slug exists', function(done) {
		const	tasks	= [];

		let	fileUuid,
			file;

		tasks.push(function(cb) {
			file = new lFiles.File({'slug': 'somethingNewAndShiny.txt'}, function(err) {
				if (err) throw err;

				fileUuid = file.uuid;

				cb();
			});
		});

		tasks.push(function(cb) {
			file.slug = 'fippel.txt';

			file.save(function(err) {
				assert(err instanceof Error, 'Error should be set!');

				// Not written to storage, but should still be the new value
				assert.deepEqual(file.slug, 'fippel.txt');

				cb();
			});
		});

		tasks.push(function(cb) {
			const testFile = new lFiles.File({'uuid': fileUuid}, function(err) {
				if (err) throw err;

				assert.deepEqual(testFile.uuid,	utils.formatUuid(testFile.uuid));
				assert.deepEqual(testFile.metadata.metadata1,	['metavalue2']);
				assert.deepEqual(testFile.metadata.other,	['value']);
				assert.deepEqual(Object.keys(testFile.metadata).length,	2);
				assert.deepEqual(testFile.slug,	'somethingNewAndShiny.txt');
				assert.deepEqual(testFile.data,	new Buffer('buhu'));

				cb();
			});
		});

		async.series(tasks, done);
	});
});

after(function(done) {
	db.removeAllTables(done);
});
