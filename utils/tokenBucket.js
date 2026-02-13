const fs = require('fs');
const path = require('path');

const LUA_PATH = path.join(__dirname, '..', 'lua', 'tokenBucket.lua');
const LUA_SOURCE = fs.readFileSync(LUA_PATH, 'utf8');

module.exports = function createTokenBucket(redisClient) {
  let sha = null;
  let loading = false;
  let loadPromise = null;

  async function loadScript() {
    if (sha) return sha;
    if (loading && loadPromise) return loadPromise;
    loading = true;
    loadPromise = (async () => {
      try {
        sha = await redisClient.script('LOAD', LUA_SOURCE);
        return sha;
      } finally {
        loading = false;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  async function evalSafe(numKeys, keysAndArgs) {
    try {
      if (!sha) {
        sha = await redisClient.script('LOAD', LUA_SOURCE);
      }

      return await redisClient.evalsha(
        sha,
        numKeys,
        ...keysAndArgs
      );

    } catch (err) {
      if ((err.message || '').toUpperCase().includes('NOSCRIPT')) {
        return await redisClient.eval(
          LUA_SOURCE,
          numKeys,
          ...keysAndArgs
        );
      }
      throw err;
    }
  }

  async function allow(key, opts = {}) {
    if (!key) throw new Error('tokenBucket.allow: key required');

    const capacity = Number(opts.capacity || 1);
    const refillPerSec = Number(opts.refillPerSec || 0);
    const refillPerMs = refillPerSec / 1000;
    const nowMs = Date.now();

    const keysAndArgs = [
      key,
      String(capacity),
      String(refillPerMs),
      String(nowMs),
    ];

    try {
      const res = await evalSafe(1, keysAndArgs);
      return {
        allowed: Number(res[0]) === 1,
        tokens: Number(res[1]),
      };
    } catch (err) {
      console.error('[tokenBucket] eval error', err);
      return { allowed: false, tokens: 0, error: err };
    }
  }

  return { allow, loadScript };
};