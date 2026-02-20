module.exports = {
  async checkRateLimitMs(redisClient, key, windowMs) {
    try {
      const last = await redisClient.get(key);
      const now = Date.now();
      if (last && now - Number(last) < windowMs) return false;
      await redisClient.set(key, String(now), 'PX', windowMs);
      return true;
    } catch (err) {
      console.error('checkRateLimitMs error', err);
      return false;
    }
  },
};