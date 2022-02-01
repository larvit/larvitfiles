'use strict';

const logPrefix = 'larvitfiles: ./dbmigration/2.js: ';
const { Utils } = require('larvitutils');
const async = require('async');
const fs = require('fs');

exports = module.exports = async function (options) {
	const tasks = [];
	const { db, log, context } = options;
	const lUtils = new Utils({log});

	let	files;

	if (context.storagePath === null) {
		const	err	= new Error('storagePath not set on larvitfiles');

		log.warn(logPrefix + err.message);
		throw err;
	}

	if (!fs.existsSync(context.storagePath)) {
		tasks.push(function (cb) {
			log.info(logPrefix + 'storagePath "' + context.storagePath + '" does not exist, creating');
			fs.mkdir(context.storagePath, cb);
		});
	}

	// Get list of slugs and uuids
	tasks.push(async function () {
		const {rows} = await db.query('SELECT uuid, slug FROM larvitfiles_files');
		files = rows;
	});

	// Write files to disk and save type in db
	tasks.push(function (cb) {
		const tasks = [];

		for (const file of files) {
			tasks.push(async function () {
				const {rows} = await db.query('SELECT data FROM larvitfiles_files WHERE uuid = ?', file.uuid);
				if (rows.length === 0) {
					log.warn(logPrefix + 'Could not find file with uuid "' + Utils.formatUuid(file.uuid) + '"');

					return;
				}

				await fs.promises.writeFile(context.storagePath + '/' + lUtils.formatUuid(file.uuid), rows[0].data);
			});
		}

		async.parallelLimit(tasks, 5, cb);
	});

	tasks.push(async function () {
		await db.query('ALTER TABLE larvitfiles_files DROP COLUMN data');
	});

	await async.series(tasks);
};
