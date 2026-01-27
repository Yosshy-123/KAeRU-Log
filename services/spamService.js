'use strict';

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = config.repeatLimit || 3;

  const MESSAGE_RATE_LIMIT_MS =
    typeof config.messageRateLimitMs === 'number'
      ? config.messageRateLimitMs
      : 1200;

  const INTERVAL_JITTER_MS = 300;
  const INTERVAL_WINDOW_SEC = 60 * 60; // 1 hour

  function calcMuteSeconds(level) {
    return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
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

    if (await isMuted(clientId)) {
      return {
        muted: true,
        rejected: true,
        reason: 'already-muted',
        muteSec: 0,
      };
    }

    const now = Date.now();

    const lastKey = KEYS.rateMsg(clientId);        // last accepted timestamp
    const prevDeltaKey = KEYS.rateInterval(clientId); // previous delta
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    try {
      const lastRaw = await redis.get(lastKey);
      const last = Number(lastRaw) || 0;

      // first accepted message
      if (!last) {
        await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      const delta = now - last;

      /* ===============================
         RATE LIMIT (hard reject)
      =============================== */
      if (delta < MESSAGE_RATE_LIMIT_MS) {
        return {
          muted: false,
          rejected: true,
          reason: 'rate-limit',
          muteSec: 0,
        };
      }

      /* ===============================
         MECHANICAL INTERVAL CHECK
      =============================== */
      const prevDeltaRaw = await redis.get(prevDeltaKey);
      const prevDelta = Number(prevDeltaRaw) || null;

      if (prevDelta !== null) {
        if (Math.abs(delta - prevDelta) <= INTERVAL_JITTER_MS) {
          const repeat = await redis.incr(repeatKey);
          if (repeat === 1) {
            await redis.expire(repeatKey, INTERVAL_WINDOW_SEC);
          }

          if (repeat >= REPEAT_LIMIT) {
            const level = Number(await redis.get(muteLevelKey)) || 0;
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
                extra: {
                  muteSec,
                  level: level + 1,
                  reason: 'stable-delta-1h',
                },
              });
            } catch {}

            return {
              muted: true,
              rejected: true,
              reason: 'stable-delta-1h',
              muteSec,
            };
          }
        } else {
          // delta drifted -> reset counter
          await redis.del(repeatKey).catch(() => {});
        }
      }

      /* ===============================
         ACCEPTED MESSAGE STATE UPDATE
      =============================== */
      const pl = redis.pipeline();
      pl.set(prevDeltaKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
      pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
      await pl.exec();

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch {
      return { muted: false, rejected: false, reason: 'error', muteSec: 0 };
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
