'use strict';

const fs = require('fs');
const path = require('path');
const createRedisLuaScript = require('./redisLuaScript');
const logger = require('./logger');

const PUSH_AND_TRIM_LUA = fs.readFileSync(
  path.join(__dirname, '..', 'lua', 'pushAndTrimList.lua'),
  'utf8'
);

const scriptCache = new WeakMap();

function getPushAndTrimScript(redisClient) {
  let script = scriptCache.get(redisClient);
  if (!script) {
    script = createRedisLuaScript(redisClient, PUSH_AND_TRIM_LUA);
    scriptCache.set(redisClient, script);
  }
  return script;
}

async function pushAndTrimList(redisClient, key, value, max = 100) {
  if (!redisClient || typeof redisClient.eval !== 'function') {
    throw new Error('redisClient is required');
  }
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('key is required');
  }

  const maxItems = Number(max);
  if (!Number.isInteger(maxItems) || maxItems <= 0) {
    throw new Error('max must be a positive integer');
  }

  try {
    const script = getPushAndTrimScript(redisClient);
    return await script.eval(1, key, value, String(maxItems));
  } catch (err) {
    logger.error('redis.error', { op: 'pushAndTrimList', errorType: err?.name });
    throw err;
  }
}

async function processKeysByPattern(redisClient, pattern, handler, scanCount = 500) {
  if (!redisClient || typeof redisClient.scan !== 'function') {
    throw new Error('redisClient.scan is required');
  }
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    throw new Error('pattern is required');
  }
  if (typeof handler !== 'function') {
    throw new Error('handler must be a function');
  }

  let cursor = '0';
  const count = Number.isInteger(scanCount) && scanCount > 0 ? scanCount : 500;

  do {
    const result = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    const nextCursor = Array.isArray(result) ? String(result[0]) : '0';
    const keys = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];

    if (keys.length > 0) {
      await handler(keys);
    }

    cursor = nextCursor;
  } while (cursor !== '0');
}

module.exports = {
  pushAndTrimList,
  processKeysByPattern,
};
