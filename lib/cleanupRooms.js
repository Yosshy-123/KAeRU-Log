'use strict';

const KEYS = require('./redisKeys');
const { processKeysByPattern } = require('./redisHelpers');
const logger = require('./logger');
const { parseStoredMessage } = require('./messageCodec');

const ROOM_PREFIX = 'messages:';
const GENERAL_ROOM_ID = 'general';
const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readLastActivityEpoch(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  let latest = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const rawJson = messages[index];
    try {
      const parsed = parseStoredMessage(JSON.parse(rawJson));
      if (parsed && (latest === null || parsed.time > latest)) {
        latest = parsed.time;
      }
    } catch {
      // keep scanning older records
    }
  }

  return latest;
}

function createCleanupRooms({ redisClient, io, thresholdDays = DEFAULT_THRESHOLD_DAYS }) {
  if (!redisClient) {
    throw new Error('redisClient required');
  }

  const days = Number(thresholdDays);
  const thresholdMs = (Number.isFinite(days) && days >= 0 ? days : DEFAULT_THRESHOLD_DAYS) * 24 * 60 * 60 * 1000;

  async function runOnce() {
    const now = Date.now();

    await processKeysByPattern(redisClient, KEYS.messagesPattern(), async (keys) => {
      for (const key of keys) {
        try {
          if (typeof key !== 'string' || !key.startsWith(ROOM_PREFIX)) {
            continue;
          }

          const roomId = key.slice(ROOM_PREFIX.length);
          if (!roomId || roomId === GENERAL_ROOM_ID) {
            continue;
          }

          const rawMessages = await redisClient.lrange(key, 0, -1);
          const lastActiveTs = readLastActivityEpoch(rawMessages);
          if (lastActiveTs === null) {
            continue;
          }

          if (now - lastActiveTs <= thresholdMs) {
            continue;
          }

          await redisClient.del(key);

          if (io && typeof io.to === 'function') {
            try {
              io.to(roomId).emit('clearMessages');
            } catch {
              // best effort
            }
          }
        } catch (err) {
          logger.error('cleanup.error', { phase: 'process_key', errorType: err?.name });
        }
      }
    });
  }

  function schedule(intervalMs = DEFAULT_INTERVAL_MS) {
    const parsed = Number(intervalMs);
    const safeInterval = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;

    runOnce().catch((err) => logger.error('cleanup.error', { phase: 'initial_run', errorType: err?.name }));
    return setInterval(() => {
      runOnce().catch((err) => logger.error('cleanup.error', { phase: 'scheduled_run', errorType: err?.name }));
    }, safeInterval);
  }

  return { runOnce, schedule };
}

module.exports = createCleanupRooms;
