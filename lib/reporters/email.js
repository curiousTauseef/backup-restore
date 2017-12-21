
const debug = require('debug')('email');
const moment = require('moment');
			

class EmailReporter {
	constructor() {
		
	}
    async send (report) {
		debug(report);
	}
}

module.exports = EmailReporter;