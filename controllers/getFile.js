/**
 * Example controller for feeding data to a client
 */
'use strict';

const Lfs = require('larvitfs');
const fs  = require('fs');

/**
 *
 * @param {obj} req - standard req obj
 * @param {obj} res - standard res obj
 * @param {func} cb - callback
 */
function run(req, res, cb) {
	const lfs          = new Lfs({'log': req.log, 'fs': fs});
	const notFoundPath = lfs.getPathSync('controllers/404.js');
	const url          = require('url');

	req.urlParsed = url.parse(req.url);

	req.fileLib.file({
		'slug': decodeURIComponent(req.urlParsed.pathname.substr(req.fileLib.prefix.length))
	}, function (err, file) {
		if (err) return cb(err, req, res, {});

		if (file.uuid === undefined) {
			// 404!!!
			require(notFoundPath).run(req, res, cb);

			return;
		}

		const header = {};

		header['Content-Type'] = 'application/octet-stream';
		header['Content-Disposition'] = 'attachment; filename="' + file.slug + '"';
		res.writeHead(200, header);
		res.end(file.data);
	});
}

run.run = run; // Backwards compatible with larvitbase 1.x

exports = module.exports = run;
