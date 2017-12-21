exports.LocalStore = require('./lib/stores/local');
exports.MongoSource = require('./lib/sources/mongo');


const debug = require('debug')('backup');
const njds = require('nodejs-disks');

class Service {
	constructor(source, store) {
		this.source = new source();
		this.store = new store();
		this.max_backups = process.env.BACKUP_MAX_ARCHIVES | 1
	}


	async start() {
		debug(`Backup service started`);

		try {
			const before = await this.check_disks();
			const archive = await this.source.archive();
			const after_archive = await this.check_disks();
			await this.store.addBackup(archive);

			// Now check if we should purge anything
			let current_backups = await this.store.getBackupList();
			debug(`There are ${current_backups.length} out of max ${this.max_backups}`)
			const to_purge = current_backups.length - this.max_backups;
			debug(`Purging ${to_purge} backups`);
			if ( current_backups.length > this.max_backups) {
				for ( let i = 0; i < to_purge; i++ ) {
					await this.store.purgeBackup(current_backups[i]);
				}
			}

			const after_store = await this.check_disks();
		} catch(err) {
			debug(`Error archiving, this must be reported`);
			debug(err);
		}
	}

	async check_disks() {
		return new Promise((resolve, reject) => {
			njds.drives((err, drives) => {
				if ( err ) return reject(err);
            	njds.drivesDetail(drives,(err, data) => {
			    	if ( err ) return reject(err);
			    	resolve(data);
               	});
        	})
		})
	}
}

exports.Service = Service;