'use strict';

const fs = require('fs');
const Path = require('path');

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = typeof config.repeatLimit === 'number' ? config.repeatLimit : 3;

  const MESSAGE_RATE_LIMIT_MS =
    typeof config.messageRateLimitMs === 'number'
      ? config.messageRateLimitMs
      : 1200;

  const INTERVAL_JITTER_MS = typeof config.intervalJitterMs === 'number' ? config.intervalJitterMs : 300;
  const INTERVAL_WINDOW_SEC = typeof config.intervalWindowSec === 'number' ? config.intervalWindowSec : 60 * 60;

  const luaPath = Path.join(__dirname, '..', 'lua', 'spamService.lua');
  let luaScript = '';
  try {
    luaScript = fs.readFileSync(luaPath, 'utf8');
    redis.defineCommand('spamCheckLua', { numberOfKeys: 5, lua: luaScript });
  } catch (err) {
    console.error('[spamService] failed to load lua script', err);
  }

  async function isMuted(clientId) {
    if (!clientId) return false;
    try {
      return !!(await redis.exists(KEYS.mute(clientId)));
    } catch (err) {
      try { await logger?.({ user: clientId, action: 'isMutedRedisError', extra: { error: String(err) } }); } catch (e) {}
      return false; // fail-open
    }
  }

  async function jsFallbackCheck(clientId) {
    const now = Date.now();
    const lastKey = KEYS.spamLastTime(clientId);
    const prevDeltaKey = KEYS.spamLastInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    try {
      if (await redis.exists(muteKey)) {
        const ttl = await redis.ttl(muteKey).catch(() => 0);
        return { muted: true, rejected: true, reason: 'already-muted', muteSec: ttl || 0 };
      }

      const lastRaw = await redis.get(lastKey);
      const last = lastRaw ? Number(lastRaw) : 0;
      if (!last) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      const delta = now - last;
      if (delta < MESSAGE_RATE_LIMIT_MS) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC).catch(() => {});
        await logger?.({ user: clientId, action: 'rateLimited', extra: { delta, limitMs: MESSAGE_RATE_LIMIT_MS } }).catch(() => {});
        return { muted: false, rejected: true, reason: 'rate-limit', muteSec: 0 };
      }

      const prevDeltaRaw = await redis.get(prevDeltaKey);
      const prevDelta = prevDeltaRaw ? Number(prevDeltaRaw) : null;

      if (prevDelta !== null && Number.isFinite(prevDelta)) {
        if (Math.abs(delta - prevDelta) <= INTERVAL_JITTER_MS) {
          const repeat = await redis.incr(repeatKey);
          if (repeat === 1) await redis.expire(repeatKey, INTERVAL_WINDOW_SEC);
          if (repeat >= REPEAT_LIMIT) {
            const levelRaw = await redis.get(muteLevelKey);
            const level = Number.isInteger(Number(levelRaw)) ? Number(levelRaw) : 0;
            const muteSec = Math.min(BASE_MUTE_SEC * Math.pow(2, level), MAX_MUTE_SEC);

            const pl = redis.pipeline();
            pl.set(muteKey, '1', 'EX', muteSec);
            const lastTTL = await redis.ttl(lastKey).catch(() => INTERVAL_WINDOW_SEC);
            const levelTTL = Math.max(0, lastTTL) + 10 * 60;
            pl.set(muteLevelKey, String(level + 1), 'EX', levelTTL);
            pl.del(prevDeltaKey);
            pl.del(repeatKey);
            pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
            await pl.exec();

            await logger?.({ user: clientId, action: 'spamMuted', extra: { muteSec, level: level + 1, reason: 'stable-delta' } }).catch(() => {});
            return { muted: true, rejected: true, reason: 'stable-delta', muteSec };
          }
        } else {
          await redis.del(repeatKey).catch(() => {});
        }
      }

      const pl = redis.pipeline();
      pl.set(prevDeltaKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
      pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
      await pl.exec();

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch (err) {
      await logger?.({ user: clientId, action: 'spamCheckError', extra: { error: String(err) } }).catch(() => {});
      return { muted: false, rejected: false, reason: 'error', muteSec: 0 };
    }
  }

  async function check(clientId) {
    if (!clientId) {
      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    }

    const lastKey = KEYS.spamLastTime(clientId);
    const prevDeltaKey = KEYS.spamLastInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    const now = Date.now();

    if (typeof redis.spamCheckLua !== 'function') {
      return jsFallbackCheck(clientId);
    }

    try {
      const res = await redis.spamCheckLua(
        lastKey,
        prevDeltaKey,
        repeatKey,
        muteKey,
        muteLevelKey,
        String(now),
        String(MESSAGE_RATE_LIMIT_MS),
        String(INTERVAL_JITTER_MS),
        String(INTERVAL_WINDOW_SEC),
        String(BASE_MUTE_SEC),
        String(MAX_MUTE_SEC),
        String(REPEAT_LIMIT)
      );

      if (!res || !Array.isArray(res) || res.length < 4) {
        await logger?.({ user: clientId, action: 'spamLuaBadResponse', extra: { res } }).catch(() => {});
        return jsFallbackCheck(clientId);
      }

      const muted = res[0] === '1';
      const rejected = res[1] === '1';
      const reason = res[2] || null;
      const muteSec = Number(res[3]) || 0;

      if (rejected) {
        await logger?.({ user: clientId, action: 'sendMessageRejected', extra: { reason } }).catch(() => {});
      }
      if (muted) {
        await logger?.({ user: clientId, action: 'sendMessageMuted', extra: { reason, muteSec } }).catch(() => {});
      }

      return { muted, rejected, reason, muteSec };
    } catch (err) {
      await logger?.({ user: clientId, action: 'spamLuaError', extra: { error: String(err) } }).catch(() => {});
      return jsFallbackCheck(clientId);
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
