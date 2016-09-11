'use strict';

const	lFiles	= require(__dirname + '/../index.js');

exports.run = function(req, res, cb) {
	const	files	= new lFiles.Files(),
		data	= {'global': res.globalData};

	data.global.menuControllerName = 'adminFiles';

	files.get(function(err, result) {
		data.files = result;
		cb(err, req, res, data);
	});
};
