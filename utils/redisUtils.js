module.exports = {
  async checkRateLimitMs(redisClient, key, windowMs) {
    try {
      const last = await redisClient.get(key);
      const now = Date.now();
      if (last && now - Number(last) < windowMs) return false;
      await redisClient.set(key, String(now), 'PX', windowMs);
      return true;
    } catch (err) {
      // On redis error, allow (fail-open)
      return true;
    }
  },

  async getOrResetByTTLSec(redisClient, key, defaultValue = 0, expireSec = 0) {
    try {
      const raw = await redisClient.get(key);
      let value = raw == null ? defaultValue : Number(raw) || 0;
      const ttl = await redisClient.ttl(key);
      if (ttl === -2 && expireSec > 0) {
        await redisClient.set(key, String(value), 'EX', expireSec);
      }
      return value;
    } catch (err) {
      return defaultValue;
    }
  },

  async checkCountLimitSec(redisClient, key, limit, windowSec) {
    try {
      const count = Number(await redisClient.get(key)) || 0;
      if (count + 1 > limit) return false;
      const pipeline = redisClient.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowSec);
      await pipeline.exec();
      return true;
    } catch (err) {
      // fail-open
      return true;
    }
  },
};
