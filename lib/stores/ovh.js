const logger = require('../../logger');
const request = require('request');
const fs = require('fs');
const debug = require('debug')('ovh');
const checker = require('../../envcheck');
const {
    spawn
} = require('child_process');
const {
    promisify
} = require('util');
const path = require('path');

const ovh = require('ovh')({
    endpoint: process.env.BACKUP_OVH_ENDPOINT,
    appKey: process.env.BACKUP_OVH_APP_KEY,
    appSecret: process.env.BACKUP_OVH_APP_SECRET,
    consumerKey: process.env.BACKUP_OVH_CONSUMER_KEY
});

class OVHStore {
    constructor() {
        checker('Mongo data source', ['BACKUP_OVH_ENDPOINT', 'BACKUP_OVH_APP_KEY',
            'BACKUP_OVH_APP_SECRET', 'BACKUP_OVH_CONSUMER_KEY'
        ])
        this.instance = process.env.BACKUP_INSTANCE_NAME;
        this.default_region = process.env.BACKUP_OVH_DEFAULT_REGION || "BHS";
        this.listings_object = 'backups.json';
        this.local_listings_path = path.join(process.env.BACKUP_TMP_DIRECTORY, this.listings_object);
        this.retries = process.env.BACKUP_STORE_RETRY_COUNT || 5;

        const self = this;
        this.ovh_request = async (verb, path) => {
            return new Promise((resolve, reject) => {
                debug(`${verb}: ${path}`);
                ovh.request(verb, path, function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                })

            })
        }
    }

    get container() {
        return `${this.access.default_endpoint.url}/${this.instance}_backups/`;
    }
    async wait_retry() {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, 5000);
        })
    }
    async initialize() {
        for (let i = 0; i < this.retries; i++) {
            try {
                await this._connect();
                await this._ensure_backup_container();
                return true;
            } catch (err) {

                logger.error(`Error initializing OVH backup session - attempt ${i+1} / ${this.retries}.`);
                logger.error(err);
                if (i == this.retries - 1) {
                    return false;
                } else {
                    this.wait_retry();
                }
            }
        }
    }
    async cleanup() {
        this.service = null
        this.access = null;
        return true;
    }

    async _ensure_backup_container() {
        debug(`Checking for ${this.instance } backup container at ${this.container}`);
        const payload = {
            method: 'PUT',
            url: this.container,
            headers: {
                'X-Auth-Token': this.access.token
            }
        }
        return new Promise((resolve, reject) => {
            request(payload, function (err, response, body) {
                if (err) {
                    debug(`Failed to ensure container exists`);
                    reject(err);
                } else if (!(response.statusCode + "").startsWith("2")) {
                    logger.error(`Error putting container on OVH`);
                    logger.error(response.statusCode);
                    logger.error(body)
                    debug(`Failed to ensure container exists - status code ${response.statusCode} returned.`);
                    reject(new Error(`Response code ${response.statusCode} received from OVH on container put`));
                } else {
                    resolve()
                }
            });
        })
    }

    async _local_backup_list() {
        const file_exists = fs.existsSync(this.local_listings_path);
        if (file_exists) {
            return new Promise((resolve, reject) => {
                fs.readFile(this.local_listings_path, 'utf8', function (err, contents) {
                    if (err) {
                        debug(`Failed to read local listings file`);
                        resolve([]);
                    } else {
                        try {
                            debug(`Parsing local listings file`);
                            resolve(JSON.parse(contents));
                            debug(`Parsed local listings successfully`);
                        } catch (e) {
                            debug(`Failed to read local listings file`);
                            resolve([]);
                        }
                    }
                })
            })
        } else {
            return [];
        }
    }

    async getBackupList() {
        try {
            await this._get_object(this.listings_object, this.local_listings_path);
            return await this._local_backup_list();
        } catch (err) {
            debug(`Error getting backup listings`);
            debug(err);
            return [];
        }
    }

    async _write_local_backup_list(listings) {
        debug(`Writing local backup list to disk ${this.local_listings_path}`);
        const self = this;
        return new Promise((resolve, reject) => {
            fs.writeFile(self.local_listings_path, JSON.stringify(listings), function (err) {
                if (err) {
                    debug(err);
                    logger.error(err);
                    reject(err);
                } else {
                    debug(`Wrote local backup list to disk at ${self.local_listings_path}`)
                    resolve(true);
                }
            })
        })
    }
    async _write_backup_list(listings) {
        await this._write_local_backup_list(listings);
        await this._put_object(this.listings_object, this.local_listings_path);
        return true;
    }
    async purgeBackup(backup) {
        debug(`Purging ${ backup.file }`);
        const listings = await this.getBackupList();
        const index = listings.map(l => l.file).indexOf(backup.file);
        if (index >= 0) {
            await this._delete_object(path.basename(backup.file));
            listings.splice(index, 1);
            return this._write_backup_list(listings);
        } else return false;
    }

    async addBackup(backup) {
        for (let i = 0; i < this.retries; i++) {
            const stats = fs.statSync(backup.file)
            const fileSizeInBytes = stats.size
            const mb = fileSizeInBytes / 1048576
            const gb = fileSizeInBytes / 1073741824
            const size = gb < 1 ? `${mb.toFixed(2)} MB` : `${gb.toFixed(2)} GB`;
            backup.remote_url = `${this.container}/${path.basename(backup.file)}`
            backup.size = size;
            try {
                await this._put_object(path.basename(backup.file), backup.file);
                const listings = await this.getBackupList();
                listings.push(backup);

                await this._write_backup_list(listings);
                fs.unlinkSync(backup.file);
                return true;
            } catch (err) {
                logger.error(`Error uploading backup to OVH - attempt ${i+1} / ${this.retries}.`);
                logger.error(err);
                if (i == this.retries - 1) {
                    return false;
                } else {
                    this.wait_retry();
                }
            }
        }
    }

    async _connect() {
        debug('Establishing connection with OVH storage cloud');

        const services = await this.ovh_request('GET', '/cloud/project');
        debug(`Retrieved ${ services.length } services from OVH `);

        this.service = services[0];
        this.access = await this._get_access();
        debug(`Access points retrieved for ${ this.service }.`);
        debug(`Access token = ${this.access.token}`)
    }

    async _get_access() {
        debug(`Acquiring access token for service ${ this.service }`);
        const access = await this.ovh_request('GET', `/cloud/project/${ this.service }/storage/access`);

        debug(`Got access token ${ access.token } for ${ access.endpoints.length } endpoints`);
        let _access = {
            endpoints: {},
            token: access.token
        };
        for (let i = 0; i < access.endpoints.length; i++) {
            let endpoint = access.endpoints[i];
            _access[endpoint.region] = endpoint.url;
            if (endpoint.region.startsWith(this.default_region)) {
                debug(` - Default endpoint selected [${ endpoint.region }] url = ${ endpoint.url }`);
                _access.default_endpoint = endpoint;
            }
        }
        return _access;
    }


    async _download_backup(backup) {
        const local_path = path.join('.', path.basename(backup.file));
        const args = [];
        args.push(`--os-auth-token`)
        args.push(this.access.token)
        args.push(`--os-storage-url`)
        args.push(this.access.default_endpoint.url)
        args.push(`download`)
        args.push(`--output`)
        args.push(local_path)
        args.push(`${this.instance}_backups`)
        args.push(path.basename(backup.file))

        return new Promise((resolve, reject) => {
            const swift = spawn('swift', args);

            swift.stderr.on('data', (data) => {
                debug(`Error downloading file`);
                debug(data);
                reject(data);
            });

            swift.on('close', (code) => {
                resolve();
            });
        })
    }

    async _get_object(name, local_path) {
        const url = `${this.container}${name}`;
        const payload = {
            method: 'GET',
            url: url,
            headers: {
                'X-Auth-Token': this.access.token
            }
        }
        debug(`Downloading ${name} to ${local_path} from ${url}`);
        const destination = fs.createWriteStream(local_path);

        return new Promise((resolve, reject) => {
            destination.on('finish', function () {
                resolve();
            })
            request
                .get(payload)
                .on('error', function (err) {
                    reject(err)
                })
                .pipe(destination);
        })
    }
    async _put_object(name, local_path) {
        const url = `${this.container}${name}`;

        debug(`Uploading ${name} from ${local_path} to ${url}`);

        const args = [];
        args.push(`--os-auth-token`)
        args.push(this.access.token)
        args.push(`--os-storage-url`)
        args.push(this.access.default_endpoint.url)
        args.push(`upload`)
        args.push(`--segment-size`)
        args.push(`100000000`)
        args.push(`--object-name`)
        args.push(name)
        args.push(`${this.instance}_backups`)
        args.push(local_path)

        return new Promise((resolve, reject) => {
            const swift = spawn('swift', args);

            swift.stdout.on('data', (data) => {
                debug(`stdout: ${data}`);
            });

            swift.stderr.on('data', (data) => {
                debug(`Error uploading file`);
                debug(data);
                reject(data);
            });

            swift.on('close', (code) => {
                resolve();
            });
        })

    }

    async _delete_object(name) {
        const url = `${this.container}${name}`;
        const payload = {
            method: 'DELETE',
            url: url,
            headers: {
                'X-Auth-Token': this.access.token
            }
        }
        debug(`Deleting ${name} from ${url}`);

        const args = [];
        args.push(`--os-auth-token`)
        args.push(this.access.token)
        args.push(`--os-storage-url`)
        args.push(this.access.default_endpoint.url)
        args.push(`delete`)
        args.push(`${this.instance}_backups`)
        args.push(name)

        return new Promise((resolve, reject) => {
            const swift = spawn('swift', args);

            swift.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            swift.stderr.on('data', (data) => {
                debug(`Error deleting file`);
                debug(data);
                // Don't fail - if it was supposed to be deleted, and couldn't be, just log the problem.
                resolve();
            });

            swift.on('close', (code) => {
                resolve();
            });
        })
    }
}

module.exports = OVHStore;