'use strict';

const crypto = require('crypto');
const { normalizeUsername, isValidUsername } = require('./validation');
const config = require('../config');

const DEFAULT_TTL_SEC = config.auth.sessionTtlSec;

function createGuestUsername() {
  return `guest-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeStoredUsername(value) {
  const username = normalizeUsername(value);
  return isValidUsername(username) ? username : null;
}

async function ensureStoredUsername(redisClient, key, ttlSec = DEFAULT_TTL_SEC) {
  if (!redisClient || typeof redisClient.get !== 'function' || typeof redisClient.set !== 'function') {
    throw new Error('redisClient is required');
  }

  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey) {
    throw new Error('key is required');
  }

  const current = normalizeStoredUsername(await redisClient.get(normalizedKey));
  if (current) {
    return current;
  }

  const guestUsername = createGuestUsername();
  await redisClient.set(normalizedKey, guestUsername, 'EX', ttlSec);
  return guestUsername;
}

module.exports = {
  createGuestUsername,
  ensureStoredUsername,
  normalizeStoredUsername,
};
