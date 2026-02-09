'use strict';

const KEYS = require('./lib/redisKeys');
const { toJST, pad } = require('./utils/time');

async function monthlyRedisReset(redisClient) {
  const now = new Date();
  const jstNow = toJST(now);
  const currentMonth = `${jstNow.getUTCFullYear()}-${pad(jstNow.getUTCMonth() + 1)}`;

  try {
    const savedMonth = await redisClient.get(KEYS.systemCurrentMonth());
    if (savedMonth === currentMonth) return;

    const lockKey = KEYS.resetLock();
    const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 30);
    if (!locked) return;

    console.log('[Redis] Month changed, running FLUSHDB');

    await redisClient.flushdb();
    await redisClient.set(KEYS.systemCurrentMonth(), currentMonth);

    console.log('[Redis] FLUSHDB completed');
  } catch (err) {
    console.error('[Redis] Monthly reset failed', err);
  }
}

function registerMonthlyResetCron(cron, redisClient) {
  cron.schedule(
    '0 0 0 1 * *',
    async () => {
      console.log('[Cron] Running monthly Redis reset...');
      await monthlyRedisReset(redisClient);
    },
    { timezone: 'Asia/Tokyo' }
  );
}

module.exports = { monthlyRedisReset, registerMonthlyResetCron };