'use strict';

/**
 * Create a token bucket rate limiter
 * @param {Object} redisClient - Redis client instance
 * @returns {Object} Token bucket instance with allow method
 */
function createTokenBucket(redisClient) {
  return {
    /**
     * Check if request is allowed within rate limit
     * @param {string} key - Rate limit key
     * @param {Object} options - Configuration
     * @param {number} options.capacity - Max tokens in bucket
     * @param {number} options.refillPerSec - Tokens added per second
     * @returns {Promise<Object>} Result with allowed flag
     */
    async allow(key, { capacity, refillPerSec }) {
      try {
        // Get current state
        const data = await redisClient.get(key);
        
        let state = { tokens: capacity, lastRefill: Date.now() };
        
        if (data) {
          try {
            state = JSON.parse(data);
          } catch (e) {
            // If parsing fails, reset state
            state = { tokens: capacity, lastRefill: Date.now() };
          }
        }

        // Calculate refill
        const now = Date.now();
        const timePassed = (now - state.lastRefill) / 1000; // seconds
        const tokensAdded = timePassed * refillPerSec;
        const newTokens = Math.min(capacity, state.tokens + tokensAdded);

        // Check if allowed
        const allowed = newTokens >= 1;

        // Update state
        const updatedState = {
          tokens: allowed ? newTokens - 1 : newTokens,
          lastRefill: now
        };

        // Store updated state with 1 hour TTL
        await redisClient.setEx(
          key,
          3600,
          JSON.stringify(updatedState)
        );

        return { allowed };
      } catch (err) {
        console.error('[tokenBucket] Error:', err);
        return { allowed: false };
      }
    }
  };
}

module.exports = createTokenBucket;