'use strict';

const freeport    = require('freeport');
const FileLib     = require(__dirname + '/../index.js');
const assert      = require('assert');
const async       = require('async');
const LUtils      = require('larvitutils');
const http        = require('http');
const App         = require('larvitbase');
const log         = new (new LUtils()).Log('warning');
const lUtils      = new LUtils({'log': log});
const db          = require('larvitdb');
const fs          = require('fs');
const tmpdir      = require('os').tmpdir();
const storagePath = tmpdir + '/larvitfiles';

let filesLib;

before(function (done) {
	const tasks = [];

	let cfg;

	this.timeout(10000);

	// Run DB Setup
	tasks.push(function (cb) {
		let confFile;

		if (process.env.DBCONFFILE === undefined) {
			confFile = __dirname + '/../config/db_test.json';
		} else {
			confFile = process.env.DBCONFFILE;
		}

		log.verbose('DB config file: "' + confFile + '"');

		// First look for absolute path
		fs.stat(confFile, function (err) {
			if (err) {
				// Then look for this string in the config folder
				confFile = __dirname + '/../config/' + confFile;
				fs.stat(confFile, function (err) {
					if (err) throw err;
					log.verbose('DB config: ' + JSON.stringify(require(confFile)));
					cfg = require(confFile);
					cb();
				});

				return;
			}

			log.verbose('DB config: ' + JSON.stringify(require(confFile)));
			cfg = require(confFile);
			cb();
		});
	});

	tasks.push(function (cb) {
		cfg.log = log;
		db.setup(cfg, cb);
	});

	// Check for empty db
	tasks.push(function (cb) {
		db.query('SHOW TABLES', function (err, rows) {
			if (err) throw err;

			if (rows.length) {
				throw new Error('Database is not empty. To make a test, you must supply an empty database!');
			}

			cb();
		});
	});

	// Set lib
	tasks.push(function (cb) {
		filesLib = new FileLib({
			'mode':        'noSync',
			'log':         log,
			'db':          db,
			'storagePath': storagePath
		}, cb);
	});

	async.series(tasks, function (err) {
		if (err) throw err;
		done(err);
	});
});

after(function (done) {
	const tasks = [];

	// Clear db
	tasks.push(function (cb) {
		db.removeAllTables(cb);
	});

	// Clear test files
	tasks.push(function (cb) {
		const tasks = [];

		for (const file of fs.readdirSync(storagePath)) {
			tasks.push(function (cb) {
				fs.unlink(storagePath + '/' + file, cb);
			});
		}

		async.series(tasks, cb);
	});

	async.series(tasks, done);
});

describe('Files', function () {
	it('Write to db', function (done) {
		fs.readFile(__dirname + '/dummyFile.txt', function (err, data) {
			if (err) throw err;

			filesLib.file({
				'slug':     'slug/foo/bar.txt',
				'data':     data,
				'metadata': {'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}
			}, function (err, file) {
				if (err) throw err;

				file.save(function (err) {
					if (err) throw err;

					assert.deepEqual(file.uuid,                         lUtils.formatUuid(file.uuid));
					assert.deepEqual(file.metadata.metadata1,           ['metavalue1']);
					assert.deepEqual(file.metadata.metadata2,           ['multiple', 'values']);
					assert.deepEqual(Object.keys(file.metadata).length, 2);
					assert.deepEqual(file.slug,                         'slug/foo/bar.txt');

					done();
				});
			});
		});
	});

	it('Fetch from db on slug', function (done) {
		fs.readFile(__dirname + '/dummyFile.txt', function (err, data) {
			if (err) throw err;

			filesLib.file({'slug': 'slug/foo/bar.txt'}, function (err, file) {
				if (err) throw err;

				assert.deepEqual(file.uuid,                         lUtils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,           ['metavalue1']);
				assert.deepEqual(file.metadata.metadata2,           ['multiple', 'values']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug,                         'slug/foo/bar.txt');
				assert.deepEqual(file.data,                         data);

				done();
			});
		});
	});

	it('Write another to db', function (done) {
		filesLib.file({
			'slug':     'boll.txt',
			'data':     Buffer.from('buhu'),
			'metadata': {'metadata1': 'metavalue2', 'other': 'value'}
		}, function (err, file) {
			if (err) throw err;

			file.save(function (err) {
				if (err) throw err;

				assert.strictEqual(file.uuid,                       lUtils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,           ['metavalue2']);
				assert.deepEqual(file.metadata.other,               ['value']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug,                         'boll.txt');
				assert.deepEqual(file.data,                         Buffer.from('buhu'));

				done();
			});
		});
	});

	it('List all files in storage', function (done) {
		new FileLib.Files({'db': db, 'log': log}).get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length,	2);

			for (const fileUuid of Object.keys(result)) {
				assert.deepEqual(fileUuid,                                      lUtils.formatUuid(fileUuid));
				assert.deepEqual(result[fileUuid].uuid,                         lUtils.formatUuid(result[fileUuid].uuid));
				assert.deepEqual(Object.keys(result[fileUuid].metadata).length, 2);
				assert.deepEqual(typeof result[fileUuid].slug,                  'string');
				assert.deepEqual(result[fileUuid].data,                         undefined);
			}

			done();
		});
	});

	it('Write yet another to db', function (done) {
		filesLib.file({
			'slug':     'fippel.txt',
			'data':     Buffer.from('ðđªßð'),
			'metadata': {'foo': ['bar', 'baz', 'buu'], 'other': ['value', 'andThis']}
		}, function (err, file) {
			if (err) throw err;

			file.save(function (err) {
				if (err) throw err;

				done();
			});
		});
	});

	it('List files in storage filtered by exact metadata', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.metadata1 = 'metavalue2';

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 1);

			for (const fileUuid of Object.keys(result)) {
				assert.deepEqual(result[fileUuid].uuid,                         lUtils.formatUuid(result[fileUuid].uuid));
				assert.deepEqual(result[fileUuid].metadata.metadata1,           ['metavalue2']);
				assert.deepEqual(result[fileUuid].metadata.other,               ['value']);
				assert.deepEqual(Object.keys(result[fileUuid].metadata).length, 2);
				assert.deepEqual(result[fileUuid].slug,                         'boll.txt');
				assert.deepEqual(result[fileUuid].data,                         undefined);
			}

			done();
		});
	});

	it('List files in storage filtered by exact metadata, multiple metadata', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.other     = 'value';
		files.filter.metadata.metadata1 = 'metavalue2';

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 1);

			done();
		});
	});

	it('List files in storage filtered by exact metadata, multiple matches', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.other = 'value';

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 2);

			done();
		});
	});

	it('List files in storage filtered by existing metadata key', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.metadata1 = true;

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 2);

			done();
		});
	});

	it('List files in storage filtered by existing metadata key in combination with exact metadata', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.metadata1 = true;
		files.filter.metadata.other     = 'value';

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 1);

			done();
		});
	});

	it('List files in storage filtered by two metadata values in combination', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.other = ['value', 'andThis'];

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 1);

			done();
		});
	});

	it('List files in storage filtered by exact metadata, multiple metadata and the or operator', function (done) {
		const files = new FileLib.Files({'db': db, 'log': log});

		files.filter.metadata.metadata1 = 'metavalue2';
		files.filter.metadata.foo       = 'baz';
		files.filter.operator           = 'or';

		files.get(function (err, result) {
			if (err) throw err;

			assert.deepEqual(Object.keys(result).length, 2);

			done();
		});
	});

	it('Return octet stream on larvitbase controller', function (done) {
		const tasks = [];

		let fileData;
		let port;

		process.cwd(__dirname + '/..');

		// Get free port
		tasks.push(function (cb) {
			freeport(function (err, tmpPort) {
				port = tmpPort;
				cb(err);
			});
		});

		// Start server
		tasks.push(function (cb) {
			let app = new App({
				'log':         log,
				'httpOptions': port,
				'middlewares': [
					function (req, res, cb) {
						req.fileLib = filesLib;
						cb(null, req, res);
					},
					require(__dirname + '/../controllers/getFile.js')
				]
			});

			app.start(cb);
		});

		// Get file content
		tasks.push(function (cb) {
			fs.readFile(__dirname + '/dummyFile.txt', function (err, data) {
				fileData = data;
				cb(err);
			});
		});

		// Make request to the server
		tasks.push(function (cb) {
			const req = http.request({'port': port, 'path': filesLib.prefix + 'slug/foo/bar.txt'}, function (res) {
				assert.deepEqual(res.statusCode, 200);
				res.on('data', function (chunk) {
					assert.deepEqual(chunk, fileData);
				});
				res.on('end', cb);
			});

			req.end();
		});

		async.series(tasks, done);
	});

	it('should remove a file from storage', function (done) {
		const tasks = [];

		tasks.push(function (cb) {
			filesLib.file({'slug': 'slug/foo/bar.txt'}, function (err, file) {
				if (err) throw err;

				assert.deepEqual(file.uuid, lUtils.formatUuid(file.uuid));

				file.rm(cb);
			});
		});

		tasks.push(function (cb) {
			db.query('SELECT * FROM larvitfiles_files WHERE slug = \'slug/foo/bar.txt\'', function (err, rows) {
				if (err) throw err;

				assert.strictEqual(rows.length, 0);
				cb();
			});
		});

		async.series(tasks, done);
	});

	it('should rename a slug on an existing file', function (done) {
		const tasks = [];

		let fileUuid;
		let file;

		tasks.push(function (cb) {
			filesLib.file({'slug': 'boll.txt'}, function (err, filen) {
				if (err) throw err;

				file     = filen;
				fileUuid = file.uuid;

				assert.deepEqual(file.uuid,                         lUtils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1,           ['metavalue2']);
				assert.deepEqual(file.metadata.other,               ['value']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug,                         'boll.txt');
				assert.deepEqual(file.data,                         Buffer.from('buhu'));

				cb();
			});
		});

		tasks.push(function (cb) {
			file.slug = 'somethingNewAndShiny.txt';

			file.save(function (err) {
				if (err) throw err;

				file.slug = 'somethingNewAndShiny.txt';

				cb();
			});
		});

		tasks.push(function (cb) {
			filesLib.file({'uuid': fileUuid}, function (err, testFile) {
				if (err) throw err;

				assert.deepEqual(testFile.uuid,                         lUtils.formatUuid(testFile.uuid));
				assert.deepEqual(testFile.metadata.metadata1,           ['metavalue2']);
				assert.deepEqual(testFile.metadata.other,               ['value']);
				assert.deepEqual(Object.keys(testFile.metadata).length, 2);
				assert.deepEqual(testFile.slug,                         'somethingNewAndShiny.txt');
				assert.deepEqual(testFile.data,                         Buffer.from('buhu'));

				cb();
			});
		});

		async.series(tasks, done);
	});

	it('should fail on renaming if slug exists', function (done) {
		const	tasks	= [];

		let fileUuid;
		let file;

		tasks.push(function (cb) {
			filesLib.file({'slug': 'somethingNewAndShiny.txt'}, function (err, testFile) {
				if (err) throw err;

				file     = testFile;
				fileUuid = file.uuid;

				cb();
			});
		});

		tasks.push(function (cb) {
			file.slug = 'fippel.txt';

			file.save(function (err) {
				assert(err instanceof Error, 'Error should be set!');

				// Not written to storage, but should still be the new value
				assert.deepEqual(file.slug, 'fippel.txt');

				cb();
			});
		});

		tasks.push(function (cb) {
			filesLib.file({'uuid': fileUuid}, function (err, testFile) {
				if (err) throw err;

				assert.deepEqual(testFile.uuid,                         lUtils.formatUuid(testFile.uuid));
				assert.deepEqual(testFile.metadata.metadata1,           ['metavalue2']);
				assert.deepEqual(testFile.metadata.other,               ['value']);
				assert.deepEqual(Object.keys(testFile.metadata).length, 2);
				assert.deepEqual(testFile.slug,                         'somethingNewAndShiny.txt');
				assert.deepEqual(testFile.data,                         Buffer.from('buhu'));

				cb();
			});
		});

		async.series(tasks, done);
	});
});
