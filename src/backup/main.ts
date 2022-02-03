import {
    auth,
    drive as googleDrive,
} from '@googleapis/drive';
import { backup as Constants } from '../util/Constants';
import { GaxiosError } from 'gaxios';
import { googleApp, refreshToken } from '../../config.json';
import { Log } from '../util/Log';
import { setTimeout } from 'node:timers/promises';
import fsSync from 'node:fs';
import ErrorHandler from '../util/errors/ErrorHandler';
import process from 'node:process';
import Timeout from '../util/Timeout';

/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */

process.on('exit', exitCode => {
    Log.log(`Exiting with code ${exitCode}`);
});

process.on('unhandledRejection', async error => {
    Log.error('unhandledRejection');
    await ErrorHandler.init(error);
    process.exit(1);
});

process.on('uncaughtException', async error => {
    Log.error('uncaughtException');
    await ErrorHandler.init(error);
    process.exit(1);
});

const {
    addError,
    isTimeout,
    getPauseFor,
    getTimeout,
} = new Timeout('backup', { baseTimeout: 300_000 });

const {
    client_id,
    client_secret,
    redirect_uris,
} = googleApp.installed;

const oauth2Client = new auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
);

oauth2Client.on('tokens', ({ expiry_date }) => {
    Log.log(`New access token expires ${expiry_date}`);
});

(async () => {
    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });

    const drive = googleDrive({
        version: 'v3',
        auth: oauth2Client,
    });

    while (true) {
        try {
            if (isTimeout()) {
                const timeout = getTimeout()!;
                await setTimeout(timeout.pauseFor);
            }

            const time = new Date().toLocaleString(
                undefined,
                { hour12: false },
            );

            await drive.files.create({
                requestBody: {
                    name: `${time}.db`,
                    parents: [Constants.parentFolder],
                },
                media: {
                    mimeType: 'application/octet-stream',
                    body: fsSync.createReadStream(`${__dirname}/../../database.db`),
                },
            });

            Log.log('Uploaded backup');

            await setTimeout(Constants.interval / 6);
        } catch (error) {
            if (error instanceof GaxiosError) {
                const code = Number(error.code);
                Log.error(`Ran into a ${code}`);

                if (
                    code >= 500 ||
                    code === 429 ||
                    code === 408
                ) {
                    await ErrorHandler.init(error);
                    addError();
                    const pauseFor = getPauseFor();
                    Log.error(`Added timeout, pausing for ${pauseFor}ms`);
                    continue;
                }
            }

            Log.error('Unrecoverable error. Ending process.');

            await ErrorHandler.init(error);

            process.exit(1);
        }
    }
})();