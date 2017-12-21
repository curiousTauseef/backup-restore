
const debug = require('debug')('local store');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { spawn } = require('child_process');
			

class LocalStore {
	constructor() {
		this.directory = process.env.BACKUP_LOCAL_BACKUP_DIRECTORY || ".";
		const tmp = process.env.BACKUP_TMP_DIRECTORY || ".";
		this.move =( this.directory != tmp);
		this.listings_file_name = path.join(this.directory, 'backups.json');
	}
	async getBackupList () {
		const file_exists = fs.existsSync(this.listings_file_name);
		if ( file_exists) {
			return new Promise((resolve, reject) => {
				fs.readFile(this.listings_file_name, 'utf8', function(err, contents) {
					if ( err ) resolve([]);
					else {
						try {
							resolve(JSON.parse(contents));
						}
						catch (e) {
							resolve([]);
						}
					}
				})
			})
		}
		else {
			return [];
		}
	}
	async _write_backup_list (listings) {
		return new Promise((resolve, reject) => {
			fs.writeFile(this.listings_file_name, JSON.stringify(listings), function(err) {
				if ( err ) reject(err);
				else resolve(true);
			})
		})
	}
	async purgeBackup (backup) {
		debug(`Purging ${backup.file}`);
		const listings = await this.getBackupList();
		const index = listings.map(l => l.file).indexOf(backup.file);
		if ( index >= 0) {
			fs.unlinkSync(backup.file);
			listings.splice(index, 1);
			return this._write_backup_list(listings);
		}
		else return false;
	}
	async addBackup (archive) {
		if ( this.move ){
			debug('SKIPPING ARCHVIE MOVE')
		}
		const listings = await this.getBackupList();
		listings.push(archive);
		return this._write_backup_list(listings);
	}

    
}

module.exports = LocalStore;