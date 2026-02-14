'use strict';

const crypto = require('crypto');

/**
 * Create spam detection service
 * @param {Object} redisClient - Redis client
 * @param {Function} safeLogAction - Logging function
 * @param {Object} KEYS - Redis key definitions
 * @returns {Object} Spam service with check method
 */
function createSpamService(redisClient, safeLogAction, KEYS) {
  return {
    /**
     * Check if message is spam
     * @param {string} clientId - Client ID
     * @param {string} message - Message content
     * @returns {Promise<Object>} Spam check result
     */
    async check(clientId, message) {
      try {
        // Get current mute status
        const muteKey = KEYS.mute(clientId);
        const muteData = await redisClient.get(muteKey);

        if (muteData) {
          const mute = JSON.parse(muteData);
          return {
            rejected: true,
            muted: true,
            muteSec: mute.seconds,
            reason: 'muted'
          };
        }

        // Check message hash for duplicates
        const messageHash = crypto
          .createHash('sha256')
          .update(message)
          .digest('hex')
          .slice(0, 16);

        const lastHashKey = KEYS.spamLastMsgHash(clientId);
        const repeatCountKey = KEYS.spamRepeatMsgCount(clientId);

        const lastHash = await redisClient.get(lastHashKey);
        const repeatCount = await redisClient.get(repeatCountKey);

        if (lastHash === messageHash) {
          const count = (parseInt(repeatCount) || 0) + 1;

          if (count >= 3) {
            // Mute for 5 minutes
            const muteSec = 300;
            await redisClient.setEx(
              muteKey,
              muteSec,
              JSON.stringify({ seconds: muteSec })
            );

            await redisClient.del(lastHashKey);
            await redisClient.del(repeatCountKey);

            return {
              rejected: true,
              muted: true,
              muteSec,
              reason: 'spam_repeat'
            };
          }

          await redisClient.setEx(repeatCountKey, 60, String(count));
        } else {
          await redisClient.setEx(lastHashKey, 60, messageHash);
          await redisClient.del(repeatCountKey);
        }

        // Rate limiting - max 10 messages per minute per user
        const rateLimitKey = KEYS.rateMsg(clientId);
        const msgCount = await redisClient.incr(rateLimitKey);

        if (msgCount === 1) {
          await redisClient.expire(rateLimitKey, 60);
        }

        if (msgCount > 10) {
          return {
            rejected: true,
            muted: false,
            reason: 'rate_limit'
          };
        }

        return { rejected: false, muted: false };
      } catch (err) {
        console.error('[spamService] Error:', err);
        // Allow message if spam check fails
        return { rejected: false, muted: false };
      }
    }
  };
}

module.exports = createSpamService;