
const debug = require('debug')('email');
const moment = require('moment');
const nodemailer = require('nodemailer');
const pug = require('pug');
const path = require('path');



class EmailReporter {
	constructor() {
		
	}
    async send (report) {
		debug(JSON.stringify(report, null, 2));
	}
}

module.exports = EmailReporter;