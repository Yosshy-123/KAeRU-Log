'use strict';

const { formatJST } = require('./time');

/**
 * Log action with user and context information
 * Handles errors gracefully to prevent logging failures from breaking the app
 * 
 * @param {Object} redisClient - Redis client instance
 * @param {Object} payload - Payload object
 * @param {string} payload.user - User ID (optional, can be null)
 * @param {string} payload.action - Action being logged (required)
 * @param {Object} payload.extra - Additional context (optional)
 * @returns {Promise<void>}
 */
module.exports = async function rawLogAction(redisClient, { user, action, extra = {} } = {}) {
  try {
    if (!action) {
      throw new Error("rawLogAction: 'action' must be specified");
    }

    // Format timestamp in JST
    const time = formatJST(new Date(), true);
    const clientId = user ?? '-';

    // Fetch username with timeout to avoid blocking
    let username = '-';
    try {
      username = await fetchUsername(redisClient, user);
    } catch (err) {
      console.warn('[rawLogAction] Failed to fetch username:', err.message);
      username = '-';
    }

    // Build log message
    const extraStr = extra && Object.keys(extra).length > 0 
      ? ` ${JSON.stringify(extra)}` 
      : '';
    
    const logMessage = `[${time}] [User:${clientId}] [Username:${username}] Action: ${action}${extraStr}`;

    // Log to console
    try {
      console.log(logMessage);
    } catch (err) {
      console.error('[rawLogAction] Failed to log to console:', err);
    }

    // Store in Redis for persistence (non-blocking)
    if (redisClient) {
      try {
        const logKey = `logs:${new Date().toISOString().split('T')[0]}`;
        await redisClient.lPush(
          logKey, 
          JSON.stringify({
            timestamp: new Date().toISOString(),
            user: clientId,
            username,
            action,
            extra,
          })
        );
        
        // Set expiration (30 days)
        await redisClient.expire(logKey, 30 * 24 * 60 * 60);
      } catch (err) {
        console.warn('[rawLogAction] Failed to store log in Redis:', err.message);
        // Don't throw - logging failure shouldn't break the app
      }
    }
  } catch (err) {
    // Log the error but don't throw
    console.error('[rawLogAction] Critical error:', err);
  }
};

/**
 * Fetch username with timeout
 * @param {Object} redisClient - Redis client
 * @param {string} userId - User ID
 * @returns {Promise<string>} Username or '-' if not found
 */
async function fetchUsername(redisClient, userId) {
  if (!userId || !redisClient) return '-';

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((resolve) => 
      setTimeout(() => resolve(null), 100)
    );

    // Create get promise
    const getPromise = redisClient.get(`username:${userId}`);

    // Race: whichever finishes first
    const username = await Promise.race([getPromise, timeoutPromise]);
    
    return username || '-';
  } catch (err) {
    console.warn('[fetchUsername] Error:', err.message);
    return '-';
  }
}