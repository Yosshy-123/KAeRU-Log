'use strict';

/**
 * Push value to list and trim to max length
 * @param {Object} redisClient - Redis client
 * @param {string} key - List key
 * @param {string} value - Value to push
 * @param {number} maxLength - Maximum list length
 * @returns {Promise<void>}
 */
async function pushAndTrimList(redisClient, key, value, maxLength) {
  try {
    await redisClient.lPush(key, value);
    await redisClient.lTrim(key, 0, maxLength - 1);
  } catch (err) {
    console.error('[pushAndTrimList] Error:', err);
    throw err;
  }
}

module.exports = { pushAndTrimList };