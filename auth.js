'use strict';

const crypto = require('crypto');
const KEYS = require('./lib/redisKeys');

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function validateAuthToken(redisClient, token) {
  if (!token) return null;
  try {
    return await redisClient.get(KEYS.token(token)) || null;
  } catch (err) {
    console.error('validateAuthToken error', err);
    return null; // fail-close
  }
}

module.exports = { createAuthToken, validateAuthToken };