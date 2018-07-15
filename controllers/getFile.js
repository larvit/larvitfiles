/**
 * Example controller for feeding data to a client
 */
'use strict';

const	Lfs	= require('larvitfs'),
	lfs	= new Lfs(),
	notFoundPath	= lfs.getPathSync('controllers/404.js'),
	lFiles	= require(__dirname + '/../index.js'),
	url	= require('url');

function run(req, res, cb) {
	req.urlParsed	= url.parse(req.url);

	const file = new lFiles.File({
		'slug': decodeURIComponent(req.urlParsed.pathname.substring(lFiles.prefix.length))
	}, function (err) {
		if (err) return cb(err, req, res, {});

		if (file.uuid === undefined) {
			// 404!!!
			require(notFoundPath).run(req, res, cb);
			return;
		}

		res.writeHead(200, 'application/octet-stream');
		res.end(file.data);
	});
}

run.run	= run; // Backwards compatible with larvitbase 1.x

exports = module.exports = run;
