/**
 * Example controller for feeding data to a client
 */
'use strict';

const	lfs	= require('larvitfs'),
	notFoundPath	= lfs.getPathSync('controllers/404.js'),
	lFiles	= require(__dirname + '/../index.js'),
	conf	= require(lfs.getPathSync('config/larvitfiles.json'));

exports.run = function (req, res, cb) {
	const file = new lFiles.File({
		'slug': req.urlParsed.pathname.substring(conf.prefix.length)
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
