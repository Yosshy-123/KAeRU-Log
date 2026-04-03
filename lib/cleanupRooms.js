'use strict';

const KEYS = require('./redisKeys');
const { processKeysByPattern } = require('./redisHelpers');

const ROOM_PREFIX = 'messages:';
const GENERAL_ROOM_ID = 'general';
const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function parseStoredEpochMessage(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const time = raw.time;
  if (typeof time !== 'number' || !Number.isFinite(time)) {
    return null;
  }

  return time;
}

function readLastActivityEpoch(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    return parseStoredEpochMessage(parsed);
  } catch {
    return null;
  }
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

          const lastMsgRaw = await redisClient.lindex(key, -1);
          if (!lastMsgRaw) {
            continue;
          }

          const lastActiveTs = readLastActivityEpoch(lastMsgRaw);
          if (!lastActiveTs) {
            continue;
          }

          if (now - lastActiveTs <= thresholdMs) {
            continue;
          }

          await redisClient.del(key);

          if (io && typeof io.to === 'function') {
            try {
              io.to(roomId).emit('clearMessages');
            } catch (err) {
              // best effort
            }
          }
        } catch (err) {
          console.error('cleanup: error processing key', key, err);
        }
      }
    });
  }

  function schedule(intervalMs = DEFAULT_INTERVAL_MS) {
    const parsed = Number(intervalMs);
    const safeInterval = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;

    runOnce().catch((err) => console.error('cleanup: initial run failed', err));
    return setInterval(() => {
      runOnce().catch((err) => console.error('cleanup: run failed', err));
    }, safeInterval);
  }

  return { runOnce, schedule };
}

module.exports = createCleanupRooms;