'use strict';

const FileLib = require(__dirname + '/../index.js');
const assert = require('assert');
const async = require('async');
const LUtils = require('larvitutils');
const log = new (new LUtils()).Log('none');
const lUtils = new LUtils({log: log});
const db = require('larvitdb');
const fs = require('fs');
const tmpdir = require('os').tmpdir();
const storagePath = tmpdir + '/larvitfiles';

let fileLib;

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
		fileLib = new FileLib({log, db, storagePath});
		cb();
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

			fileLib.save({
				slug: 'slug/foo/bar.txt',
				data: data,
				metadata: {metadata1: 'metavalue1', metadata2: ['multiple', 'values']}
			}).then((result) => {
				assert.notStrictEqual(result.uuid, undefined);
				assert.deepEqual(result.metadata.metadata1, ['metavalue1']);
				assert.deepEqual(result.metadata.metadata2, ['multiple', 'values']);
				assert.deepEqual(Object.keys(result.metadata).length, 2);
				assert.deepEqual(result.slug, 'slug/foo/bar.txt');

				done();
			})
				.catch(err => {
					done(err);
				});
		});
	});

	it('Fetch from db on slug', function (done) {
		fs.readFile(__dirname + '/dummyFile.txt', function (err, data) {
			if (err) throw err;

			fileLib.get({slug: 'slug/foo/bar.txt'}).then(file => {
				if (err) throw err;

				assert.deepEqual(file.uuid, lUtils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1, ['metavalue1']);
				assert.deepEqual(file.metadata.metadata2, ['multiple', 'values']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug, 'slug/foo/bar.txt');
				assert.deepEqual(file.data, data);

				done();
			})
				.catch(err => { done(err); });
		});
	});

	it('Write another to db', function (done) {
		fileLib.save({
			slug: 'boll.txt',
			data: Buffer.from('buhu'),
			metadata: {metadata1: 'metavalue2', other: 'value'}
		}).then(file => {
			assert.strictEqual(file.uuid, lUtils.formatUuid(file.uuid));
			assert.deepEqual(file.metadata.metadata1, ['metavalue2']);
			assert.deepEqual(file.metadata.other, ['value']);
			assert.deepEqual(Object.keys(file.metadata).length, 2);
			assert.deepEqual(file.slug, 'boll.txt');
			assert.deepEqual(file.data, Buffer.from('buhu'));

			done();
		})
			.catch(err => { done(err); });
	});

	it('List all files in storage', function (done) {
		fileLib.list().then(result => {
			assert.deepEqual(result.length,	2);

			for (const file of result) {
				assert.notStrictEqual(file.uuid, undefined);
				assert.strictEqual(Object.keys(file.metadata).length, 2);
				assert.strictEqual(typeof file.slug, 'string');
				assert.strictEqual(file.data, undefined);
			}

			done();
		})
			.catch(err => { done(err); });
	});

	it('Write yet another to db', function (done) {
		fileLib.save({
			slug: 'fippel.txt',
			data: Buffer.from('ðđªßð'),
			metadata: {foo: ['bar', 'baz', 'buu'], other: ['value', 'andThis']}
		}).then(() => done())
			.catch(done);
	});

	it('Write to db with no metadata', done => {
		fileLib.save({
			slug: 'bajjen.txt',
			data: Buffer.from('eekslfa')
		}).then(file => {
			assert.notStrictEqual(file.uuid, undefined);
			done();
		});
	});

	it('Update a file', done => {
		fileLib.save({
			slug: 'fiffel.txt',
			data: Buffer.from('o båg')
		}).then(() => {
			fileLib.save({
				slug: 'fiffel.txt',
				data: Buffer.from('o fil')
			}).then(() => {
				throw new Error('Should not be able to save file with same slug');
			}).catch(err => {
				assert.strictEqual(err.message, 'Slug "fiffel.txt" is taken by another file');

				fileLib.get({slug: 'fiffel.txt'})
					.then(file => {
						assert.strictEqual(file.data.toString(), 'o båg');

						fileLib.save({
							slug: 'fiffel.txt',
							data: Buffer.from('wakka'),
							updateMatchingSlug: true
						}).then(file => {
							assert.strictEqual(file.data.toString(), 'wakka');
							done();
						});
					});
			});
		});
	});

	it('List files in storage filtered by exact metadata', function (done) {
		fileLib.list({filter: { metadata: {metadata1: 'metavalue2'}}}).then(result => {
			assert.deepEqual(result.length, 1);

			assert.notStrictEqual(result[0].uuid, undefined);
			assert.deepEqual(result[0].metadata.metadata1, ['metavalue2']);
			assert.deepEqual(result[0].metadata.other, ['value']);
			assert.deepEqual(Object.keys(result[0].metadata).length, 2);
			assert.deepEqual(result[0].slug, 'boll.txt');
			assert.deepEqual(result[0].data, undefined);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by exact metadata, multiple metadata', function (done) {
		const options = {
			filter: {
				metadata: {
					other: 'value',
					metadata1: 'metavalue2'
				}
			}
		};

		fileLib.list(options).then(result => {
			assert.strictEqual(result.length, 1);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by exact metadata, multiple matches', function (done) {
		const options = {
			filter: {
				metadata: {
					other: 'value'
				}
			}
		};

		fileLib.list(options).then(result => {
			assert.strictEqual(result.length, 2);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by existing metadata key', function (done) {
		const options = {
			filter: {
				metadata: {
					metadata1: true
				}
			}
		};

		fileLib.list(options).then(result => {
			assert.strictEqual(result.length, 2);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by existing metadata key in combination with exact metadata', function (done) {
		const options = {
			filter: {
				metadata: {
					other: 'value',
					metadata1: true
				}
			}
		};

		fileLib.list(options).then(result => {
			assert.deepEqual(Object.keys(result).length, 1);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by two metadata values in combination', function (done) {
		const options = {
			filter: {
				metadata: {
					other: ['value', 'andThis']
				}
			}
		};

		fileLib.list(options).then(result => {
			assert.deepEqual(Object.keys(result).length, 1);

			done();
		})
			.catch(done);
	});

	it('List files in storage filtered by exact metadata, multiple metadata and the or operator', function (done) {
		const options = {
			filter: {
				metadata: {
					metadata1: 'metavalue2',
					foo: 'baz'
				},
				operator: 'or'
			}
		};

		fileLib.list(options).then(result => {
			assert.deepEqual(Object.keys(result).length, 2);

			done();
		})
			.catch(done);
	});

	it('should remove a file from storage', function (done) {
		const tasks = [];

		tasks.push(function (cb) {
			fileLib.uuidFromSlug('slug/foo/bar.txt').then(uuid => {
				fileLib.rm(uuid).then(cb)
					.catch(cb);
			})
				.catch(cb);
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

	it('Try to remove a file with invalid uuid', done => {
		fileLib.rm('xxx')
			.then(() => {
				throw new Error('Should not resolve');
			}).catch(err => {
				console.log(err);
				done();
			});
	});

	it('Try to remove a file with uuid that does not exist', done => {
		fileLib.rm('b1ff689d-be10-4e2a-8819-24feeb8ec9d5').then(done);
	});

	it('should rename a slug on an existing file', function (done) {
		const tasks = [];

		let file;

		tasks.push(function (cb) {
			fileLib.get({slug: 'boll.txt'}).then(filen => {
				file = filen;

				assert.deepEqual(file.uuid, lUtils.formatUuid(file.uuid));
				assert.deepEqual(file.metadata.metadata1, ['metavalue2']);
				assert.deepEqual(file.metadata.other, ['value']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug, 'boll.txt');
				assert.deepEqual(file.data, Buffer.from('buhu'));

				cb();
			})
				.catch(cb);
		});

		tasks.push(function (cb) {
			file.slug = 'somethingNewAndShiny.txt';

			fileLib.save(file).then(result => {
				assert.deepEqual(result.uuid, lUtils.formatUuid(file.uuid));
				assert.deepEqual(result.metadata.metadata1, ['metavalue2']);
				assert.deepEqual(result.metadata.other, ['value']);
				assert.deepEqual(Object.keys(result.metadata).length, 2);
				assert.deepEqual(result.slug, 'somethingNewAndShiny.txt');
				assert.deepEqual(result.data, Buffer.from('buhu'));

				cb();
			})
				.catch(cb);
		});

		async.series(tasks, done);
	});

	it('should fail on renaming if slug exists', function (done) {
		const	tasks	= [];

		let file;

		tasks.push(function (cb) {
			fileLib.get({slug: 'somethingNewAndShiny.txt'}).then(filen => {
				file = filen;

				assert.deepEqual(file.metadata.metadata1, ['metavalue2']);
				assert.deepEqual(file.metadata.other, ['value']);
				assert.deepEqual(Object.keys(file.metadata).length, 2);
				assert.deepEqual(file.slug, 'somethingNewAndShiny.txt');
				assert.deepEqual(file.data, Buffer.from('buhu'));

				cb();
			})
				.catch(cb);
		});

		tasks.push(function (cb) {
			file.slug = 'fippel.txt';

			fileLib.save(file)
				.then(() => {
					throw new Error('This should not happen!');
				}).catch(err => {
					assert.strictEqual(err.message, 'Slug "fippel.txt" is taken by another file');
					cb();
				});
		});

		async.series(tasks, done);
	});
});
