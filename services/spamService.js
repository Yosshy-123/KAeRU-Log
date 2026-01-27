const KEYS = require('../lib/redisKeys');

const BASE_MUTE_SEC = 30;
const MAX_MUTE_SEC = 600;
const SPAM_CHECK_WINDOW_SEC = 60;
const REPEAT_LIMIT = 3;

function calcMuteSeconds(level) {
  return Math.min(BASE_MUTE_SEC * 2 ** level, MAX_MUTE_SEC);
}

async function safeLog(logger, payload) {
  try {
    await logger(payload);
  } catch (e) {
    console.error('spamService logger failed', e);
  }
}

module.exports = function createSpamService(redis, logger) {
  async function isMuted(clientId) {
    return redis.exists(KEYS.mute(clientId));
  }

  async function checkRate(clientId) {
    const key = KEYS.rate(clientId);
    const now = Date.now();
    const last = await redis.get(key);

    if (last && now - Number(last) < 1000) return false;
    await redis.set(key, now, 'PX', 1000);
    return true;
  }

  async function checkIntervalSpam(clientId) {
    const now = Date.now();

    const lastTimeKey = KEYS.spamLastTime(clientId);
    const lastIntervalKey = KEYS.spamLastInterval(clientId);
    const countKey = KEYS.spamIntervalCount(clientId);
    const levelKey = KEYS.muteLevel(clientId);

    const lastTime = Number(await redis.get(lastTimeKey)) || 0;
    const lastInterval = Number(await redis.get(lastIntervalKey)) || 0;

    const interval = lastTime ? now - lastTime : 0;
    let count = Number(await redis.get(countKey)) || 0;

    if (lastTime && Math.abs(interval - lastInterval) < 300) {
      count++;
    } else {
      count = 1;
    }

    const pipeline = redis.pipeline();
    pipeline.set(lastTimeKey, now, 'EX', SPAM_CHECK_WINDOW_SEC);
    pipeline.set(lastIntervalKey, interval, 'EX', SPAM_CHECK_WINDOW_SEC);
    pipeline.set(countKey, count, 'EX', SPAM_CHECK_WINDOW_SEC);
    await pipeline.exec();

    if (count < REPEAT_LIMIT) return 0;

    const level = Number(await redis.get(levelKey)) || 0;
    const muteSec = calcMuteSeconds(level);

    await redis.set(KEYS.mute(clientId), '1', 'EX', muteSec);
    await redis.set(levelKey, level + 1, 'EX', 600);

    return muteSec;
  }

  async function handleMessage(clientId) {
    if (await isMuted(clientId)) {
      return { muted: true, reason: 'muted', muteSec: 0 };
    }

    if (!(await checkRate(clientId))) {
      return { muted: true, reason: 'rate', muteSec: 0 };
    }

    const muteSec = await checkIntervalSpam(clientId);
    if (muteSec > 0) {
      await safeLog(logger, {
        user: clientId,
        action: 'spamMuted',
        extra: { muteSec },
      });
      return { muted: true, reason: 'spam', muteSec };
    }

    return { muted: false, reason: null, muteSec: 0 };
  }

  return { handleMessage };
};
