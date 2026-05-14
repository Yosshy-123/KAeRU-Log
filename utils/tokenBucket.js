'use strict';

const fs = require('fs');
const path = require('path');

const createRedisLuaScript = require('../lib/redisLuaScript');

const LUA_PATH = path.join(__dirname, '..', 'lua', 'tokenBucket.lua');
const LUA_SOURCE = fs.readFileSync(LUA_PATH, 'utf8');

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

module.exports = function createTokenBucket(redisClient) {
  if (!redisClient) {
    throw new Error('redisClient required');
  }

  const script = createRedisLuaScript(redisClient, LUA_SOURCE);

  async function allow(key, opts = {}) {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('tokenBucket.allow: key required');
    }

    const capacity = toPositiveNumber(opts.capacity, 1);
    const refillPerSec = toNonNegativeNumber(opts.refillPerSec, 0);
    const refillPerMs = refillPerSec / 1000;
    const nowMs = Date.now();

    try {
      const res = await script.eval(1, key, String(capacity), String(refillPerMs), String(nowMs));
      const allowed = Array.isArray(res) && Number(res[0]) === 1;
      const tokens = Array.isArray(res) ? Number(res[1]) : 0;

      return {
        allowed,
        tokens: Number.isFinite(tokens) ? tokens : 0,
      };
    } catch (err) {
      console.error('[tokenBucket] eval error', err);
      return { allowed: false, tokens: 0 };
    }
  }

  return { allow };
};
