module.exports = {
  async pushAndTrimList(redisClient, key, value, max = 100) {
    const lua = `
      local max = tonumber(ARGV[2])
      redis.call('RPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], -max, -1)
      return 1
    `;
    try {
      return await redisClient.eval(lua, 1, key, value, String(max));
    } catch (err) {
      console.error('pushAndTrimList error', err);
      throw err;
    }
  },

  async processKeysByPattern(redisClient, pattern, handler) {
    return new Promise((resolve, reject) => {
      const stream = redisClient.scanStream({ match: pattern, count: 500 });

      stream.on('data', async (keys) => {
        if (!keys || keys.length === 0) return;
        stream.pause();
        try {
          await handler(keys);
        } catch (err) {
          stream.destroy(err);
          return;
        } finally {
          try {
            stream.resume();
          } catch (e) {
            // ignore
          }
        }
      });

      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });
  },
};