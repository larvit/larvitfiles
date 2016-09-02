# larvitfiles

## Installation

```bash
npm i larvitfiles;
```

## Usage



### Add file

```javascript
const	files	= require('larvitfiles'),
	fs	= require('fs');

let file = new files.File('slug/foo/bar.txt', {'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}, function(err) {
	if (err) throw err;


});
```

### Add file without stream

```javascript
const	files	= require('larvitfiles'),
	fs	= require('fs');

fs.readFile('/some/file.txt', function(err, data) {
	let file;

	if (err) throw err;

	file = new files.File('slug/foo/bar.txt', data, {'metadata1': 'metavalue1', 'metadata2': ['multiple', 'values']}, function(err) {
		if (err) throw err;

		console.log('file saved with uuid: ' + file.uuid);
		console.log('metadata: ' + JSON.stringify(file.metadata));
		ocnsole.log('slug: ' + file.slug);
	});
})

	,
	file	= new files.File('slug/foo/bar.txt', fs.readFileSync);
