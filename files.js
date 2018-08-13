'use strict';

const	lUtils	= new (require('larvitutils'))(),
	async	= require('async');

function Files(options) {
	this.filter = {
		'metadata':	{}
	};

	this.order = {
	};

	if ( ! options.db) throw new Error('Requried option db is not set');
	this.db = options.db;
}

Files.prototype.get = function get(cb) {
	const	fileUuids	= [],
		dbFiles	= {},
		tasks	= [],
		that	= this;

	tasks.push(function (cb) {
		const	dbFields	= [];

		let	sql	= 'SELECT f.uuid, f.slug\nFROM larvitfiles_files f\n',
			sqlOrder;

		if (that.filter.operator !== 'or') {
			that.filter.operator	= 'and';
		}

		if (that.order.dir !== 'asc') {
			that.order.dir	= 'desc';
		}

		if (that.filter.operator === 'and' && Object.keys(that.filter.metadata).length !== 0) {
			let	counter	= 0;

			for (const name of Object.keys(that.filter.metadata)) {
				let	values	= that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values	= [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const	value	= values[i];

					counter ++;
					sql += '	JOIN larvitfiles_files_metadata fm' + counter;
					sql += ' ON f.uuid = fm' + counter + '.fileUuid';

					if (value === true) {
						sql += ' AND fm' + counter + '.name = ?';
						dbFields.push(name);
					} else {
						sql += ' AND fm' + counter + '.name = ?';
						sql += ' AND fm' + counter + '.value = ?';
						dbFields.push(name);
						dbFields.push(value);
					}

					sql += '\n';
				}
			}

			if (counter > 60) {
				const	err	= new Error('Can not select on more than a total of 60 metadata key value pairs due to database limitation in joins');
				log.warn(logPrefix + err.message);
				return cb(err);
			}
		}

		if (that.order.column) {
			if (that.order.column.startsWith('metadata:')) {
				const metadataName = that.order.column.substring(9);
				sql += 'LEFT JOIN larvitfiles_files_metadata ordm ON f.uuid = ordm.fileUuid AND ordm.name = ?';
				sqlOrder = 'ORDER BY ordm.value';

				dbFields.push(metadataName);
			} else {
				switch (that.order.column) {
				case 'slug':
					sqlOrder = 'ORDER BY f.slug';
					break;
				}
			}
		}

		if (that.filter.operator === 'or' && Object.keys(that.filter.metadata).length !== 0) {
			sql += 'WHERE f.uuid IN (SELECT fileUuid FROM larvitfiles_files_metadata WHERE ';

			for (const name of Object.keys(that.filter.metadata)) {
				let	values	= that.filter.metadata[name];

				if ( ! (values instanceof Array)) {
					values = [values];
				}

				for (let i = 0; values[i] !== undefined; i ++) {
					const	value	= values[i];

					if (value === true) {
						sql += 'name = ? OR ';
						dbFields.push(name);
					} else {
						sql += '(name = ? AND value = ?) OR ';
						dbFields.push(name);
						dbFields.push(value);
					}
				}
			}

			sql = sql.substring(0, sql.length - 4);
			sql += ')\n';
		}

		if (sqlOrder) {
			sql += sqlOrder + ' ' + that.order.dir + '\n';
		}

		that.db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= lUtils.formatUuid(rows[i].uuid);

				fileUuids.push(fileUuid);

				dbFiles[fileUuid] = {
					'uuid':	fileUuid,
					'slug':	rows[i].slug,
					'metadata':	{}
				};
			}

			cb();
		});
	});

	// Get all metadata
	tasks.push(function (cb) {
		const	dbFields	= [];

		let	sql	= 'SELECT * FROM larvitfiles_files_metadata WHERE fileUuid IN (';

		if (fileUuids.length === 0) return cb();

		for (let i = 0; fileUuids[i] !== undefined; i ++) {
			const	fileUuidBuf	= lUtils.uuidToBuffer(fileUuids[i]);

			if (fileUuidBuf) {
				sql += '?,';
				dbFields.push(fileUuidBuf);
			}
		}

		sql = sql.substring(0, sql.length - 1) + ')';

		that.db.query(sql, dbFields, function (err, rows) {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				const	fileUuid	= lUtils.formatUuid(rows[i].fileUuid),
					row	= rows[i];

				if (dbFiles[fileUuid].metadata[row.name] === undefined) {
					dbFiles[fileUuid].metadata[row.name] = [];
				}

				dbFiles[fileUuid].metadata[row.name].push(row.value);
			}

			cb();
		});
	});

	async.series(tasks, function (err) {
		if (err) return cb(err);

		cb(null, dbFiles);
	});
};

exports = module.exports = Files;