'use strict';

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30; // base mute seconds
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10; // 10 minutes max
  const REPEAT_LIMIT = typeof config.repeatLimit === 'number' ? config.repeatLimit : 3;

  const MESSAGE_RATE_LIMIT_MS =
    typeof config.messageRateLimitMs === 'number'
      ? config.messageRateLimitMs
      : 1200; // default 1.2s

  const INTERVAL_JITTER_MS = typeof config.intervalJitterMs === 'number' ? config.intervalJitterMs : 300;
  const INTERVAL_WINDOW_SEC = typeof config.intervalWindowSec === 'number' ? config.intervalWindowSec : 60 * 60; // 1 hour

  function calcMuteSeconds(level) {
    return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
  }

  async function isMuted(clientId) {
    if (!clientId) return false;
    try {
      return !!(await redis.exists(KEYS.mute(clientId)));
    } catch (err) {
      try {
        await logger?.({ user: clientId, action: 'isMutedRedisError', extra: { error: String(err) } });
      } catch (e) {}
      return false;
    }
  }

  async function getTTLSeconds(key) {
    try {
      const ttl = await redis.ttl(key);
      if (typeof ttl !== 'number') return 0;
      if (ttl < 0) return 0;
      return Math.floor(ttl);
    } catch (err) {
      return 0;
    }
  }

  async function check(clientId) {
    if (!clientId) {
      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    }

    const now = Date.now();

    const lastKey = KEYS.rateMsg(clientId);
    const prevDeltaKey = KEYS.rateInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    try {
      const mutedExists = await redis.exists(muteKey);
      if (mutedExists) {
        const ttl = await getTTLSeconds(muteKey);
        return {
          muted: true,
          rejected: true,
          reason: 'already-muted',
          muteSec: ttl,
        };
      }

      const lastRaw = await redis.get(lastKey);
      const last = lastRaw ? Number(lastRaw) : 0;

      if (!last) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      const delta = now - last;

      if (delta < MESSAGE_RATE_LIMIT_MS) {
        try {
          await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        } catch (e) {
          // ignore set failure; we'll still return rejected
        }

        try {
          await logger?.({ user: clientId, action: 'rateLimited', extra: { delta, limitMs: MESSAGE_RATE_LIMIT_MS } });
        } catch (e) {}

        return {
          muted: false,
          rejected: true,
          reason: 'rate-limit',
          muteSec: 0,
        };
      }

      const prevDeltaRaw = await redis.get(prevDeltaKey);
      const prevDelta = prevDeltaRaw !== null ? Number(prevDeltaRaw) : null;

      if (prevDelta !== null && Number.isFinite(prevDelta)) {
        if (Math.abs(delta - prevDelta) <= INTERVAL_JITTER_MS) {
          const repeat = await redis.incr(repeatKey);
          if (repeat === 1) {
            await redis.expire(repeatKey, INTERVAL_WINDOW_SEC);
          }

          if (repeat >= REPEAT_LIMIT) {
            const levelRaw = await redis.get(muteLevelKey);
            const level = levelRaw ? Number(levelRaw) : 0;
            const muteSec = calcMuteSeconds(level);

            const pl = redis.pipeline();
            pl.set(muteKey, '1', 'EX', muteSec);
            pl.set(muteLevelKey, String(level + 1), 'EX', 10 * 60);
            pl.del(prevDeltaKey);
            pl.del(repeatKey);
            pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
            await pl.exec();

            try {
              await logger?.({
                user: clientId,
                action: 'spamMuted',
                extra: { muteSec, level: level + 1, reason: 'stable-delta-1h' },
              });
            } catch (e) {}

            return {
              muted: true,
              rejected: true,
              reason: 'stable-delta-1h',
              muteSec,
            };
          }
        } else {
          try {
            await redis.del(repeatKey);
          } catch (e) {}
        }
      }

      try {
        const pl = redis.pipeline();
        pl.set(prevDeltaKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
        pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        await pl.exec();
      } catch (e) {
        try { await logger?.({ user: clientId, action: 'redisUpdateFailed', extra: { error: String(e) } }); } catch (ee) {}
      }

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch (err) {
      try {
        await logger?.({ user: clientId, action: 'spamCheckError', extra: { error: String(err) } });
      } catch (e) {}
      return { muted: false, rejected: false, reason: 'error', muteSec: 0 };
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
