async function pushAndTrimList(redisClient, key, value, max = 100) {
  const lua = `
    redis.call('RPUSH', KEYS[1], ARGV[1])
    redis.call('LTRIM', KEYS[1], -${max}, -1)
    return 1
  `;
  return redisClient.eval(lua, 1, key, value);
}

async function processKeysByPattern(redisClient, pattern, onChunk) {
  return new Promise((resolve, reject) => {
    const stream = redisClient.scanStream({ match: pattern, count: 500 });
    stream.on('data', async (keys) => {
      stream.pause();
      try {
        if (keys.length > 0) await onChunk(keys);
      } catch (err) {
        stream.destroy(err);
      } finally {
        stream.resume();
      }
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

async function deleteKeysByPattern(redis, pattern, { batchSize = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({ match: pattern, count: batchSize });

    stream.on('data', async (keys) => {
      if (!keys.length) return;
      const pipeline = redis.pipeline();
      keys.forEach(k => pipeline.del(k));
      try {
        await pipeline.exec();
      } catch (err) {
        stream.destroy(err);
      }
    });

    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

module.exports = { pushAndTrimList, processKeysByPattern };
