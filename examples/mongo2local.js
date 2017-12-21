require('dotenv').config()

const backup = require('../index');

const backup_service = new backup.Service(backup.MongoSource, backup.LocalStore);

backup_service.start();