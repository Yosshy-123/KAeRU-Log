'use strict';

const KEYS = require('./redisKeys');
const { processKeysByPattern } = require('./redisHelpers');

// Parse time strings produced by formatJST: 'YYYY/MM/DD HH:mm'
function parseJSTTimeString(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\\d{4})\/(\\d{2})\/(\\d{2})\s+(\\d{2}):(\\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const dd = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = Number(m[6] || '0');

  // formatJST produced a JST datetime by adding +9h to UTC. To get UTC timestamp, subtract 9 hours.
  const dateUtc = new Date(Date.UTC(yyyy, mm, dd, hh, mi, ss));
  const ts = dateUtc.getTime() - 9 * 60 * 60 * 1000;
  return ts;
}

module.exports = function createCleanupRooms({ redisClient, io, thresholdDays = 30 }) {
  if (!redisClient) throw new Error('redisClient required');

  const thresholdMs = Number(thresholdDays) * 24 * 60 * 60 * 1000;

  async function runOnce() {
    const now = Date.now();

    await processKeysByPattern(redisClient, KEYS.messagesPattern(), async (keys) => {
      for (const key of keys) {
        try {
          if (!key || !key.startsWith('messages:')) continue;
          const roomId = key.slice('messages:'.length);
          if (!roomId) continue;
          if (roomId === 'general') continue; // never delete general

          // Get last message (newest) stored at right side
          const lastMsgRaw = await redisClient.lindex(key, -1);
          let lastActiveTs = null;

          if (lastMsgRaw) {
            try {
              const m = JSON.parse(lastMsgRaw);
              if (m && m.time) {
                const parsed = parseJSTTimeString(m.time);
                if (parsed && !Number.isNaN(parsed)) lastActiveTs = parsed;
              }
            } catch (e) {
              // ignore parse error
            }
          }

          // If no last message timestamp available, treat as old (delete)
          const last = lastActiveTs || 0;

          if (now - last > thresholdMs) {
            try {
              await redisClient.del(key);
              // also try to delete any associated room meta key if present
              try {
                await redisClient.del(KEYS.roomLastActive ? KEYS.roomLastActive(roomId) : `room:last:${roomId}`);
              } catch (e) {
                // ignore if helper missing
              }

              if (io && typeof io.to === 'function') {
                try {
                  io.to(roomId).emit('clearMessages');
                } catch (e) {
                  // ignore
                }
              }
            } catch (err) {
              console.error('cleanup: failed to delete', roomId, err);
            }
          }
        } catch (err) {
          console.error('cleanup: error processing key', key, err);
        }
      }
    });
  }

  function schedule(intervalMs = 24 * 60 * 60 * 1000) {
    // run once immediately, then schedule
    runOnce().catch((e) => console.error('cleanup: initial run failed', e));
    return setInterval(() => runOnce().catch((e) => console.error('cleanup: run failed', e)), intervalMs);
  }

  return { runOnce, schedule };
};
