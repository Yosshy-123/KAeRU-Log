'use strict';

const logger = require('./lib/logger');

const Redis = require('ioredis');

const DEFAULT_RETRY_DELAY_MS = 50;
const MAX_RETRY_DELAY_MS = 1000;

function createRedisClient(redisUrl) {
  if (typeof redisUrl !== 'string' || redisUrl.trim() === '') {
    throw new Error('redisUrl is required');
  }

  const redisClient = new Redis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    autoResubscribe: true,
    retryStrategy(times) {
      const delay = times * DEFAULT_RETRY_DELAY_MS;
      return Math.min(delay, MAX_RETRY_DELAY_MS);
    },
  });

  redisClient.on('connect', () => logger.info('redis.connect'));
  redisClient.on('ready', () => logger.info('redis.ready'));
  redisClient.on('reconnecting', (delay) => logger.warn('redis.reconnecting', { delayMs: delay }));
  redisClient.on('end', () => logger.warn('redis.end'));
  redisClient.on('error', (err) => logger.error('redis.error', { errorType: err?.name }));

  return redisClient;
}

module.exports = { createRedisClient };
