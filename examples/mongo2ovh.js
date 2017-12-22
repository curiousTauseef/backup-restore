require('dotenv').config()

const backup = require('../index');

const backup_service = new backup.Service(backup.MongoSource, backup.OVHStore, backup.EmailReporter);

//backup_service.start();

backup_service.do_backup();