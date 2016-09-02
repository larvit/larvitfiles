'use strict';

const	assert	= require('assert'),
	utils	= require(__dirname + '/../index.js');

describe('replaceAll', function() {
	it('Should replace all occurences of - to _ in an UUID', function(done) {
		const	uuidStr	= 'f9684592-b245-42fa-88c6-9f16b9236ac3',
			newStr	= utils.replaceAll('-', '_', uuidStr);

		assert.deepEqual(newStr, 'f9684592_b245_42fa_88c6_9f16b9236ac3');

		done();
	});

	it('Should leave a string unaltered if it have no occurences of the string to be replaced', function(done) {
		const	uuidStr	= 'f9684592b24542fa88c69f16b9236ac3',
			newStr	= utils.replaceAll('-', '_', uuidStr);

		assert.deepEqual(newStr, 'f9684592b24542fa88c69f16b9236ac3');

		done();
	});

	it('Should be able to replace to nothing', function(done) {
		const	uuidStr	= 'f9684592-b245-42fa-88c6-9f16b9236ac3',
			newStr	= utils.replaceAll('-', '', uuidStr);

		assert.deepEqual(newStr, 'f9684592b24542fa88c69f16b9236ac3');

		done();
	});

	it('Should not break if we pass RegExp unsafe char', function(done) {
		const	uuidStr	= 'f9684592-b245-42fa.88c6.9f16b9236ac3',
			newStr	= utils.replaceAll('.', 'poo', uuidStr);

		assert.deepEqual(newStr, 'f9684592-b245-42fapoo88c6poo9f16b9236ac3');

		done();
	});
});
