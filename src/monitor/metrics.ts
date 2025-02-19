// using prometheus client
import client from 'prom-client';
client.collectDefaultMetrics({
  prefix: 'client_twitter_',
});

export const counter = new client.Counter({
  name: 'metric_name',
  help: 'metric_help',
});
