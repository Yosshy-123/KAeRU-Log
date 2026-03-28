'use strict';

const fs = require('fs');
const path = require('path');

const LUA_PATH = path.join(__dirname, '..', 'lua', 'tokenBucket.lua');

module.exports = function createTokenBucket(redisClient) {
  let sha = null;
  let loading = false;
  let loadPromise = null;
  let luaSource = null;

  async function loadLuaSource() {
    if (luaSource) return luaSource;
    luaSource = await fs.promises.readFile(LUA_PATH, 'utf8');
    return luaSource;
  }

  async function loadScript() {
    if (sha) return sha;
    if (loading && loadPromise) return loadPromise;
    loading = true;
    loadPromise = (async () => {
      try {
        const src = await loadLuaSource();
        sha = await redisClient.script('LOAD', src);
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
        await loadScript();
      }

      return await redisClient.evalsha(sha, numKeys, ...keysAndArgs);
    } catch (err) {
      if ((err && (err.message || '').toUpperCase().includes('NOSCRIPT'))) {
        const src = await loadLuaSource();
        return await redisClient.eval(src, numKeys, ...keysAndArgs);
      }
      throw err;
    }
  }

  async function allow(key, opts = {}) {
    if (!key) throw new Error('tokenBucket.allow: key required');

    const capacity = Number(opts.capacity || 1);
    let refillPerSec = Number(opts.refillPerSec || 0);
    if (!Number.isFinite(refillPerSec) || refillPerSec < 0) refillPerSec = 0;
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