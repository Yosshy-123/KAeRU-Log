'use strict';

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = config.repeatLimit || 3;

  // minimum allowed interval between accepted messages
  const MESSAGE_RATE_LIMIT_MS =
    typeof config.messageRateLimitMs === 'number'
      ? config.messageRateLimitMs
      : 1200;

  // allowed jitter for mechanical interval detection
  const INTERVAL_JITTER_MS = 300;

  // time window for mechanical interval detection
  const INTERVAL_WINDOW_SEC = 60 * 60; // 1 hour

  function calcMuteSeconds(level) {
    return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
  }

  async function isMuted(clientId) {
    if (!clientId) return false;
    try {
      return !!(await redis.exists(KEYS.mute(clientId)));
    } catch {
      // fail-open
      return false;
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

    const lastKey = KEYS.rateMsg(clientId);
    const intervalKey = KEYS.rateInterval(clientId);
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

      /* =====================================================
         RATE LIMIT (hard reject, no state mutation)
      ===================================================== */
      if (delta < MESSAGE_RATE_LIMIT_MS) {
        return {
          muted: false,
          rejected: true,
          reason: 'rate-limit',
          muteSec: 0,
        };
      }

      /* =====================================================
         MECHANICAL INTERVAL DETECTION (1h window)
      ===================================================== */
      const baseIntervalRaw = await redis.get(intervalKey);
      const baseInterval = Number(baseIntervalRaw) || null;

      if (baseInterval === null) {
        // first interval observation
        const pl = redis.pipeline();
        pl.set(intervalKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
        pl.set(repeatKey, '1', 'EX', INTERVAL_WINDOW_SEC);
        pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        await pl.exec();

        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      // interval matches (±300ms)
      if (Math.abs(delta - baseInterval) <= INTERVAL_JITTER_MS) {
        const repeat = await redis.incr(repeatKey);

        if (repeat >= REPEAT_LIMIT) {
          const level = Number(await redis.get(muteLevelKey)) || 0;
          const muteSec = calcMuteSeconds(level);

          const pl = redis.pipeline();
          pl.set(muteKey, '1', 'EX', muteSec);
          pl.set(muteLevelKey, String(level + 1), 'EX', 10 * 60);
          pl.del(intervalKey);
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
                reason: 'stable-interval-1h',
              },
            });
          } catch {
            /* swallow logger errors */
          }

          return {
            muted: true,
            rejected: true,
            reason: 'stable-interval-1h',
            muteSec,
          };
        }
      } else {
        // interval drifted -> reset baseline
        const pl = redis.pipeline();
        pl.set(intervalKey, String(delta), 'EX', INTERVAL_WINDOW_SEC);
        pl.set(repeatKey, '1', 'EX', INTERVAL_WINDOW_SEC);
        pl.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);
        await pl.exec();

        return { muted: false, rejected: false, reason: null, muteSec: 0 };
      }

      // accepted message, update last timestamp
      await redis.set(lastKey, String(now), 'EX', INTERVAL_WINDOW_SEC);

      return { muted: false, rejected: false, reason: null, muteSec: 0 };
    } catch {
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
