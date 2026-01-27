module.exports = function createSpamService(redis, logger, KEYS, config = {}) {
  const BASE_MUTE_SEC = config.baseMuteSec || 30;
  const MAX_MUTE_SEC = config.maxMuteSec || 60 * 10;
  const REPEAT_LIMIT = config.repeatLimit || 3;
  const MESSAGE_RATE_LIMIT_MS = config.messageRateLimitMs || 1200;

  function calcMuteSeconds(level) {
    return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
  }

  async function isMuted(clientId) {
    try {
      const exists = await redis.exists(KEYS.mute(clientId));
      return !!exists;
    } catch (e) {
      // On error, be conservative: do not treat as muted (so we don't block unnecessarily)
      return false;
    }
  }

  // rate check (ms window) - atomic-ish using GET/SET PX pattern
  async function checkRate(clientId) {
    const key = KEYS.rateMsg(clientId);
    const now = Date.now();
    try {
      const last = await redis.get(key);
      if (last && now - Number(last) < MESSAGE_RATE_LIMIT_MS) {
        return false;
      }
      // set new last timestamp in ms with PX
      await redis.set(key, String(now), 'PX', MESSAGE_RATE_LIMIT_MS);
      return true;
    } catch (err) {
      // on redis error, allow sending (fail-open)
      return true;
    }
  }

  // interval / repeat spam detection
  async function checkIntervalSpam(clientId) {
    const burstKey = KEYS.spamRepeatCount(clientId);
    const muteKey = KEYS.mute(clientId);
    const muteLevelKey = KEYS.muteLevel(clientId);

    const BURST_LIMIT = 2;

    try {
      const count = await redis.incr(burstKey);

      if (count === 1) {
        await redis.expire(burstKey, Math.ceil(MESSAGE_RATE_LIMIT_SEC));
      }

      if (count >= BURST_LIMIT) {
        const level = Number(await redis.get(muteLevelKey)) || 0;
        const muteSec = calcMuteSeconds(level);

        const pl = redis.pipeline();
        pl.set(muteKey, '1', 'EX', muteSec);
        pl.set(muteLevelKey, String(level + 1), 'EX', 10 * 60);
        pl.del(burstKey);
        await pl.exec();

        return muteSec;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  async function check(clientId) {
    if (!clientId) return { muted: false, reason: null, muteSec: 0 };

    try {
      const m = await isMuted(clientId);
      if (m) return { muted: true, reason: 'already-muted', muteSec: 0 };
    } catch (e) {
      // swallow
    }

    const okRate = await checkRate(clientId);
    if (!okRate) return { muted: true, reason: 'rate', muteSec: 0 };

    const muteSec = await checkIntervalSpam(clientId);
    if (muteSec > 0) {
      try {
        await logger({ user: clientId, action: 'spamMuted', extra: { muteSec } });
      } catch (e) {
        // logger should be safe but swallow errors here
      }
      return { muted: true, reason: 'pattern', muteSec };
    }

    return { muted: false, reason: null, muteSec: 0 };
  }

  return { check, isMuted };
};
