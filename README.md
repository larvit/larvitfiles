[![Build Status](https://travis-ci.org/larvit/larvitfiles.svg)](https://travis-ci.org/larvit/larvitfiles) [![Dependencies](https://david-dm.org/larvit/larvitfiles.svg)](https://david-dm.org/larvit/larvitfiles.svg)

# larvitfiles

## Installation

```bash
npm i larvitfiles;
```

## Usage

### Add file from buffer

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb'),
	fs	= require('fs');

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

fs.readFile('/some/file.txt', function (err, data) {
	let file;

	if (err) throw err;

	file = new lFiles.File({
		'slug':	'slug/foo/bar.txt',
		'data':	data,
		'metadata':	{'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}
	}, function (err) {
		if (err) throw err;

		file.save(function (err) {
			if (err) throw err;

			console.log('file saved with uuid: ' + file.uuid);
			console.log('metadata: ' + JSON.stringify(file.metadata));
			console.log('slug: ' + file.slug);
		});
	});
});
```

### Get file from storage

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb');

let file;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

file = new lFiles.File({'slug': 'slug/foo/bar.txt'}, function (err) {
	if (err) throw err;

	console.log('file saved with uuid: ' + file.uuid);
	console.log('metadata: ' + JSON.stringify(file.metadata));
	console.log('slug: ' + file.slug);
	// file data in file.data
});
```

### Remove a file from storage

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb');

let file;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

file = new lFiles.File({'slug': 'slug/foo/bar.txt'}, function (err) {
	if (err) throw err;

	file.rm(function (err) {
		if (err) throw err;

		console.log('File is now removed from storage');
	});
});
```

### List files in storage

#### List all files

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb');

let files;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

files = new lFiles.Files();
files.get(function (err, result) {
	if (err) throw err;

	console.log(result); // Object list of files, uuid as key and slugs, uuids and metadata, but NOT file data as values.
});
```

#### Filter list based on metadata

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb');

let files;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

files = new lFiles.Files();

// This will only return files with metadata
// 1) "foo" = "bar" (and possibly other values as well)
// and
// 2) "zoo" = anything
files.filter.metadata.foo = 'bar';
files.filter.metadata.zoo = true;
files.filter.operator	= 'and'; // or 'or'. 'and' is default
files.get(function (err, result) {
	if (err) throw err;

	console.log(result); // Object list of files, uuid as key and slugs, uuids and metadata, but NOT file data as values.
});
```

And if several values should exist on a single metadata do this:

```javascript
const	lFiles	= require('larvitfiles'),
	db	= require('larvitdb');

let files;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

files = new lFiles.Files();

// This will only return files with metadata
// 1) "foo" = "bar" (and possibly other values as well)
// and
// 2) "foo" = "baz" (and possibly other values as well)
files.filter.metadata.foo = ['bar', 'baz'];
files.get(function (err, result) {
	if (err) throw err;

	console.log(result); // Object list of files, uuid as key and slugs, uuids and metadata, but NOT file data as values.
});
```
