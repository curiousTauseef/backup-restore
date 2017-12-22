exports.LocalStore = require('./lib/stores/local');
exports.MongoSource = require('./lib/sources/mongo');
exports.EmailReporter = require('./lib/reporters/email');

const debug = require('debug')('backup');
const njds = require('nodejs-disks');
const schedule = require('node-schedule');

const logger = require('./logger');
const checker = require('./envcheck.js');


class Service {
    constructor(source, store, reporter) {
        this.source = new source();
        this.store = new store();
        this.reporter = new reporter();
        checker('Backup core', ['BACKUP_INSTANCE_NAME', 'BACKUP_SCHEDULE'])
        this.instance = process.env.BACKUP_INSTANCE_NAME
        this.max_backups = process.env.BACKUP_MAX_ARCHIVES | 1;
        this.cron = process.env.BACKUP_SCHEDULE;

        if ( !this.store.initialize ) 
            this.store.initialize =  async () => { return true;};
        if ( !this.store.cleanup ) 
            this.store.cleanup = async () => {return true};
    }

    async take_backup() {
        try {
            const backup = await this.source.archive();
            return backup;
        } catch (err) {
            debug(`Error making backup, this must be reported`);
            debug(err);
            await this.reporter.sendError({
                error: err,
                step: 'Taking backup from source'
            })
            return undefined;
        }
    }
    async store_backup(backup) {
        try {
            await this.store.addBackup(backup);
            return true;
        } catch (err) {
            debug(`Error storing backup, this must be reported`);
            debug(err);
            await this.reporter.sendError({
                error: err,
                step: 'Storing backup to backup location'
            })
            return false;
        }

    }

    async purge_old() {
        try {
            // Now check if we should purge anything
            let current_backups = await this.store.getBackupList();
            debug(`There are ${current_backups.length} out of max ${this.max_backups}`)
            const to_purge = current_backups.length - this.max_backups;
            const purged = [];
            if (current_backups.length > this.max_backups) {
                debug(`Purging ${to_purge} backups`);

                for (let i = 0; i < to_purge; i++) {
                    await this.store.purgeBackup(current_backups[i]);
                    purged.push(current_backups[i]);
                }
            }

            return purged;

        } catch (err) {
            debug(`Error purging old backups, this must be reported`);
            debug(err);
            await this.reporter.sendError({
                error: err,
                step: 'Purging backups'
            })
            return false;
        }
    }
    async start() {
        debug(`Backup service started`);
        debug(`Running on schedule:  ${this.cron}`);

        logger.info(`Backup service for ${this.instance} schedule started [${this.cron}]`);
        const self = this;
        this.service = schedule.scheduleJob(this.cron, async function() {
            const result = await self.do_backup();
            if (result) {
                logger.info(` - Backup successful.`);
                debug(`Backup successful`);
            } else {
                logger.err(` x Backup has failed.`);
                debug(`Backup failed!`);
            }
        });


    }

    stop() {
        this.service.cancel();
        debug(`Backup service stopped`);
        logger.info(`Backup stopped`);
    }

    async do_backup() {
        if (!this.store.initialize() ) {
            await this.reporter.sendError({
                error: new Error(`Store could not be initialized`),
                step: 'Initializing backup store'
            })
            return false
        }

        logger.verbose(`Taking backup from data source`);
        const before = await this.check_disks();
        const backup = await this.take_backup();
        if (!backup) {
            logger.error(` x Backup failed while taking backup from data source.`);
            this.store.cleanup();
            return false;
        }

        logger.verbose(`Storing backup to archive store.`);
        const after_backup = await this.check_disks();
        const stored = await this.store_backup(backup);
        if (!stored) {
            logger.error(` x Backup failed while storing backup on archive store`);
            this.store.cleanup();
            return false;
        }

        logger.verbose(`Purging older backups.`);
        const purged = await this.purge_old();
        if (purged === false) {
            logger.error(` x Backup failed while purging older backups`);
            this.store.cleanup();
            return false;
        }

        const after_purge = await this.check_disks();
        await this.reporter.send({
            disk: {
                before: before,
                store: after_backup,
                after: after_purge
            },
            purged: purged,
            backed_up: backup
        });
        this.store.cleanup();

        return true;
    }
    async check_disks() {
        return new Promise((resolve, reject) => {
            njds.drives((err, drives) => {
                if (err) return reject(err);
                njds.drivesDetail(drives, (err, data) => {
                    if (err) return reject(err);
                    resolve(data);
                });
            })
        })
    }
}

exports.Service = Service;