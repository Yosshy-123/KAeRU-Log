'use strict';

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

    function calcMuteSeconds(level) {
    const sec = BASE_MUTE_SEC * Math.pow(2, level);
    return Math.min(sec, MAX_MUTE_SEC);
  }

  async function getTTLSeconds(key) {
    try {
      const ttl = await redis.ttl(key);
      if (typeof ttl !== 'number' || ttl < 0) return 0;
      return ttl;
    } catch {
      return 0;
    }
  }

  async function isMuted(clientId) {
    if (!clientId) return false;
    try {
      return !!(await redis.exists(KEYS.mute(clientId)));
    } catch {
      return false; // fail-open
    }
  }

  async function check(clientId) {
    if (!clientId) {
      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    }

    const now = Date.now();

    const lastKey = KEYS.spamLastTime(clientId);
    const prevDeltaKey = KEYS.spamLastInterval(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    try {
      /* -------------------- already muted -------------------- */
      if (await redis.exists(muteKey)) {
        return {
          muted: true,
          rejected: true,
          reason: 'already-muted',
          muteSec: await getTTLSeconds(muteKey),
        };
      }

      const lastRaw = await redis.get(lastKey);
      const last = lastRaw ? Number(lastRaw) : 0;

      /* -------------------- first message -------------------- */
      if (!last) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      const delta = now - last;

      /* -------------------- hard rate limit -------------------- */
      if (delta < MESSAGE_RATE_LIMIT_MS) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC).catch(() => {});

        await logger?.({
          user: clientId,
          action: 'rateLimited',
          extra: { delta, limitMs: MESSAGE_RATE_LIMIT_MS },
        }).catch(() => {});

        return {
          muted: false,
          rejected: true,
          reason: 'rate-limit',
          muteSec: 0,
        };
      }

      /* -------------------- mechanical interval detection -------------------- */
      const prevDeltaRaw = await redis.get(prevDeltaKey);
      const prevDelta = prevDeltaRaw ? Number(prevDeltaRaw) : null;

      if (prevDelta !== null && Number.isFinite(prevDelta)) {
        if (Math.abs(delta - prevDelta) <= INTERVAL_JITTER_MS) {
          const repeat = await redis.incr(repeatKey);
          if (repeat === 1) {
            await redis.expire(repeatKey, INTERVAL_WINDOW_SEC);
          }

          if (repeat >= REPEAT_LIMIT) {
            const levelRaw = await redis.get(muteLevelKey);
            const level = Number.isInteger(Number(levelRaw)) ? Number(levelRaw) : 0;
            const muteSec = calcMuteSeconds(level);

            const pl = redis.pipeline();
            pl.set(muteKey, '1', 'EX', muteSec);
            const lastTTL = await redis.ttl(lastKey).catch(() => INTERVAL_WINDOW_SEC);
            const levelTTL = Math.max(0, lastTTL) + 10 * 60;
            pl.set(muteLevelKey, String(level + 1), 'EX', levelTTL);
            pl.del(prevDeltaKey);
            pl.del(repeatKey);
            pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
            await pl.exec();

            await logger?.({
              user: clientId,
              action: 'spamMuted',
              extra: { muteSec, level: level + 1, reason: 'stable-delta' },
            }).catch(() => {});

            return {
              muted: true,
              rejected: true,
              reason: 'stable-delta',
              muteSec,
            };
          }
        } else {
          await redis.del(repeatKey).catch(() => {});
        }
      }

      /* -------------------- accept message -------------------- */
      const pl = redis.pipeline();
      pl.set(prevDeltaKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
      pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
      await pl.exec();

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch (err) {
      await logger?.({
        user: clientId,
        action: 'spamCheckError',
        extra: { error: String(err) },
      }).catch(() => {});

      // fail-open
      return { muted: false, rejected: false, reason: 'error', muteSec: 0 };
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
