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
    const res = await generatePostTweet("debug", 100, "`\n# Areas of Expertise\n{{knowledge}}\n\n# About {{agentName}} (@{{twitterUserName}}):\n{{bio}}\n{{lore}}\n{{topics}}\n\n{{providers}}\n\n{{characterPostExamples}}\n\n{{postDirections}}\n\n# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.\nWrite a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.\nYour response should be 1, 2, or 3 sentences (choose the length at random).\nYour response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;", runtime);
    console.log('--------------generatePostTweet--------------');
    console.log(res);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000 * 3));
  return 'end';
}

start()
  .then((res) => {
    console.log(res);
    exit(0);
  })
  .catch(console.error);
