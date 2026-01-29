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

  async function evalShaOrLoad(args) {
    try {
      if (!sha) await loadScript();
      return await redisClient.evalsha(...args);
    } catch (err) {
      if (err && (err.message || '').toUpperCase().includes('NOSCRIPT')) {
        sha = null;
        await loadScript();
        return await redisClient.evalsha(...args);
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

    if (!Number.isFinite(capacity) || !Number.isFinite(refillPerMs)) {
      throw new Error('tokenBucket.allow: invalid numeric options');
    }

    if (!sha) {
      await loadScript();
    }
    const evalArgs = [sha, 1, key, String(capacity), String(refillPerMs), String(nowMs)];

    try {
      const res = await evalShaOrLoad(evalArgs);
      if (!res || !Array.isArray(res)) {
        return { allowed: false, tokens: 0 };
      }
      const allowed = Number(res[0]) === 1;
      const tokens = Number(res[1]);
      return { allowed, tokens };
    } catch (err) {
      console.error('[tokenBucket] eval error', err);
      return { allowed: false, tokens: 0, error: err };
    }
  }

  return { allow, loadScript };
};
