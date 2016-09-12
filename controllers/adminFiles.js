'use strict';

const	lFiles	= require(__dirname + '/../index.js'),
	lfs	= require('larvitfs'),
	conf	= require(lfs.getPathSync('config/larvitfiles.json'));

exports.run = function(req, res, cb) {
	const	files	= new lFiles.Files(),
		data	= {'global': res.globalData, 'conf': conf};

	data.global.menuControllerName = 'adminFiles';

	files.get(function(err, result) {
		data.files = result;
		cb(err, req, res, data);
	});
};
