
const debug = require('debug')('mongo');
const debug_dump = require('debug')('mongodump');
const path = require('path');
const moment = require('moment');
const { spawn } = require('child_process');
			

class BackupSource {
	constructor() {
		this.db = process.env.BACKUP_DATABASE_NAME;
		this.host = process.env.BACKUP_DATABASE_HOST || 'localhost';
		this.port = process.env.BACKUP_DATABASE_PORT || 27017;
		this.user = process.env.BACKUP_DATABASE_USERNAME;
		this.password = process.env.BACKUP_DATABASE_PASSWORD;
		this.tmp_directory = process.env.BACKUP_TMP_DIRECTORY || ".";

		debug(`Mongo data source - database name:  ${this.db}`);
		debug(`Mongo data source - database host:  ${this.host}`);
		debug(`Mongo data source - database port:  ${this.port}`);
		if ( this.user ) {
			debug(`Mongo data source - database username:  	${this.user}`);
		}
		debug(`Mongo data source - tmp target dir: ${this.tmp_directory}`);
	}
    async archive () {
		// Returns an object with a local filename and a date
		// Throws exception if unabled to create local archive file
		const time = moment();
		const timestamp = moment().format("YYYY-MM-DD__HH-mm-ss");
		const filename = path.resolve(path.join(this.tmp_directory, `${timestamp}.gz`));
		debug(`Archiving database to ${filename}`);
		const self = this;
		return new Promise((resolve, reject) => {
			let args = ['--db', self.db, 
				"--host", self.host,
				"--port", self.port, 
				`--archive=${filename}`, 
				"--gzip"];
			debug_dump(`Executing mongodump ${args.join(" ")}`);
			const mongodump = spawn('mongodump',args);

			mongodump.stdout.on('data', (data) => {
			  debug_dump(`stdout: ${data}`);
			});

			mongodump.stderr.on('data', (data) => {
			  debug_dump(`stderr: ${data}`);
			});

			mongodump.on('close', (code) => {
			  debug_dump(`child process exited with code ${code}`);
			  if ( code != 0 ) {
			  	reject(new Error(`mongodump exited with exit code ${code}`));
			  }
			  else {
			  	resolve({time: time.format(), file: filename});
			  }
			});
		})
	}
}

module.exports = BackupSource;