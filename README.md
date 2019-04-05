[![Build Status](https://travis-ci.org/larvit/larvitfiles.svg?branch=master)](https://travis-ci.org/larvit/larvitfiles) [![Dependencies](https://david-dm.org/larvit/larvitfiles.svg)](https://david-dm.org/larvit/larvitfiles.svg)
[![Coverage Status](https://coveralls.io/repos/larvit/larvitfiles/badge.svg)](https://coveralls.io/github/larvit/larvitfiles)

# larvitfiles

## Installation

```bash
npm i larvitfiles;
```

## Usage

### Load library

```javascript
const FileLib = require('larvitfiles');
const db = require('larvitdb');
const fs = require('fs');

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

const fileLib = new FileLib({
	db: db,
	storagePath: '/tmp/larvitfiles',

	// All below settings are optional, and their default is whats shown here
	log: new (new (require('larvitutils'))).Log(),
	prefix: '/dbfiles/'
});

await fileLib.ready(); // Not needed to run actions, but no action will start until this is returning true
```

### Add file from disk

```javascript
fs.readFile('/some/file.txt', function (err, data) {
	let	file;

	if (err) throw err;

	const file = await fileLib.save({
		slug: 'slug/foo/bar.txt',
		data: data,
		metadata: {metadata1: 'metavalue1', metadata2: ['multiple', 'values']}, // optional, will erase previous metadata if left blank
		//uuid: uuid() - optional
	});

	console.log('file saved with uuid: ' + file.uuid);
	console.log('metadata: ' + JSON.stringify(file.metadata));
	console.log('slug: ' + file.slug);
});
```

### Update file on disk

By default .save() will not accept a duplicate slug without also supplying a matching uuid.

If the below script is ran when a file with the slug "slug/foo/bar.txt" already exists in the database, this will throw an error.

```javascript
const file = await fileLib.save({
	slug: 'slug/foo/bar.txt',
	data: Buffer.from('någe')
});
```

To overwrite the existing file, on the same uuid, use option "updateMatchingSlug":

```javascript
const file = await fileLib.save({
	slug: 'slug/foo/bar.txt',
	data: Buffer.from('någe'),
	updateMatchingSlug: true // Defaults to false
});
```

### Get file from storage

```javascript
const file = await fileLib.get({slug: 'slug/foo/bar.txt'});

// or

const file = await fileLib.get({uuid: 'uuid of file'});

console.log('file saved with uuid: ' + file.uuid);
console.log('metadata: ' + JSON.stringify(file.metadata));
console.log('slug: ' + file.slug);
// file data in file.data
```

### Remove a file from storage

```javascript
fileLib.rm(await fileLib.uuidFromSlug('slog/foo/bar.txt'));
console.log('File is now removed from storage');
```

### List files in storage

#### List all files

```javascript
const files = await fileLib.list();
console.log(result); // Array of objects with uuid, slugs and metadata, but NOT file data as values.
```

#### Filter list based on metadata

```javascript
// This will only return files with metadata
// 1) "foo" = "bar" (and possibly other values as well)
// and
// 2) "zoo" = anything
const options = {
	filter: {
		metadata: {
			foo: 'bar',
			zoo: true
		},
		operator: 'and' // or 'or'. 'and' is default
	}
};

const files	= await fileLib.list(options);
console.log(files); // Array of objects with uuid, slugs and metadata, but NOT file data as values.
```

And if several values should exist on a single metadata do this:

```javascript
// This will only return files with metadata
// 1) "foo" = "bar" (and possibly other values as well)
// and
// 2) "foo" = "baz" (and possibly other values as well)
const options = {
	filter: {
		metadata: {
			foo: ['bar', 'baz']
		}
	}
};

const files	= await fileLib.list(options);
console.log(files); // Array of objects with uuid, slugs and metadata, but NOT file data as values.
});
```
