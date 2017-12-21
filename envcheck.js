const logger = require('./logger');


module.exports = (component, required) => {
    required.forEach(function(prop) {
        if (process.env[prop] === undefined) {
            logger.error(`${component} configuration ERROR - missing required environment variable ${prop}`);
        }
    });
}