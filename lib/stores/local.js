const debug = require('debug')('local store');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../../logger');

class LocalStore {
    constructor() {
        this.directory = process.env.BACKUP_LOCAL_BACKUP_DIRECTORY || ".";
        const tmp = process.env.BACKUP_TMP_DIRECTORY || ".";
        this.move = (this.directory != tmp);
        this.listings_file_name = path.join(this.directory, 'backups.json');
    }
    async getBackupList() {
        const file_exists = fs.existsSync(this.listings_file_name);
        if (file_exists) {
            return new Promise((resolve, reject) => {
                fs.readFile(this.listings_file_name, 'utf8', function(err, contents) {
                    if (err) resolve([]);
                    else {
                        try {
                            resolve(JSON.parse(contents));
                        } catch (e) {
                            logger.error(e);
                            resolve([]);
                        }
                    }
                })
            })
        } else {
            return [];
        }
    }
    async _write_backup_list(listings) {
        return new Promise((resolve, reject) => {
            fs.writeFile(this.listings_file_name, JSON.stringify(listings), function(err) {
                if (err) {
                    logger.error(err);
                    reject(err);
                } else resolve(true);
            })
        })
    }
    async purgeBackup(backup) {
        debug(`Purging ${backup.file}`);
        const listings = await this.getBackupList();
        const index = listings.map(l => l.file).indexOf(backup.file);
        if (index >= 0) {
            fs.unlinkSync(backup.file);
            listings.splice(index, 1);
            return this._write_backup_list(listings);
        } else return false;
    }
    async addBackup(backup) {
        if (this.move) {
            debug('SKIPPING ARCHVIE MOVE')
        }
        const stats = fs.statSync(backup.file)
        const fileSizeInBytes = stats.size
        const mb = fileSizeInBytes / 1048576
        const gb = fileSizeInBytes / 1073741824
        const size = gb < 1 ? `${mb.toFixed(2)} MB` : `${gb.toFixed(2)} GB`;
        backup.size = size;
        const listings = await this.getBackupList();
        listings.push(backup);
        return this._write_backup_list(listings);
    }


}

module.exports = LocalStore;