import { type Client, type IAgentRuntime } from '@elizaos/core';
import { ClientBase } from './base.ts';
import { validateTwitterConfig, type TwitterConfig } from './environment.ts';
import { TwitterInteractionClient } from './interactions.ts';
import { TwitterPostClient } from './post.ts';
import { TwitterSearchClient } from './search.ts';
import { TwitterSpaceClient } from './spaces.ts';
import { getCurrentAgentTwitterAccountStatus, Logger, SETTINGS } from './settings/index.ts';
import { TwitterClientStatus } from './monitor/state.ts';
import { twitterAccountStatus, twitterPostInterval } from './monitor/metrics.ts';

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
class TwitterManager {
  client: ClientBase;
  post: TwitterPostClient;
  search: TwitterSearchClient;
  interaction: TwitterInteractionClient;
  space?: TwitterSpaceClient;

  constructor(private runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
    // Pass twitterConfig to the base client
    this.client = new ClientBase(runtime, twitterConfig);

    // Posting logic
    this.post = new TwitterPostClient(this.client, runtime);

    // Optional search logic (enabled if TWITTER_SEARCH_ENABLE is true)
    if (twitterConfig.TWITTER_SEARCH_ENABLE) {
      this.client.logger.warn('Twitter/X client running in a mode that:');
      this.client.logger.warn('1. violates consent of random users');
      this.client.logger.warn('2. burns your rate limit');
      this.client.logger.warn('3. can get your account banned');
      this.client.logger.warn('use at your own risk');
      this.search = new TwitterSearchClient(this.client, runtime);
    }

    // Mentions and interactions
    this.interaction = new TwitterInteractionClient(this.client, runtime);

    // Optional Spaces logic (enabled if TWITTER_SPACES_ENABLE is true)
    if (twitterConfig.TWITTER_SPACES_ENABLE) {
      this.space = new TwitterSpaceClient(this.client, runtime);
    }

    // console.log('TwitterManager constructor end');
  }

  // TODO get current state of the manager
  // TODO get the queue length
  // TODO get the manager's health
  // TODO count the errors

  async stop() {
    return stop(this.runtime);
  }
}

export const TwitterClientInterface: Client = {
  // one loop to start all actions, so that can easy stop the client
  async start(runtime: IAgentRuntime) {
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);

    // get proxy from config
    const proxy = twitterConfig.TWITTER_HTTP_PROXY ?? "";
    Logger.debug(`Twitter client started username=${twitterConfig.TWITTER_USERNAME}`);

    try {
      twitterAccountStatus.labels(twitterConfig.TWITTER_USERNAME, proxy).set(1);
      // if badder then max, there must be some issue
      twitterPostInterval.labels(twitterConfig.TWITTER_USERNAME).set(twitterConfig.POST_INTERVAL_MAX);

      // only if the status is stopped can start a new client
      if (SETTINGS.account[twitterConfig.TWITTER_USERNAME] && 
        SETTINGS.account[twitterConfig.TWITTER_USERNAME].status !== TwitterClientStatus.STOPPED
      ) {
        const msg = `Twitter client ${twitterConfig.TWITTER_USERNAME} is not stopped, cannot start, status=${SETTINGS.account[twitterConfig.TWITTER_USERNAME]?.status}`;
        throw new Error(msg);
      }

      // TODO if twitter username change
      SETTINGS.agent[runtime.agentId] = twitterConfig;

      const manager = new TwitterManager(runtime, twitterConfig);

      // TODO fix transaction issue
      // Initialize login/session
      await manager.client.init();

      // Start the posting loop
      await manager.post.start();

      // Start the search logic if it exists
      if (manager.search) {
        await manager.search.start();
      }

      // Start interactions (mentions, replies)
      await manager.interaction.start();

      // If Spaces are enabled, start the periodic check
      if (manager.space) {
        manager.space.startPeriodicSpaceCheck();
      }

      SETTINGS.account[twitterConfig.TWITTER_USERNAME].status = TwitterClientStatus.RUNNING;
      SETTINGS.account[twitterConfig.TWITTER_USERNAME].manager = manager;
      return manager;
    } catch (error) {
      twitterAccountStatus.labels(twitterConfig.TWITTER_USERNAME).set(0);
      throw error;
    }
  },

  async stop(_runtime: IAgentRuntime) {
    return stop(_runtime);
  },
};

async function stop(_runtime: IAgentRuntime) {
  if (getCurrentAgentTwitterAccountStatus(_runtime.agentId) === TwitterClientStatus.RUNNING) {
    const twitterConfig = SETTINGS.agent[_runtime.agentId];
    const username = twitterConfig.TWITTER_USERNAME;
    const proxy = twitterConfig.TWITTER_HTTP_PROXY ?? "";

    twitterAccountStatus.labels(username, proxy).set(2);

    SETTINGS.account[username].status = TwitterClientStatus.STOPPING;
    const manager: TwitterManager | null = SETTINGS.account[username].manager;
    let maxCheckTimes = 60;

    while (maxCheckTimes > 0) {
      maxCheckTimes--;
      // 2s
      await new Promise((resolve) => setTimeout(resolve, 2000));

      let ok = await manager.post.stop();
      if (!ok) continue;

      ok = await manager.interaction.stop()
      if (!ok) continue;

      if (manager.space) await manager.space.stopSpace();
      if (manager.search) await manager.search.stop();

      break;
    }

    if (maxCheckTimes === 0) {
      throw new Error(`Twitter client ${username} failed to stop, please try again`);
    } else {
      // should release the manager from global settings
      SETTINGS.account[username].manager = null;
      SETTINGS.account[username].status = TwitterClientStatus.STOPPED;
      twitterAccountStatus.labels(username, proxy).set(0);
      Logger.info(`Twitter client ${_runtime.agentId} stopped`);
    }
  } else {
    Logger.warn(
      `Twitter client ${_runtime.agentId} is not running, cannot stop`,
    );
  };
};

export default TwitterClientInterface;
