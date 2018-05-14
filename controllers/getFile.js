/**
 * Example controller for feeding data to a client
 */
'use strict';

const	Lfs	= require('larvitfs'),
	lfs	= new Lfs(),
	notFoundPath	= lfs.getPathSync('controllers/404.js'),
	lFiles	= require(__dirname + '/../index.js');

exports.run = function (req, res, cb) {
	const file = new lFiles.File({
		'slug': decodeURIComponent(req.urlParsed.pathname.substring(lFiles.prefix.length))
	}, function (err) {
		if (err) { cb(err, req, res, {}); return; }

		if (file.uuid === undefined) {
			// 404!!!
			require(notFoundPath).run(req, res, cb);
			return;
		}

		res.writeHead(200, 'application/octet-stream');
		res.end(file.data);
	});
};
