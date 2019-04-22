'use strict';

const async = require('async');
const fs = require('fs');

exports.run = function (req, res, cb) {
	const fileLib = req.fileLib;
	const log = req.log;
	const tasks = [];
	const data = {global: res.globalData, prefix: fileLib.prefix};

	let logPrefix = 'larvitfiles: ./controllers/adminFileEdit.js: ';
	let file;

	data.global.menuControllerName = 'adminFiles';
	data.global.errors = [];

	if (data.global.urlParsed.query.uuid !== undefined) {
		logPrefix += 'uuid: ' + data.global.urlParsed.query.uuid + ' - ';
		tasks.push(cb => {
			fileLib.get({uuid: data.global.urlParsed.query.uuid}).then(result => {
				file = result;
				cb();
			}).catch(cb);
		});
	}

	if (data.global.formFields.action === 'save') {
		log.verbose(logPrefix + 'Saving file');

		const newFileData = {};

		newFileData.slug = data.global.formFields.slug;
		newFileData.metadata = {};

		// Set metadata
		for (let i = 0; data.global.formFields.metaDataName[i] !== undefined; i++) {
			if (data.global.formFields.metaDataName[i] !== '' && data.global.formFields.metaDataValue[i] !== '') {
				const name = data.global.formFields.metaDataName[i];
				const value = data.global.formFields.metaDataValue[i];

				if (newFileData.metadata[name] === undefined) {
					newFileData.metadata[name] = [];
				}

				newFileData.metadata[name].push(value);
			}
		}

		// Check so slug is not an empty string
		tasks.push(cb => {
			if (newFileData.slug === '') {
				data.global.errors.push('Slug can not be empty');
			}

			cb();
		});

		// Check so slug is not taken
		tasks.push(cb => {
			if (data.global.errors.length !== 0) return cb();

			if ((file !== undefined && file.slug !== newFileData.slug) || file === undefined) {
				fileLib.uuidFromSlug(newFileData.slug).then(result => {
					if ((result && file !== undefined && file.uuid !== result) || (file === undefined && result)) {
						data.global.errors.push('Slug already taken');
					}

					cb();
				}).catch(cb);
			} else {
				cb();
			}
		});

		// Set file data
		if (req.formFiles !== undefined && req.formFiles.fileData !== undefined && req.formFiles.fileData.size) {
			tasks.push(cb => {
				fs.readFile(req.formFiles.fileData.path, (err, fileData) => {
					if (err) {
						req.log.warn(logPrefix + 'Could not read file: "' + req.formFiles.fileData.path + '", err: ' + err.message);
					}

					newFileData.data = fileData;
					cb(err);
				});
			});

			tasks.push(cb => {
				fs.unlink(req.formFiles.fileData.path, err => {
					if (err) {
						req.log.warn(logPrefix + 'Could not unlink file: "' + req.formFiles.fileData.path + '", err: ' + err.message);
					}

					cb(err);
				});
			});
		}

		// Save file to disk
		tasks.push(cb => {
			if (data.global.errors.length !== 0) return cb();

			if (file === undefined) {
				fileLib.save(newFileData).then(result => {
					file = result;
					cb();
				}).catch(cb);
			} else {
				file.slug = newFileData.slug;
				file.metadata = newFileData.metadata;

				if (newFileData.data) {
					file.data = newFileData.data;
				}

				fileLib.save(file).then(() => cb()).catch(cb);
			}
		});

		// Handle GUI messages and redirecting
		tasks.push(cb => {
			if (data.global.errors.length !== 0) {
				// Do nothing
			} else if (file.uuid !== undefined && data.global.urlParsed.query.uuid === undefined) {
				req.session.data.nextCallData = {global: {messages: ['New file created']}};
				res.statusCode = 302;
				res.setHeader('Location', '/adminFileEdit?uuid=' + file.uuid);
			} else {
				data.global.messages = ['Saved'];
			}
			cb();
		});
	}

	if (data.global.formFields.action === 'delete') {
		tasks.push(cb => {
			if (file === undefined) return cb();

			fileLib.rm(file.uuid).then(() => {
				req.session.data.nextCallData = {global: {messages: ['Movie deleted']}};
				res.statusCode = 302;
				res.setHeader('Location', '/adminFiles');
				cb();
			}).catch(cb);
		});
	}

	// Load saved data to formfields
	tasks.push(cb => {
		if (file === undefined) return cb();

		data.global.formFields.slug = file.slug;
		data.global.formFields.metaDataName = [];
		data.global.formFields.metaDataValue = [];

		for (const key of Object.keys(file.metadata)) {
			for (let i = 0; file.metadata[key][i] !== undefined; i++) {
				data.global.formFields.metaDataName.push(key);
				data.global.formFields.metaDataValue.push(file.metadata[key][i]);
			}
		}

		cb();
	});

	async.series(tasks, err => {
		cb(err, req, res, data);
	});
};
