'use strict';

exports.run = function (req, res, cb) {
	console.log('Broken, needs to be updated');
	process.exit(1);
	const files	= req.fileLib.files();
	const data = {global: res.globalData, prefix: req.fileLib.prefix};

	data.global.menuControllerName = 'adminFiles';

	files.get(function (err, result) {
		data.files = result;
		cb(err, req, res, data);
	});
};
