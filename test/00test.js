'use strict';

const FileLib = require(__dirname + '/../index.js');
const assert = require('assert');
const async = require('async');
const { Log, Utils } = require('larvitutils');
const Db = require('larvitdb');
const fs = require('fs');

const log = new Log('error');
const lUtils = new Utils({log: log});
const tmpdir = require('os').tmpdir();
const storagePath = tmpdir + '/larvitfiles';

let fileLib;
let db;

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
		db = new Db(cfg);
		cb();
	});

	tasks.push(async function () {
		await db.removeAllTables();
	});

	// Set lib
	tasks.push(async function () {
		fileLib = new FileLib({log, db, storagePath});
		await fileLib.ready();
	});

	async.series(tasks, function (err) {
		if (err) throw err;
		done(err);
	});
});

after(function (done) {
	const tasks = [];

	// Clear db
	tasks.push(async function () {
		await db.removeAllTables();
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

	it('Fetch from db on slug without file data', async function () {
		const file = await fileLib.get({slug: 'slug/foo/bar.txt', includeFileData: false});
		assert.strictEqual(file.data, undefined);
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

	it('Write a third one to db', async function () {
		const file = await fileLib.save({
			slug: 'korv.txt',
			data: Buffer.from('korvtolv'),
			metadata: {metadata1: 'metavalue3', other: 'value3'}
		});
		assert.strictEqual(file.uuid, lUtils.formatUuid(file.uuid));
		assert.deepEqual(file.metadata.metadata1, ['metavalue3']);
		assert.deepEqual(file.metadata.other, ['value3']);
		assert.deepEqual(Object.keys(file.metadata).length, 2);
		assert.deepEqual(file.slug, 'korv.txt');
		assert.deepEqual(file.data, Buffer.from('korvtolv'));
	});

	it('List all files in storage', function (done) {
		fileLib.list().then(result => {
			assert.deepEqual(result.length,	3);

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

	it('List all files in storage sorted by slug desc', async function () {
		const result = await fileLib.list({ order: {column: 'slug', dir: 'desc'}});
		assert.strictEqual(result.length, 3);
		assert.strictEqual(result[0].slug, 'slug/foo/bar.txt');
		assert.strictEqual(result[1].slug, 'korv.txt');
		assert.strictEqual(result[2].slug, 'boll.txt');
	});

	it('List all files in storage sorted by metadata1 desc', async function () {
		const result = await fileLib.list({ order: {column: 'metadata:metadata1', dir: 'desc'}});
		assert.strictEqual(result.length, 3);
		assert.strictEqual(result[0].metadata.metadata1[0], 'metavalue3');
		assert.strictEqual(result[1].metadata.metadata1[0], 'metavalue2');
		assert.strictEqual(result[2].metadata.metadata1[0], 'metavalue1');
	});

	it('List files in storage with limit 2', async function () {
		const result = await fileLib.list({limit: 2});
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].slug, 'boll.txt');
		assert.strictEqual(result[1].slug, 'korv.txt');
	});

	it('List files in storage with limit 2 and offset 1', async function () {
		const result = await fileLib.list({limit: 2, offset: 1});
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].slug, 'korv.txt');
		assert.strictEqual(result[1].slug, 'slug/foo/bar.txt');
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
			assert.strictEqual(result.length, 3);

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

	it('List files in storage filtered by existing metadata, multiple metadata and the or operator', async function () {
		const options = {
			filter: {
				metadata: {
					metadata1: true,
					foo: true
				},
				operator: 'or'
			}
		};

		const result = await fileLib.list(options);
		assert.deepEqual(Object.keys(result).length, 4);
	});

	it('should throw an error when listing by more than 60 metadata filters', async function () {
		const options = {
			filter: {
				metadata: {
				}
			}
		};

		for (let i = 0; i < 61; i++) {
			options.filter.metadata[`metadata${i}`] = 'value';
		}

		await assert.rejects(async () => await fileLib.list(options), new Error('Can not select on more than a total of 60 metadata key value pairs due to database limitation in joins'));
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

		tasks.push(async function () {
			const {rows} = await db.query('SELECT * FROM larvitfiles_files WHERE slug = \'slug/foo/bar.txt\'');
			assert.strictEqual(rows.length, 0);
		});

		async.series(tasks, done);
	});

	it('Try to remove a file with invalid uuid', done => {
		fileLib.rm('xxx')
			.then(() => {
				throw new Error('Should not resolve');
			// eslint-disable-next-line no-unused-vars
			}).catch(err => {
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

	it('should throw an error when creating without db', async () => {
		assert.throws(() => new FileLib({storagePath: './asdf'}), new Error('Missing required option "db"'));
	});

	it('should throw an error when creating without storagePath', async () => {
		assert.throws(() => new FileLib({db}), new Error('Missing required option storage path'));
	});

	it('should be able to construct without log', async () => {
		assert.doesNotThrow(() => new FileLib({db, storagePath}));
	});

	it('should handle multiple ready calls', async () => {
		const fl = new FileLib({db, storagePath, log});
		await Promise.all([fl.ready(), fl.ready()]);
	});

	it('should throw an error when calling uuidfromSlug with empty slug', async () => {
		await assert.rejects(async () => await fileLib.uuidFromSlug(''), new Error('Slug not set'));
	});

	it('should throw an error when calling get with no uuid or slug', async () => {
		await assert.rejects(async () => await fileLib.get({}), new Error('Need uuid or slug to be able to get file'));
	});

	it('should throw and error when trying to save without a slug', async function () {
		await assert.rejects(async () => await fileLib.save({data: Buffer.from('buhu')}), new Error('Slug is required to save file'));
	});

	it('should throw and error when trying to remove a file empty uuid', async function () {
		await assert.rejects(async () => await fileLib.rm(''), new Error('uuid is not defined'));
	});
});
