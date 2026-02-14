'use strict';

/**
 * Check rate limit in milliseconds
 * @param {Object} redisClient - Redis client
 * @param {string} key - Rate limit key
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} True if rate limit allows, false otherwise
 */
async function checkRateLimitMs(redisClient, key, windowMs) {
  try {
    const now = Date.now();
    const data = await redisClient.get(key);

    if (!data) {
      // First request, allow and set expiry
      await redisClient.setEx(
        key,
        Math.ceil(windowMs / 1000),
        String(now)
      );
      return true;
    }

    const lastTime = parseInt(data);
    const timeSinceLastRequest = now - lastTime;

    if (timeSinceLastRequest >= windowMs) {
      // Enough time has passed, allow
      await redisClient.setEx(
        key,
        Math.ceil(windowMs / 1000),
        String(now)
      );
      return true;
    }

    // Rate limit exceeded
    return false;
  } catch (err) {
    console.error('[checkRateLimitMs] Error:', err);
    return true; // Allow on error
  }
}

module.exports = { checkRateLimitMs };