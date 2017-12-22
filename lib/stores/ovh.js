const logger = require('../../logging');
const request = require('request');
const fs = require('fs');
const debug = require('debug')('ovh');

const {promisify} = require('util');
const ovh_request = promisify(ovh.request);

class OVHStore {
    constructor() {
        checker('Mongo data source', 
            ['BACKUP_OVH_ENDPOINT', 'BACKUP_OVH_APP_KEY', 
            'BACKUP_OVH_APP_SECRET', 'BACKUP_OVH_CONSUMER_KEY'])

        this.creds = {
            endpoint: process.env.BACKUP_OVH_ENDPOINT,
            appKey: process.env.BACKUP_OVH_APP_KEY,
            appSecret: process.env.BACKUP_OVH_APP_SECRET,
            consumerKey: process.env.BACKUP_OVH_CONSUMER_KEY
        }

        this.default_region = process.env.BACKUP_OVH_DEFAULT_REGION || "BHS";

        this.listings_object = 'backups.json';
    }

    async _connect() {
        debug('Establishing connection with OVH storage cloud');
        
        const services = await ovh_request('GET', '/cloud/project');
        debug(`Retrieved ${services.length} services from OVH`);

        this.service = services[0];
        this.acccess = await this._get_access();
        debug(`Access points retrieved for ${this.service}.`);
    }

    async _get_access() {
        debug( `Acquiring access token for service ${service}`);
        const access = await ovh_request('GET', `/cloud/project/${this.service}/storage/access`);
        
        debug(`Got access token ${access.token} for ${access.endpoints.length} endpoints`);
        const _access = {
            endpoints: {},
            token: access.token
        };
        for (let i = 0; i < access.endpoints; i++ ) {
            let endpoint = access.endpoints[i];
            _access[endpoint.region] = endpoint.url;
            debug(` - Access token [${endpoint.region}] url = ${endpoint.url}`);
            if ( endpoint.region.startsWith(this.default_region)) {
                debug(` -- Default endpoint selected ${this.default_region}`);
                _access.default_endpoint = endpoint;
            }
        }
        return _access;
    }
}




exports.make_container = function (access, feed, callback) {
    var payload = {
        method: 'PUT',
        url: `${access.default_endpoint.url}/${feed._id}/`,
        headers: {
            'X-Auth-Token': access.token
        }
    }
    request(payload, function (err, response, body) {
        if (err) {
            callback(err);
        } else if (!(response.statusCode + "").startsWith("2")) {
            callback(`Response code ${response.statusCode} received from OVH on container put`);
        } else {
            callback(null);
        }
    });
    //curl -X PUT -H "X-Auth-Token: [STORAGE_ACCESS_TOKEN]" {SWIFT_ENDPOINT}/v1/AUTH_[SERVICE_NAME]/default/
}

exports.delete_container = function (access, feed, callback) {
    var deleters = [];
    list(access, feed, function (err, container) {
        if (err) {
            return callback(err);
        }
        if (!container) return callback();
        container.objects.forEach(obj => {
            deleters.push(function (done) {
                var payload = {
                    method: 'DELETE',
                    url: `${access.default_endpoint.url}/${feed._id}/${obj.name}`,
                    headers: {
                        'X-Auth-Token': access.token
                    }
                }
                logger.silly(`Deleting object ${feed._id}/${obj.name}`);
                request(payload, done);
            })
        })
        async.parallel(deleters, function () {
            var payload = {
                method: 'DELETE',
                url: `${access.default_endpoint.url}/${feed._id}/`,
                headers: {
                    'X-Auth-Token': access.token
                }
            }
            logger.silly(`Deleting container ${feed._id}`);
            request(payload, function (err, response, body) {
                if (err) {
                    callback(err);
                } else if (!(response.statusCode + "").startsWith("2")) {
                    callback(`Response code ${response.statusCode} received from OVH on container put`);
                } else {
                    callback(null);
                }
            });
        })
    })


    


}

/*

var list_containers = exports.list_containers = function (access, callback) {
    ovh.request('GET', `/cloud/project/${access.service}/storage`, function (err, containers) {
        callback(err, containers);
    })
}

var list = exports.list = function (access, feed, callback) {
    list_containers(access, function (err, containers) {
        if (err || !containers) {
            return callback('No containers returned from OVH');
        }
        var c = containers.find(c => c.name == feed._id);
        if (!c) {
            return callback(`No container with name ${feed._id} found.`);
        }
        ovh.request('GET', `/cloud/project/${access.service}/storage/${c.id}`, callback)
    })
}


exports.put = function (access, recording, options, callback) {
    var payload = {
        method: 'PUT',
        url: `${access.default_endpoint.url}/${recording.feedId}/${recording.filename}`,
        body: fs.createReadStream(options.local_path),
        headers: {
            'X-Auth-Token': access.token
        }
    }
    if (options.delete_after) {
        payload.headers['X-Delete-After'] = options.delete_after;
    }
    request(payload, function (err, response, body) {
        if (err) {
            callback(err);
        } else if (!(response.statusCode + "").startsWith("2")) {
            callback(`Response code ${response.statusCode} received from OVH on recording put`);
        } else {
            callback(null);
        }
    });
}



exports.get = function (access, recording, local_path, callback) {
    var payload = {
        method: 'GET',
        url: `${access.default_endpoint.url}/${recording.feedId}/${recording.filename}`,
        headers: {
            'X-Auth-Token': access.token
        }
    }
    logger.silly(`Retrieving ${recording.feedId}/${recording.filename} from OVH cloud.`);
    var destination = fs.createWriteStream(local_path);
    destination.on('finish', function () {
        callback();
    })
    request
        .get(payload)
        .on('error', function (err) {
            callback(err);
        })
        .pipe(destination);
}

exports.delete = function (access, recording, callback) {
    var payload = {
        method: 'DELETE',
        url: `${access.default_endpoint.url}/${recording.feedId}/${recording.filename}`,
        headers: {
            'X-Auth-Token': access.token
        }
    }
    logger.verbose(`Deleting object at ${payload.url}`);
    request(payload, function (err, response, body) {
        if (err) {
            callback(err);
        } else if (!(response.statusCode + "").startsWith("2")) {
            callback(`Response code ${response.statusCode} received from OVH on recording put`);
        } else {
            callback(null);
        }
    });
}
*/