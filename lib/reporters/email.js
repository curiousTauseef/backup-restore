const debug = require('debug')('email');
const moment = require('moment');
const nodemailer = require('nodemailer');
const pug = require('pug');
const path = require('path');

const success_file = path.join(__dirname, "success.pug");
const success = pug.compileFile(success_file);

const failure_file = path.join(__dirname, "failure.pug");
const failure = pug.compileFile(failure_file);
const logger = require('../../logger');
const checker = require('../../envcheck');


class EmailReporter {
    constructor() {
        checker('Mongo data source', ['SMTP', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'BACKUP_EMAIL_RECIPIENTS'])
        this.smtpConfig = {
            host: process.env.SMTP,
            port: process.env.SMTP_PORT || 25,
            secure: process.env.SMTP_SECURE || false,
            auth: {
                user: process.env.SMTP_USERNAME,
                pass: process.env.SMTP_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        };
        this.recipients = process.env.BACKUP_EMAIL_RECIPIENTS.split(';')
        this.transporter = nodemailer.createTransport(this.smtpConfig);

    }
    async send(report) {
        const subject = `${process.env.BACKUP_INSTANCE_NAME} backup SUCCESS - ${moment().format('YYYY-MM-DD [at] HH:mm ZZ')}`;
        const mailOptions = this.make_mail_options(this.recipients, subject, report, success);

        this.transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                logger.error()
                logger.error("Could not send email using the following user:")
                logger.error(process.env.SMTP_USERNAME)
                logger.error(error);
            } else {
                logger.verbose("Email sent successfully");
            }
        });
    }
    async sendError(report) {
        debug(JSON.stringify(report, null, 2));
        const subject = `${process.env.BACKUP_INSTANCE_NAME} backup FAILED - ${moment().format('YYYY-MM-DD [at] HH:mm ZZ')}`;
        const mailOptions = this.make_mail_options(this.recipients, subject, report, failure);

        this.transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                logger.error("Could not send email using the following user:")
                logger.error(process.env.SMTP_USERNAME)
                logger.error(error);
            } else {
                logger.verbose("Email sent successfully");
            }
        });
    }

    make_mail_options(recipient, subject, template_params, html) {
        var sender = process.env.SMTP_SENDING_ADDRESS;
        var recipient = process.env.LIVE_EMAIL ? recipient : process.env.SMTP_RECIPIENT_OVERRIDE;
        var mailOptions = {
            from: sender,
            to: recipient,
            subject: subject,
            html: html(template_params)
        };
        if (!process.env.LIVE_EMAIL) {
            logger.info("WARNING:  Emails are being sent only to " + process.env.SMTP_RECIPIENT_OVERRIDE + ", to enable emailing to actual recipients you must enable live email by setting LIVE_EMAIL environment variable to true.")
        }
        return mailOptions;
    }
}

module.exports = EmailReporter;