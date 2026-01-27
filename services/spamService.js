const KEYS = require('../lib/redisKeys');

const BASE_MUTE_SEC = 30;
const MAX_MUTE_SEC = 60 * 10; // 10 minutes
const SPAM_CHECK_WINDOW = 60;
const REPEAT_LIMIT = 3;

function calcMuteSeconds(muteLevel) {
  return Math.min(BASE_MUTE_SEC * 2 ** muteLevel, MAX_MUTE_SEC);
}

module.exports = function createSpamService(redisClient, logger) {
  async function applySpamMute(clientId) {
    const muteKey = KEYS.msgMute(clientId);
    const muteLevelKey = KEYS.msgMuteLevel(clientId);
    const lastMuteKey = KEYS.msgLastMute(clientId);

    let muteLevel = Number(await redisClient.get(muteLevelKey)) || 0;
    const muteSeconds = calcMuteSeconds(muteLevel);

    await redisClient.set(muteKey, '1', 'EX', muteSeconds);
    await redisClient.set(muteLevelKey, muteLevel + 1, 'EX', 10 * 60);
    await redisClient.set(lastMuteKey, Date.now(), 'EX', 10 * 60);

    await logger({ user: clientId, action: 'messageMutedBySpam', extra: { muteSeconds }});
    return muteSeconds;
  }

  async function handleSpamCheck(clientId) {
    const lastTimeKey = KEYS.msgLastTime(clientId);
    const repeatCountKey = KEYS.msgRepeatCount(clientId);
    const lastIntervalKey = KEYS.msgLastInterval(clientId);

    const lastTime = Number(await redisClient.get(lastTimeKey)) || 0;
    const lastInterval = Number(await redisClient.get(lastIntervalKey)) || 0;
    let intervalCount = Number(await redisClient.get(repeatCountKey)) || 0;

    const now = Date.now();
    const interval = now - lastTime;

    if (lastTime && Math.abs(interval - lastInterval) < 300) {
      intervalCount++;
    } else {
      intervalCount = 1;
    }

    await redisClient.set(repeatCountKey, intervalCount, 'EX', SPAM_CHECK_WINDOW);
    await redisClient.set(lastIntervalKey, interval, 'EX', SPAM_CHECK_WINDOW);
    await redisClient.set(lastTimeKey, now, 'EX', SPAM_CHECK_WINDOW);

    if (intervalCount >= REPEAT_LIMIT) {
      return applySpamMute(clientId);
    }
    return 0;
  }

  return { handleSpamCheck, applySpamMute, calcMuteSeconds };
};

  
