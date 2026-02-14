'use strict';

const redis = require('redis');

/**
 * Create and return a Redis client
 * @param {string} redisUrl - Redis connection URL
 * @returns {Object} Redis client instance
 */
function createRedisClient(redisUrl) {
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  const client = redis.createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Max reconnection attempts reached');
          return new Error('Max reconnection attempts exceeded');
        }
        return retries * 100;
      }
    }
  });

  // Handle connection events
  client.on('connect', () => {
    console.log('Redis connected');
  });

  client.on('ready', () => {
    console.log('Redis ready');
  });

  client.on('error', (err) => {
    console.error('Redis error:', err);
  });

  client.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });

  // Connect to Redis
  client.connect().catch((err) => {
    console.error('Failed to connect to Redis:', err);
  });

  return client;
}

module.exports = { createRedisClient };