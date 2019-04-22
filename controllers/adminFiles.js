'use strict';

exports.run = function (req, res, cb) {
	const data = {global: res.globalData, prefix: req.fileLib.prefix};

	data.global.menuControllerName = 'adminFiles';

	req.fileLib.list().then(result => {
		data.files = result;
		cb(null, req, res, data);
	}).catch(err => {
		cb(err, req, res, data);
	});
};
