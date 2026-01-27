/**
 * getOrResetByTTLSec
 * - expireSec は秒単位
 * - 戻り値は Number(value) or defaultValue
 */
async function getOrResetByTTLSec(redisClient, key, defaultValue = 0, expireSec = 0) {
  const raw = await redisClient.get(key);
  let value = raw == null ? defaultValue : Number(raw) || 0;
  const ttl = await redisClient.ttl(key);

  if (ttl === -2 && expireSec > 0) {
    await redisClient.set(key, value, 'EX', expireSec);
  }
  return value;
}

/**
 * checkRateLimitMs -- windowMs はミリ秒単位のレート制限（最後の時刻を PX で保存）
 * - key: unique key
 * - windowMs: milliseconds
 */
async function checkRateLimitMs(redisClient, key, windowMs) {
  const last = await redisClient.get(key);
  const now = Date.now();
  if (last && now - Number(last) < windowMs) return false;
  // store as PX (ms)
  await redisClient.set(key, String(now), 'PX', windowMs);
  return true;
}

/**
 * checkCountLimitSec -- windowSec は秒単位でカウントするもの
 */
async function checkCountLimitSec(redisClient, key, limit, windowSec) {
  const count = Number(await getOrResetByTTLSec(redisClient, key, 0, windowSec));
  if (count + 1 > limit) return false;
  await redisClient.incr(key);
  return true;
}

module.exports = { getOrResetByTTLSec, checkRateLimitMs, checkCountLimitSec };
