import path from 'path';
import {
  AgentRuntime,
  CacheManager,
  FsCacheAdapter,
  Character,
  ModelProviderName,
} from '@elizaos/core';
import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import Database from 'better-sqlite3';
import { assert } from 'console';
import dotenv from 'dotenv';

import { wrapperFetchFunction } from '@elizaos/client-twitter';

// import { register } from '../src/monitor/metrics';
dotenv.config();

const openApiKey = process.env.OPENAI_API_KEY;
assert(openApiKey, 'OPENAI_API_KEY is required');

const TWITTER_HTTP_PROXY = process.env.TWITTER_HTTP_PROXY;
const TWITTER_TOPIC = process.env.TWITTER_TOPIC;
const TWITTER_POST_TEMPLATE = process.env.TWITTER_POST_TEMPLATE;

type UUID = `${string}-${string}-${string}-${string}-${string}`;
const baseDir = path.resolve(process.cwd(), 'data');

function initializeFsCache(character: Character) {
  const cacheDir = path.resolve(baseDir, character.id as any, 'cache');
  const cache = new CacheManager(new FsCacheAdapter(cacheDir));
  return cache;
}

export function initCharacter(
  name: string,
  settings: Character['settings'],
): Character {
  return {
    id: name as UUID,
    name,
    modelProvider: ModelProviderName.OPENAI,
    bio: [],
    lore: [],
    messageExamples: [],
    postExamples: [],
    topics: TWITTER_TOPIC ? [TWITTER_TOPIC] : [],
    adjectives: [],
    clients: [],
    templates: {
      twitterPostTemplate: TWITTER_POST_TEMPLATE,
    },
    plugins: [],
    style: {
      all: [],
      chat: [],
      post: [],
    },
    settings,
  };
}

export async function createRuntime(character: Character) {
  const filePath = path.resolve(baseDir, 'db.sqlite');
  const db = new SqliteDatabaseAdapter(new Database(filePath));
  const cache = initializeFsCache(character);

  // Test the connection
  db.init()
    .then(() => {
      console.log('Successfully connected to SQLite database');
    })
    .catch((error) => {
      console.error('Failed to connect to SQLite:', error);
    });

  const runtime = new AgentRuntime({
    databaseAdapter: db,
    cacheManager: cache,
    token: openApiKey!,
    modelProvider: ModelProviderName.OPENAI,
    character,
    fetch: TWITTER_HTTP_PROXY ? wrapperFetchFunction(TWITTER_HTTP_PROXY) : undefined,
  });

  runtime.getSetting;

  return runtime;
}
