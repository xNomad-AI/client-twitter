import { Logger } from '../src/settings';

async function start() {
  Logger.info('Starting test-logger');
  Logger.warn('Starting test-logger');
  Logger.debug('Starting test-logger');
  Logger.info({ '1': 1 }, 'Starting test-logger', { '2': 2 });
  Logger.info('Starting test-logger', '123', { '1': 1 });
}

start().then(console.log).catch(console.error);
