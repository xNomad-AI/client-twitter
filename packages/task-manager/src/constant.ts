import assert from 'assert';
import * as crypto from 'crypto';
// load .env file
import dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(process.cwd(), '.env') });

const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
export const workerUuid = crypto.randomUUID();
// one proxy can used by how many users
export const HTTP_PROXY_MAX_USERS = 2;
// how long the task do not update the updateAt consider as timeout
export const taskTimeout = MINUTE * 7;
// how long the lock timeout to handle the action of client-twitter
export const leaseTime = MINUTE * 8;
// when detect the twitter account is suspended, how long to retry
export const suspendedAccountRetryInterval = HOUR * 12;
export const startFailedForMultipleTimesRetryInterval = HOUR * 8;
// TODO DenyLoginSubtask, other

export const TASK_MANAGER_ADMIN_API_KEY = process.env.TASK_MANAGER_ADMIN_API_KEY;

// mongodb settings start--------------------------------
export const mongodbUri = process.env.TASK_MONGODB_URI || process.env.MONGODB_URL;
assert(mongodbUri, 'TASK_MONGODB_URI is required');
//  || `${process.cwd()}/secrets/ca.crt`
export const mongodbCaFile = process.env.TASK_MONGODB_CA_FILE;
export const mongodbDbName = process.env.MONGODB_DB_NAME || 'core';
export const taskMongodbCollectionName = process.env.TASK_MONGODB_COLLECTION_NAME || 'ClientTwitterTask';
export const TASK_MONGODB_SETTINGS_COLLECTION_NAME = process.env.TASK_MONGODB_SETTINGS_COLLECTION_NAME || 'ClientTwitterTaskSettings';
export const lockMongodbCollectionName = process.env.LOCK_MONGODB_COLLECTION_NAME || 'ClientTwitterTaskLock';
// mongodb settings end--------------------------------

export const taskManagerHttpServicePort = process.env.TASK_MANAGER_HTTP_SERVICE_PORT || process.env.CORE_SERVER_PORT || 3000;
export const taskManagerBaseEndpoint = process.env.TASK_MANAGER_BASE_ENDPOINT || `http://localhost:${taskManagerHttpServicePort}`;
assert(taskManagerBaseEndpoint, 'TASK_MANAGER_BASE_ENDPOINT is required');

// used for local running
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const TWITTER_HTTP_PROXY = process.env.TWITTER_HTTP_PROXY;
export const TWITTER_USERNAME = process.env.TWITTER_USERNAME;
export const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;
export const TWITTER_2FA_SECRET = process.env.TWITTER_2FA_SECRET;
export const TWITTER_EMAIL = process.env.TWITTER_EMAIL;
