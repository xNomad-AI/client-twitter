import { elizaLogger } from '@elizaos/core';
import pino from 'pino';
import { TwitterClientState, TwitterClientStatus } from '../monitor/state';

interface Settings {
  account: Record<
    string,
    {
      state: TwitterClientState;
      status: TwitterClientStatus;
    }
  >;
}

export const Logger: pino.Logger<string, boolean> = elizaLogger.child({
  plugin: 'client-twitter',
});
export const SETTINGS: Settings = {
  account: {},
};
