'use strict';

const fs = require('fs');
const Path = require('path');
const crypto = require('crypto');

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = typeof config.repeatLimit === 'number' ? config.repeatLimit : 3;
  const SAME_MESSAGE_LIMIT = typeof config.sameMessageLimit === 'number' ? config.sameMessageLimit : REPEAT_LIMIT;

  const MESSAGE_RATE_LIMIT_MS =
    typeof config.messageRateLimitMs === 'number'
      ? config.messageRateLimitMs
      : 1200;

  const INTERVAL_JITTER_MS = typeof config.intervalJitterMs === 'number' ? config.intervalJitterMs : 300;
  const INTERVAL_WINDOW_SEC = typeof config.intervalWindowSec === 'number' ? config.intervalWindowSec : 60 * 60;

  const luaPath = Path.join(__dirname, '..', 'lua', 'spamService.lua');
  try {
    const luaScript = fs.readFileSync(luaPath, 'utf8');
    if (typeof redis.spamCheckLua !== 'function') {
      redis.defineCommand('spamCheckLua', { numberOfKeys: 7, lua: luaScript });
    }
  } catch (err) {
    try { logger?.({ user: null, action: 'spamServiceLuaLoadFailed', extra: { error: String(err) } }); } catch (e) {}
  }

  function normalizeMessage(msg) {
    if (!msg || typeof msg !== 'string') return '';
    try {
      const s = msg.normalize ? msg.normalize('NFKC') : String(msg);
      return s.replace(/[\u0000-\u001F\u007F\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
    } catch (e) {
      return String(msg).trim().replace(/\s+/g, ' ');
    }
  }

  function sha1Hex(str) {
    return crypto.createHash('sha1').update(String(str)).digest('hex');
  }

  function validKey(k) {
    return typeof k === 'string' && k.length > 0;
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

  async function jsFallbackCheck(clientId, message) {
    const now = Date.now();
    const lastKey = KEYS.spamLastTime(clientId);
    const prevDeltaKey = KEYS.spamLastInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    const lastMsgHashKey = KEYS.spamLastMsgHash ? KEYS.spamLastMsgHash(clientId) : null;
    const repeatMsgKey = KEYS.spamRepeatMsgCount ? KEYS.spamRepeatMsgCount(clientId) : null;

    const normalized = normalizeMessage(message);
    const msgHash = normalized ? sha1Hex(normalized) : '';

    try {
      if (await redis.exists(muteKey)) {
        const ttl = await redis.ttl(muteKey).catch(() => 0);
        return { muted: true, rejected: true, reason: 'already-muted', muteSec: ttl || 0 };
      }

      if (msgHash && lastMsgHashKey && repeatMsgKey) {
        const lastHash = await redis.get(lastMsgHashKey).catch(() => null);
        if (lastHash && lastHash === msgHash) {
          const repMsg = await redis.incr(repeatMsgKey).catch(() => null);
          if (repMsg === 1) {
            await redis.expire(repeatMsgKey, INTERVAL_WINDOW_SEC).catch(() => {});
          }

          if (repMsg !== null && repMsg >= SAME_MESSAGE_LIMIT) {
            const levelRaw = await redis.get(muteLevelKey).catch(() => null);
            const level = Number.isInteger(Number(levelRaw)) ? Number(levelRaw) : 0;
            const muteSec = Math.min(BASE_MUTE_SEC * Math.pow(2, level), MAX_MUTE_SEC);

            const pl = redis.pipeline();
            pl.set(muteKey, '1', 'EX', Math.floor(muteSec));
            const lastTTL = await redis.ttl(lastKey).catch(() => INTERVAL_WINDOW_SEC);
            const levelTTL = Math.max(0, lastTTL) + 10 * 60;
            pl.set(muteLevelKey, String(level + 1), 'EX', levelTTL);
            pl.del(prevDeltaKey);
            pl.del(repeatKey);
            pl.del(repeatMsgKey);
            pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
            await pl.exec().catch(() => {});

            return { muted: true, rejected: true, reason: 'repeat-message', muteSec };
          }
        } else {
          const pl = redis.pipeline();
          pl.set(lastMsgHashKey, msgHash, 'EX', INTERVAL_WINDOW_SEC);
          pl.del(repeatMsgKey);
          await pl.exec().catch(() => {});
        }
      }

      const lastRaw = await redis.get(lastKey).catch(() => null);
      const last = lastRaw ? Number(lastRaw) : 0;
      if (!last) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC).catch(() => {});
        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      const delta = now - last;
      if (delta < MESSAGE_RATE_LIMIT_MS) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC).catch(() => {});
        return { muted: false, rejected: true, reason: 'rate-limit', muteSec: 0 };
      }

      const prevDeltaRaw = await redis.get(prevDeltaKey).catch(() => null);
      const prevDelta = prevDeltaRaw ? Number(prevDeltaRaw) : null;

      if (prevDelta !== null && Number.isFinite(prevDelta)) {
        if (Math.abs(delta - prevDelta) <= INTERVAL_JITTER_MS) {
          const repeat = await redis.incr(repeatKey).catch(() => null);
          if (repeat === 1) await redis.expire(repeatKey, INTERVAL_WINDOW_SEC).catch(() => {});
          if (repeat !== null && repeat >= REPEAT_LIMIT) {
            const levelRaw = await redis.get(muteLevelKey).catch(() => null);
            const level = Number.isInteger(Number(levelRaw)) ? Number(levelRaw) : 0;
            const muteSec = Math.min(BASE_MUTE_SEC * Math.pow(2, level), MAX_MUTE_SEC);

            const pl = redis.pipeline();
            pl.set(muteKey, '1', 'EX', Math.floor(muteSec));
            const lastTTL = await redis.ttl(lastKey).catch(() => INTERVAL_WINDOW_SEC);
            const levelTTL = Math.max(0, lastTTL) + 10 * 60;
            pl.set(muteLevelKey, String(level + 1), 'EX', levelTTL);
            pl.del(prevDeltaKey);
            pl.del(repeatKey);
            pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
            await pl.exec().catch(() => {});

            return { muted: true, rejected: true, reason: 'stable-delta', muteSec };
          }
        } else {
          await redis.del(repeatKey).catch(() => {});
        }
      }

      const pl = redis.pipeline();
      pl.set(prevDeltaKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
      pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
      await pl.exec().catch(() => {});

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch (err) {
      try { await logger?.({ user: clientId, action: 'spamCheckError', extra: { error: String(err) } }); } catch (e) {}
      return { muted: false, rejected: false, reason: 'error', muteSec: 0 };
    }
  }

  async function check(clientId, message) {
    if (!clientId) return { muted: false, rejected: false, reason: null, muteSec: 0 };

    const lastKey = KEYS.spamLastTime(clientId);
    const prevDeltaKey = KEYS.spamLastInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    const lastMsgHashKey = KEYS.spamLastMsgHash ? KEYS.spamLastMsgHash(clientId) : '';
    const repeatMsgKey = KEYS.spamRepeatMsgCount ? KEYS.spamRepeatMsgCount(clientId) : '';

    const now = Date.now();

    const normalized = normalizeMessage(message);
    const msgHash = normalized ? sha1Hex(normalized) : '';

    const luaAvailable = typeof redis.spamCheckLua === 'function';
    const msgKeysValid = validKey(lastMsgHashKey) && validKey(repeatMsgKey);

    if (!luaAvailable || !msgKeysValid) {
      return jsFallbackCheck(clientId, message);
    }

    try {
      const res = await redis.spamCheckLua(
        lastKey,
        prevDeltaKey,
        repeatKey,
        muteKey,
        muteLevelKey,
        lastMsgHashKey,
        repeatMsgKey,
        String(now),
        String(MESSAGE_RATE_LIMIT_MS),
        String(INTERVAL_JITTER_MS),
        String(INTERVAL_WINDOW_SEC),
        String(BASE_MUTE_SEC),
        String(MAX_MUTE_SEC),
        String(REPEAT_LIMIT),
        String(SAME_MESSAGE_LIMIT),
        msgHash
      );

      if (!res || !Array.isArray(res) || res.length < 4) {
        try { await logger?.({ user: clientId, action: 'spamLuaBadResponse', extra: { res } }); } catch (e) {}
        return jsFallbackCheck(clientId, message);
      }

      const muted = res[0] === '1';
      const rejected = res[1] === '1';
      const reason = res[2] || null;
      const muteSec = Number(res[3]) || 0;

      return { muted, rejected, reason, muteSec };
    } catch (err) {
      try { await logger?.({ user: clientId, action: 'spamLuaError', extra: { error: String(err) } }); } catch (e) {}
      return jsFallbackCheck(clientId, message);
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
