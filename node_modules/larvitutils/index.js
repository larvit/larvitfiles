'use strict';

/**
 * Convert hrtime diff to milliseconds
 *
 * @param arr prevTime - the output from process.hrtime() to diff to
 * @param int precision - defaults to 2
 * @return string - time diff in milliseconds rounded to given precision
 */
function hrtimeToMs(prevTime, precision) {
	const	diff	= process.hrtime(prevTime);

	if (precision === undefined) {
		precision = 2;
	}

	return (diff[0] * 1000 + (diff[1] / 1000000)).toFixed(precision);
};

function escapeRegExp(str) {
	return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

/**
 * Formats an uuid string
 * For example adds missing "-", trimming spaces etc
 *
 * @param str uuidStr - Can also take a buffer
 * @return str uuid string or false on failure
 */
function formatUuid(uuidStr) {

	// If a buffer, get the string representation
	if (Buffer.isBuffer(uuidStr))
		uuidStr = uuidStr.toString('hex');

	// Now uuidStr MUST be a string
	if (typeof uuidStr !== 'string')
		return false;

	// Remove all but hex characters
	uuidStr = uuidStr.replace(/[^A-Fa-f0-9]/g, '').toLowerCase();

	// All uuid strings have exactly 32 hex characters!
	if (uuidStr.length !== 32)
		return false;

	// Add dashes in the right places
	uuidStr = uuidStr.substring(0, 8) + '-' + uuidStr.substring(8, 12) + '-' + uuidStr.substring(12, 16) + '-' + uuidStr.substring(16, 20) + '-' + uuidStr.substring(20);

	return uuidStr;
};

/**
 * Replace all occurances of a string in a string and return the result
 *
 * @param	str	search
 * @param	str	replace
 * @param	str	str
 *
 * @return str
 */
function replaceAll(search, replace, str) {
	return str.replace(new RegExp(escapeRegExp(search), 'g'), replace);
}

/**
 * Make a buffer from an uuid string
 *
 * @param str uuidStr - Can be with or without dashes, padded spaces etc will be trimmed
 * @return buffer or false on fail
 */
function uuidToBuffer(uuidStr) {
	// Remove all but hex characters
	uuidStr = uuidStr.replace(/[^A-Fa-f0-9]/g, '');

	// All uuid strings have exactly 32 hex characters!
	if (uuidStr.length !== 32)
		return false;

	return new Buffer(uuidStr, 'hex');
};

exports.hrtimeToMs	= hrtimeToMs;
exports.formatUuid	= formatUuid;
exports.replaceAll	= replaceAll;
exports.uuidToBuffer	= uuidToBuffer;
