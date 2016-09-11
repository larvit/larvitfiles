'use strict';

const	lFiles	= require(__dirname + '/../index.js'),
	async	= require('async'),
	fs	= require('fs');

exports.run = function(req, res, cb) {
	const	tasks	= [],
		data	= {'global': res.globalData};

	let file;

	data.global.menuControllerName = 'adminFiles';

	if (data.global.urlParsed.query.uuid !== undefined) {
		tasks.push(function(cb) {
			file = new lFiles.File({'uuid': data.global.urlParsed.query.uuid}, cb);
		});
	}

	if (data.global.formFields.save !== undefined) {
		const newFileData = {'slug': data.global.formFields.slug, 'metadata': {}};

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

		if (req.formFiles !== undefined && req.formFiles.fileData !== undefined && req.formFiles.fileData.size) {
			tasks.push(function(cb) {
				fs.readFile(req.formFiles.fileData.path, function(err, fileData) {
					newFileData.data = fileData;

					cb(err);
				});
			});

			tasks.push(function(cb) {
				fs.unlink(req.formFiles.fileData.path, cb);
			});
		}

		tasks.push(function(cb) {
			if (file === undefined) {
				file = new lFiles.File(newFileData, cb);
				return;
			}

			file.slug	= newFileData.slug;
			file.data	= newFileData.data;
			file.metadata	= newFileData.metadata;

			cb();
		});

		tasks.push(function(cb) {
			file.save(cb);
		});

		tasks.push(function(cb) {
			if (file.uuid !== undefined && data.global.urlParsed.query.uuid === undefined) {
				req.session.data.nextCallData	= {'global': {'messages': ['New file created']}};
				res.statusCode	= 302;
				res.setHeader('Location', '/adminFileEdit?uuid=' + file.data.uuid);
			} else {
				data.global.messages = ['Saved'];
			}
		});
	}

	async.series(tasks, function(err) {
		cb(err, req, res, data);
	});
};
