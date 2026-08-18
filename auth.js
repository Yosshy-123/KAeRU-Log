'use strict';

const crypto = require('crypto');
const KEYS = require('./lib/redisKeys');
const logger = require('./lib/logger');

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function validateAuthToken(redisClient, token) {
  if (typeof token !== 'string') {
    return null;
  }

  const normalizedToken = token.trim();
  if (!normalizedToken || !TOKEN_PATTERN.test(normalizedToken)) {
    return null;
  }

  try {
    const clientId = await redisClient.get(KEYS.token(normalizedToken));
    return clientId || null;
  } catch (err) {
    logger.error('auth.token_validation_error', { errorType: err?.name });
    return null;
  }
}

module.exports = { createAuthToken, validateAuthToken };