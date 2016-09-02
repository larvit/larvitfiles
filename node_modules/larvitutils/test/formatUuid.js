'use strict';

const	assert	= require('assert'),
	utils	= require(__dirname + '/../index.js');

describe('formatUuid', function() {
	it('Should convert a binary buffer to Uuid string', function(done) {
		const uuid = utils.formatUuid(new Buffer('f9684592b24542fa88c69f16b9236ac3', 'hex'));

		assert(uuid === 'f9684592-b245-42fa-88c6-9f16b9236ac3', 'Uuid is wrong, expected "f9684592-b245-42fa-88c6-9f16b9236ac3", but got "' + uuid + '"');

		done();
	});

	it('Should trim a hex string and return its uuid value', function(done) {
		const	uuidStr	= '  0e7e26b7-f1804d65-9512-80b776a7509e    ',
			formatted	= utils.formatUuid(uuidStr);

		assert(formatted === '0e7e26b7-f180-4d65-9512-80b776a7509e', 'Uuid is wrong, expected "0e7e26b7-f180-4d65-9512-80b776a7509e" but got "' + formatted + '"');
		done();
	});

	it('Should add dashes to a hex string', function(done) {
		const	uuidStr	= '62be934b24c24944981c40d4163e3bc9',
			formatted	= utils.formatUuid(uuidStr);

		assert(formatted === '62be934b-24c2-4944-981c-40d4163e3bc9', 'Uuid is wrong, expected "62be934b-24c2-4944-981c-40d4163e3bc9" but got "' + formatted + '"');
		done();
	});

	it('Should fail to format a malformed string', function(done) {
		const	blaj	= utils.formatUuid('blaj'),
			toShortHex	= utils.formatUuid('62be934b24c2494981c40d4163e3bc9'),
			toLongHex	= utils.formatUuid('62be934b24c24944981c40d4163e3bc93');

		assert(blaj	=== false, 'Expected false but got "' + blaj + '"');
		assert(toShortHex	=== false, 'Expected false but got "' + toShortHex + '"');
		assert(toLongHex	=== false, 'Expected false but got "' + toLongHex + '"');

		done();
	});

	it('Should format a upper case string to lower case', function(done) {
		const	formatted	= utils.formatUuid('80D7B01D-E5D8-43A4-B5F1-E2703506860A');

		assert(formatted === '80d7b01d-e5d8-43a4-b5f1-e2703506860a', 'Expected "80d7b01d-e5d8-43a4-b5f1-e2703506860a" but got "' + formatted + '"');

		done();
	});
});
