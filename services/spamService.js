'use strict';

const fs = require('fs');
const Path = require('path');
const crypto = require('crypto');

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = 60 * 60 * 24;
  const REPEAT_LIMIT = typeof config.repeatLimit === 'number' ? config.repeatLimit : 3;
  const SAME_MESSAGE_LIMIT = typeof config.sameMessageLimit === 'number' ? config.sameMessageLimit : REPEAT_LIMIT;
  const MESSAGE_RATE_LIMIT_MS = typeof config.messageRateLimitMs === 'number' ? config.messageRateLimitMs : 1200;
  const INTERVAL_JITTER_MS = typeof config.intervalJitterMs === 'number' ? config.intervalJitterMs : 300;
  const INTERVAL_WINDOW_SEC = typeof config.intervalWindowSec === 'number' ? config.intervalWindowSec : 60 * 60;
  const SHORT_RATE_WINDOW_SEC = typeof config.shortRateWindowSec === 'number' ? config.shortRateWindowSec : 15;
  const SHORT_RATE_LIMIT = typeof config.shortRateLimit === 'number' ? config.shortRateLimit : 6;

  const luaPath = Path.join(__dirname, '..', 'lua', 'spamService.lua');
  try {
    const luaScript = fs.readFileSync(luaPath, 'utf8');
    if (typeof redis.spamCheckLua !== 'function') {
      redis.defineCommand('spamCheckLua', { numberOfKeys: 8, lua: luaScript });
    }
  } catch (err) {
    try { logger?.({ user: null, action: 'spamServiceLuaLoadFailed', extra: { error: String(err) } }); } catch (e) {}
  }

  function normalizeMessage(msg) {
    if (!msg || typeof msg !== 'string') return '';
    try {
      const s = msg.normalize ? msg.normalize('NFKC') : String(msg);
      return s.replace(/[-\u001F\u007F\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
    } catch (e) {
      return String(msg).trim().replace(/\s+/g, ' ');
    }
  }

  function sha1Hex(str) {
    return crypto.createHash('sha256').update(String(str)).digest('hex');
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
      return true;
    }
  }

  async function jsFallbackCheck(clientId, message) {
    const lastKey = KEYS.spamLastTime(clientId);
    try {
      const last = await redis.get(lastKey);
      const now = Date.now();
      if (last && now - Number(last) < MESSAGE_RATE_LIMIT_MS) {
        return { muted: false, rejected: true, reason: 'rate-limit', muteSec: 0 };
      }
      await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch (err) {
      return { muted: true, rejected: true, reason: 'error', muteSec: 0 };
    }
  }

  async function applyMute(clientId, reason, muteSec) {
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);
    await redis.set(muteKey, '1', 'EX', muteSec);
    const level = await redis.incr(muteLevelKey);
    await redis.expire(muteLevelKey, muteSec + 600);
    try { await redis.del(`short_rate:${clientId}`); } catch (e) {}
    await logger?.({ user: clientId, action: 'appliedMute', extra: { reason, muteSec } });
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
    const shortRateKey = `short_rate:${clientId}`;

    const now = Date.now();
    const normalized = normalizeMessage(message);
    const msgHash = normalized ? sha1Hex(normalized) : '';

    const luaAvailable = typeof redis.spamCheckLua === 'function';
    const msgKeysValid = validKey(lastMsgHashKey) && validKey(repeatMsgKey) && validKey(shortRateKey);

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
        shortRateKey,
        String(now),
        String(MESSAGE_RATE_LIMIT_MS),
        String(INTERVAL_JITTER_MS),
        String(INTERVAL_WINDOW_SEC),
        String(BASE_MUTE_SEC),
        String(MAX_MUTE_SEC),
        String(REPEAT_LIMIT),
        String(SAME_MESSAGE_LIMIT),
        msgHash,
        String(SHORT_RATE_WINDOW_SEC),
        String(SHORT_RATE_LIMIT)
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
      return { muted: true, rejected: true, reason: 'error', muteSec: 0 };
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
    applyMute
  };
};
