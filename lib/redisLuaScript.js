'use strict';

const logger = require('./logger');

function isNoScriptError(err) {
  return /NOSCRIPT/i.test(String(err?.message || err || ''));
}

function createRedisLuaScript(redisClient, source) {
  if (!redisClient || typeof redisClient.script !== 'function' || typeof redisClient.evalsha !== 'function') {
    throw new Error('redisClient with script/evalsha is required');
  }

  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('source is required');
  }

  let sha = null;
  let loadPromise = null;

  async function load() {
    if (sha) {
      return sha;
    }

    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      try {
        sha = await redisClient.script('LOAD', source);
        return sha;
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  async function evalLua(numKeys, ...keysAndArgs) {
    await load();

    try {
      return await redisClient.evalsha(sha, numKeys, ...keysAndArgs);
    } catch (err) {
      if (!isNoScriptError(err)) {
        throw err;
      }

      logger.warn('redis.noscript', { action: 'reload_and_retry' });
      sha = null;
      await load();
      return redisClient.evalsha(sha, numKeys, ...keysAndArgs);
    }
  }

  return { load, eval: evalLua };
}

module.exports = createRedisLuaScript;
