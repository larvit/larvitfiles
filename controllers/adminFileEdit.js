'use strict';

const	lFiles	= require(__dirname + '/../index.js'),
	async	= require('async'),
	lfs	= require('larvitfs'),
	conf	= require(lfs.getPathSync('config/larvitfiles.json')),
	fs	= require('fs');

exports.run = function (req, res, cb) {
	const	tasks	= [],
		data	= {'global': res.globalData, 'conf': conf};

	let file;

	data.global.menuControllerName	= 'adminFiles';
	data.global.errors	= [];

	if (data.global.urlParsed.query.uuid !== undefined) {
		tasks.push(function (cb) {
			file = new lFiles.File({'uuid': data.global.urlParsed.query.uuid}, cb);
		});
	}

	if (data.global.formFields.save !== undefined) {
		const	newFileData	= {
					'slug':	data.global.formFields.slug,
					'metadata':	{}
				};

		// Set metadata
		for (let i = 0; data.global.formFields.metaDataName[i] !== undefined; i ++) {
			if (data.global.formFields.metaDataName[i] !== '' && data.global.formFields.metaDataValue[i] !== '') {
				const	name	= data.global.formFields.metaDataName[i],
					value	= data.global.formFields.metaDataValue[i];

				if (newFileData.metadata[name] === undefined) {
					newFileData.metadata[name] = [];
				}

				newFileData.metadata[name].push(value);
			}
		}

		// Check so slug is not an empty string
		tasks.push(function (cb) {
			if (newFileData.slug === '') {
				data.global.errors.push('Slug can not be empty');
			}

			cb();
		});

		// Check so slug is not taken
		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) {
				cb();
				return;
			}

			if ((file !== undefined && file.slug !== newFileData.slug) || file === undefined) {
				lFiles.getFileUuidBySlug(newFileData.slug, function (err, result) {
					if (err) { cb(err); return; }

					if ((result !== false && file !== undefined && file.uuid !== result) || (file === undefined && result !== false)) {
						data.global.errors.push('Slug already taken');
					}

					cb();
				});
			} else {
				cb();
			}
		});

		// Set file data
		if (req.formFiles !== undefined && req.formFiles.fileData !== undefined && req.formFiles.fileData.size) {
			tasks.push(function (cb) {
				fs.readFile(req.formFiles.fileData.path, function (err, fileData) {
					newFileData.data = fileData;

					cb(err);
				});
			});

			tasks.push(function (cb) {
				fs.unlink(req.formFiles.fileData.path, cb);
			});
		}

		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) {
				cb();
				return;
			}

			if (file === undefined) {
				file = new lFiles.File(newFileData, cb);
				return;
			}

			file.slug	= newFileData.slug;
			file.metadata	= newFileData.metadata;

			if (newFileData.data) {
				file.data	= newFileData.data;
			}

			cb();
		});

		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) {
				cb();
				return;
			}

			console.log(file);

			file.save(cb);
		});

		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) {
				// Do nothing
			} else if (file.uuid !== undefined && data.global.urlParsed.query.uuid === undefined) {
				req.session.data.nextCallData	= {'global': {'messages': ['New file created']}};
				res.statusCode	= 302;
				res.setHeader('Location', '/adminFileEdit?uuid=' + file.uuid);
			} else {
				data.global.messages = ['Saved'];
			}
			cb();
		});
	}

	if (data.global.formFields.delete !== undefined) {
		tasks.push(function (cb) {
			if (file === undefined) {
				cb();
				return;
			}

			file.rm(function (err) {
				if (err) { cb(err); return; }

				req.session.data.nextCallData	= {'global': {'messages': ['Movie deleted']}};
				res.statusCode	= 302;
				res.setHeader('Location', '/adminFiles');
				cb();
			});
		});
	}

	// Load saved data to formfields
	tasks.push(function (cb) {
		if (file === undefined) {
			cb();
			return;
		}

		data.global.formFields.slug	= file.slug;
		data.global.formFields.metaDataName	= [];
		data.global.formFields.metaDataValue	= [];

		for (const key of Object.keys(file.metadata)) {
			for (let i = 0; file.metadata[key][i] !== undefined; i ++) {
				data.global.formFields.metaDataName.push(key);
				data.global.formFields.metaDataValue.push(file.metadata[key][i]);
			}
		}

		cb();
	});

	async.series(tasks, function (err) {
		cb(err, req, res, data);
	});
};
