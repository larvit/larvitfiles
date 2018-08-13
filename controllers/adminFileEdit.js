'use strict';

const	async	= require('async'),
	Lfs	= require('larvitfs'),
	lfs	= new Lfs(),
	conf	= require(lfs.getPathSync('config/larvitfiles.json')),
	fs	= require('fs');

exports.run = function (req, res, cb) {
	const	tasks	= [],
		data	= {'global': res.globalData, 'conf': conf};

	let	file;

	data.global.menuControllerName	= 'adminFiles';
	data.global.errors	= [];

	if (data.global.urlParsed.query.uuid !== undefined) {
		tasks.push(function (cb) {
			req.fileLib.file({'uuid': data.global.urlParsed.query.uuid}, function (err, fajl) {
				file = fajl;
				cb(err);
			});
		});
	}

	if (data.global.formFields.save !== undefined) {
		const	newFileData	= {};

		newFileData.slug	= data.global.formFields.slug;
		newFileData.metadata	= {};

		// Set metadata
		for (let i = 0; data.global.formFields.metaDataName[i] !== undefined; i ++) {
			if (data.global.formFields.metaDataName[i] !== '' && data.global.formFields.metaDataValue[i] !== '') {
				const	name	= data.global.formFields.metaDataName[i],
					value	= data.global.formFields.metaDataValue[i];

				if (newFileData.metadata[name] === undefined) {
					newFileData.metadata[name]	= [];
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
			if (data.global.errors.length !== 0) return cb();

			if ((file !== undefined && file.slug !== newFileData.slug) || file === undefined) {
				req.fileLib.getFileUuidBySlug(newFileData.slug, function (err, result) {
					if (err) return cb(err);

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
					if (err) {
						log.warn(logPrefix + 'Could not read file: "' + req.formFiles.fileData.path + '", err: ' + err.message);
					}

					newFileData.data	= fileData;
					cb(err);
				});
			});

			tasks.push(function (cb) {
				fs.unlink(req.formFiles.fileData.path, function (err) {
					if (err) {
						log.warn(logPrefix + 'Could not unlink file: "' + req.formFiles.fileData.path + '", err: ' + err.message);
					}

					cb(err);
				});
			});
		}

		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) return cb();

			if (file === undefined) {
				req.fileLib.file(newFileData, function (err, fajl) {
					file = fajl;
					cb(err);
				});
			} else {
				file.slug	= newFileData.slug;
				file.metadata	= newFileData.metadata;

				if (newFileData.data) {
					file.data	= newFileData.data;
				}

				cb();
			}
		});

		tasks.push(function (cb) {
			if (data.global.errors.length !== 0) return cb();

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
				data.global.messages	= ['Saved'];
			}
			cb();
		});
	}

	if (data.global.formFields.delete !== undefined) {
		tasks.push(function (cb) {
			if (file === undefined) return cb();

			file.rm(function (err) {
				if (err) return cb(err);

				req.session.data.nextCallData	= {'global': {'messages': ['Movie deleted']}};
				res.statusCode	= 302;
				res.setHeader('Location', '/adminFiles');
				cb();
			});
		});
	}

	// Load saved data to formfields
	tasks.push(function (cb) {
		if (file === undefined) return cb();

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
