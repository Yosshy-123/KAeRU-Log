'use strict';

module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = config.repeatLimit || 3;
  // default: 1200 ms (1.2s) as requested
  const MESSAGE_RATE_LIMIT_MS = typeof config.messageRateLimitMs === 'number'
    ? config.messageRateLimitMs
    : 1200;

  function calcMuteSeconds(level) {
    return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
  }

  async function isMuted(clientId) {
    if (!clientId) return false;
    try {
      const exists = await redis.exists(KEYS.mute(clientId));
      return !!exists;
    } catch (e) {
      // Redis エラー時は fail-open（ブロックしない）
      return false;
    }
  }

  async function check(clientId) {
    if (!clientId) return { muted: false, reason: null, muteSec: 0 };

    if (await isMuted(clientId)) {
      return { muted: true, reason: 'already-muted', muteSec: 0 };
    }

    const now = Date.now();
    const lastKey = KEYS.rateMsg(clientId);
    const repeatKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    try {
      const lastRaw = await redis.get(lastKey);
      const last = Number(lastRaw) || 0;
      const delta = last ? now - last : Infinity;

      if (last && delta < MESSAGE_RATE_LIMIT_MS) {
        const count = await redis.incr(repeatKey);

        const repeatTtlSec = Math.max(1, Math.ceil(MESSAGE_RATE_LIMIT_MS / 1000));

        if (count === 1) {
          await redis.expire(repeatKey, repeatTtlSec).catch(() => {});
        }

        if (count >= REPEAT_LIMIT) {
          const currentLevelRaw = await redis.get(muteLevelKey);
          const currentLevel = Number(currentLevelRaw) || 0;
          const muteSec = calcMuteSeconds(currentLevel);

          const pl = redis.pipeline();
          pl.set(muteKey, '1', 'EX', muteSec);
          pl.set(muteLevelKey, String(currentLevel + 1), 'EX', 10 * 60); // mute level decay window
          pl.del(repeatKey);
          pl.set(lastKey, String(now), 'PX', MESSAGE_RATE_LIMIT_MS);
          await pl.exec().catch(() => { /* ignore pipeline errors */ });

          // ログ
          try {
            await logger?.({
              user: clientId,
              action: 'spamMuted',
              extra: { muteSec, level: currentLevel + 1, reason: 'rate-repeat' },
            });
          } catch (e) {
            /* swallow logger errors */
          }

          return { muted: true, reason: 'rate-repeat', muteSec };
        }

      } else {
        try {
          await redis.del(repeatKey).catch(() => {});
        } catch (e) {
          /* ignore */
        }
      }

      try {
        await redis.set(lastKey, String(now), 'PX', MESSAGE_RATE_LIMIT_MS);
      } catch (e) {
        // ignore set error (fail-open)
      }

      return { muted: false, reason: null, muteSec: 0 };
    } catch (err) {
      return { muted: false, reason: 'error', muteSec: 0 };
    }
  }

  return {
    check,
    handleMessage: check,
    isMuted,
  };
};
