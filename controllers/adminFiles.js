'use strict';

const Lfs = require('larvitfs');
const fs  = require('fs');

exports.run = function (req, res, cb) {
	const lfs   = new Lfs({'log': req.log, 'fs': fs});
	const conf  = require(lfs.getPathSync('config/larvitfiles.json'));
	const files	= req.fileLib.files();
	const data  = {'global': res.globalData, 'conf': conf};

	data.global.menuControllerName = 'adminFiles';

	files.get(function (err, result) {
		data.files = result;
		cb(err, req, res, data);
	});
};
