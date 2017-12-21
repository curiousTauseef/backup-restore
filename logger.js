const winston = require('winston');
const moment = require('moment-timezone');

const tsFormat = () => (moment(new Date()).tz('America/New_York').format('MMM-DD-YY hh:mm:ssa z'));
const logger = new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            timestamp: tsFormat,
            colorize: true,
        })
    ]
});

logger.level = process.env.LOG_LEVEL || "silly"
module.exports = logger;