'use strict';

const	assert	= require('assert'),
	utils	= require(__dirname + '/../index.js');

describe('uuidToBuffer', function() {
	it('Should convert an Uuid string to a buffer', function(done) {
		const	uuidStr	= 'f9684592-b245-42fa-88c6-9f16b9236ac3',
			uuidBuf	= utils.uuidToBuffer(uuidStr);

		assert(uuidBuf.toString('hex') === 'f9684592b24542fa88c69f16b9236ac3', 'Uuid string is wrong, expected "f9684592b24542fa88c69f16b9236ac3" but got "' + uuidBuf.toString('hex') + '"');

		done();
	});

	it('Should fail to convert an invalid Uuid string to buffer', function(done) {
		const	uuidStr	= 'f96845-42fa-88c6-9f16b9236ac3',
			uuidBuf	= utils.uuidToBuffer(uuidStr);

		assert(uuidBuf === false, 'uuidBuf should be false, but is "' + uuidBuf + '"');

		done();
	});
});
