import { elizaLogger, UUID } from '@elizaos/core';
import pino from 'pino';
import { TwitterClientState, TwitterClientStatus } from '../monitor/state';
import { TwitterConfig } from '../environment';

interface Settings {
  // agentId, twitter username
  agent: Record<string, TwitterConfig>;
  account: Record<
    string,
    {
      state: TwitterClientState;
      status: TwitterClientStatus;
      // TODO, fix circular import.
      // TwitterManager | null
      manager: any;
    }
  >;
}

export function getCurrentTwitterAccountStatus(
  username: string,
): TwitterClientStatus {
  if (!SETTINGS.account[username]) return TwitterClientStatus.STOPPED;

  return SETTINGS.account[username].status;
}

export function getCurrentAgentTwitterAccountStatus(
  agentId: UUID,
): TwitterClientStatus {
  if (!SETTINGS.agent[agentId.toString()]) return TwitterClientStatus.STOPPED;

  const twitterConfig = SETTINGS.agent[agentId.toString()];
  return getCurrentTwitterAccountStatus(twitterConfig.TWITTER_USERNAME);
}

export function isAgentTwitterAccountStopped(agentId: UUID): boolean {
  return (
    getCurrentAgentTwitterAccountStatus(agentId) === TwitterClientStatus.STOPPED
  );
}

export function isAgentTwitterAccountStopping(agentId: UUID): boolean {
  return (
    getCurrentAgentTwitterAccountStatus(agentId) ===
    TwitterClientStatus.STOPPING
  );
}

export const Logger: pino.Logger<string, boolean> = elizaLogger.child({
  plugin: 'client-twitter',
});
export const SETTINGS: Settings = {
  account: {},
  agent: {},
};
