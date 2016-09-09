# larvitfiles

## Installation

```bash
npm i larvitfiles;
```

## Usage

### Add file from buffer

```javascript
const	lFiles	= require('larvitfiles')({'backend':'larvitdb'}),
	db	= require('larvitdb'),
	fs	= require('fs');

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

fs.readFile('/some/file.txt', function(err, data) {
	let file;

	if (err) throw err;

	file = new lFiles.File({
		'slug':	'slug/foo/bar.txt',
		'data':	data,
		'metadata':	{'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}
	}, function(err) {
		if (err) throw err;

		file.save(function(err) {
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
const	lFiles	= require('larvitfiles')({'backend':'larvitdb'}),
	db	= require('larvitdb');

let file;

db.setup(conf); // Only needed once per script. See https://github.com/larvit/larvitdb for details

file = new lFiles.File({'slug': 'slug/foo/bar.txt'}, function(err) {
	if (err) throw err;

	console.log('file saved with uuid: ' + file.uuid);
	console.log('metadata: ' + JSON.stringify(file.metadata));
	console.log('slug: ' + file.slug);
	// file data in file.data
});
```
