'use strict';

const Redis = require('ioredis');

function createRedisClient(redisUrl) {
  const redisClient = new Redis(redisUrl);

  redisClient.on('connect', () => console.log('Redis connected'));
  redisClient.on('error', (err) => console.error('Redis error', err));

  return redisClient;
}

module.exports = { createRedisClient };