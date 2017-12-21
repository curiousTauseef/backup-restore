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

	async take_backup() {
		try {
			const backup = await this.source.archive();
			return backup;
		} catch(err) {
			debug(`Error making backup, this must be reported`);
			debug(err);
			await this.reporter.send({
				error:err,
				step: 'Taking backup from source'
			})
			return undefined;
		}
	}
	async store_backup(backup){
		try {
			await this.store.addBackup(backup);
			return true;
		} catch(err) {
			debug(`Error storing backup, this must be reported`);
			debug(err);
			await this.reporter.send({
				error:err,
				step: 'Storing backup to backup location'
			})
			return false;
		}

	}

	async purge_old () {
		try {
			// Now check if we should purge anything
			let current_backups = await this.store.getBackupList();
			debug(`There are ${current_backups.length} out of max ${this.max_backups}`)
			const to_purge = current_backups.length - this.max_backups;
			const purged = [];
			if ( current_backups.length > this.max_backups) {
				debug(`Purging ${to_purge} backups`);
			
				for ( let i = 0; i < to_purge; i++ ) {
					await this.store.purgeBackup(current_backups[i]);
					purged.push(current_backups[i]);
				}
			}

			return purged;

		} catch(err) {
			debug(`Error purging old backups, this must be reported`);
			debug(err);
			await this.reporter.send({
				error:err,
				step: 'Purging backups'
			})
			return false;
		}
	}
	async start() {
		debug(`Backup service started`);
		
		const before = await this.check_disks();
		const backup = this.take_backup();
		if ( !backup ) return false;


		const after_backup = await this.check_disks();
		const stored = await this.store_backup(backup);
		if (!stored) return false;

		const purged = this.purge_old();
		if ( purged === false ) return false;
		
		const after_purge = await this.check_disks();
		await this.reporter.send({
			disk: [before, after_backup, after_purge],
			purged: purged,
			backed_up: backup
		})

		return true;
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