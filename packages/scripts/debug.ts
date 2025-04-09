import {
  Character,
  IAgentRuntime,
} from '@elizaos/core';
import { exit } from 'process';
import { assert } from 'console';
import dotenv from 'dotenv';

import { generatePostTweet } from '@elizaos/client-twitter';

import { initCharacter, createRuntime } from './utils.js';

// import { register } from '../src/monitor/metrics';
dotenv.config();

const openApiKey = process.env.OPENAI_API_KEY;
assert(openApiKey, 'OPENAI_API_KEY is required');

// add TWITTER_POST_TEMPLATE, OPENAI_API_KEY to .env to test the example tweet
async function start() {
  const characters: Character[] = [
    initCharacter('debug', {
      secrets: {
        TWITTER_USERNAME: "debug",
        MAX_TWEET_LENGTH: '200',
      },
    }),
  ];
  const runtimes: IAgentRuntime[] = await Promise.all(
    characters.map(createRuntime),
  );

  for (const runtime of runtimes) {
    const res = await generatePostTweet(runtime);
    console.log('--------------generatePostTweet--------------');
    console.log(res);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
  return 'end';
}

start()
  .then((res) => {
    console.log(res);
    exit(0);
  })
  .catch(console.error);
