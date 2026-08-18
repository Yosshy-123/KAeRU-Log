'use strict';

/**
 * Application constants.
 * Numeric values match historical behavior — do not change semantics casually.
 * This object is frozen to prevent runtime mutation.
 */
const config = Object.freeze({
  auth: Object.freeze({
    sessionTtlSec: 24 * 60 * 60,
    tokenBucketCapacity: 3,
  }),
  admin: Object.freeze({
    failureWindowMs: 15 * 60 * 1000,
    lockoutMs: 10 * 60 * 1000,
    maxLockoutMs: 60 * 60 * 1000,
    failureThreshold: 5,
  }),
  rateLimit: Object.freeze({
    usernameChangeMs: 30_000,
  }),
  spam: Object.freeze({
    baseMuteSec: 60,
    maxMuteSec: 60 * 60 * 24,
    repeatLimit: 3,
    sameMessageLimit: 3,
    messageRateLimitMs: 1200,
    intervalJitterMs: 300,
    intervalWindowSec: 60 * 60,
    shortRateWindowSec: 15,
    shortRateLimit: 6,
    ipRateMultiplier: 1.8,
  }),
  messages: Object.freeze({
    maxLength: 300,
    generalRoomMax: 300,
    defaultRoomMax: 100,
  }),
  username: Object.freeze({
    maxLength: 20,
  }),
  room: Object.freeze({
    idMaxLength: 32,
  }),
  cleanup: Object.freeze({
    thresholdDays: 30,
    intervalMs: 24 * 60 * 60 * 1000,
  }),
  http: Object.freeze({
    jsonBodyLimit: '100kb',
  }),
  socket: Object.freeze({
    sessionTtlSec: 24 * 60 * 60,
  }),
});

module.exports = config;
