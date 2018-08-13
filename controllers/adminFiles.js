'use strict';

const	Lfs	= require('larvitfs'),

	lfs	= new Lfs(),
	conf	= require(lfs.getPathSync('config/larvitfiles.json')); // this does what?

exports.run = function (req, res, cb) {
	const	files	= req.fileLib.files(),
		data	= {'global': res.globalData, 'conf': conf};

	data.global.menuControllerName = 'adminFiles';

	files.get(function (err, result) {
		data.files = result;
		cb(err, req, res, data);
	});
};
