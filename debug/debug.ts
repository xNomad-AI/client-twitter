import path from 'path';

import {
  AgentRuntime,
  CacheManager,
  FsCacheAdapter,
  Character,
  IAgentRuntime,
  ModelProviderName,
} from '@elizaos/core';
import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import Database from 'better-sqlite3';

import { TwitterClientInterface } from '../src/index';
import { wrapperFetchFunction } from '../src/scraper';

type UUID = `${string}-${string}-${string}-${string}-${string}`;
const baseDir = path.resolve(process.cwd(), 'data');
const proxyUrl = process.env.TWITTER_HTTP_PROXY;

function initializeFsCache(character: Character) {
  const cacheDir = path.resolve(baseDir, character.id as any, 'cache');
  const cache = new CacheManager(new FsCacheAdapter(cacheDir));
  return cache;
}

function initCharacter(
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
    topics: [],
    adjectives: [],
    clients: [],
    plugins: [],
    style: {
      all: [],
      chat: [],
      post: [],
    },
    settings,
  };
}

async function createRuntime(character: Character) {
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
    token: process.env.OPENAI_API_KEY,
    modelProvider: ModelProviderName.OPENAI,
    character,
    fetch: wrapperFetchFunction(proxyUrl),
  });

  runtime.getSetting;

  return runtime;
}

async function start() {
  const characters: Character[] = [
    initCharacter('debug', {
      secrets: {
        TWITTER_DRY_RUN: 'false',
        TWITTER_USERNAME: process.env.TWITTER_USERNAME,
        TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
        TWITTER_2FA_SECRET: process.env.TWITTER_2FA_SECRET,
        TWITTER_EMAIL: process.env.TWITTER_EMAIL,

        MAX_TWEET_LENGTH: '280',
        TWITTER_SEARCH_ENABLE: 'false',
        TWITTER_RETRY_LIMIT: '5',
        TWITTER_POLL_INTERVAL: '120',
        TWITTER_TARGET_USERS: '',
        ENABLE_TWITTER_POST_GENERATION: 'true',
        TWITTER_HTTP_PROXY: proxyUrl,
      },
    }),
  ];
  const runtimes: IAgentRuntime[] = await Promise.all(
    characters.map(createRuntime),
  );

  for (const runtime of runtimes) {
    await TwitterClientInterface.start(runtime);
  }

  // Run for 5 minutes
  await new Promise((resolve) => setTimeout(resolve, 1000 * 60 * 5));

  console.log('start to stop the client');
  for (const runtime of runtimes) {
    await TwitterClientInterface.stop(runtime);
  }

  return "end";
}

start().then(console.log).catch(console.error);
