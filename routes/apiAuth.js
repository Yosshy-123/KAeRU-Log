'use strict';

const express = require('express');
const crypto = require('crypto');

const KEYS = require('../lib/redisKeys');
const { createAuthToken } = require('../auth');
const createTokenBucket = require('../utils/tokenBucket');
const { getClientIp } = require('../lib/getClientIp');

function createApiAuthRouter({ redisClient }) {
  const router = express.Router();
  const tokenBucket = createTokenBucket(redisClient);

  router.post('/', async (req, res) => {
    // Safe client IP extraction (may use X-Forwarded-For when PROXY=true and immediate remote is local/private)
    const ip = getClientIp(req) || '';
    const ipHash = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 8);
    const rateKey = KEYS.tokenBucketAuthIp(ipHash);

    const result = await tokenBucket.allow(rateKey, {
      capacity: 3,
      refillPerSec: 3 / (24 * 60 * 60),
    });

    if (!result.allowed) {
      return res.sendStatus(429);
    }

    let { username } = req.body;

    if (typeof username === 'string') {
      username = username.trim();
    }

    if (!username || typeof username !== 'string' || username.length === 0) {
      username = 'guest-' + crypto.randomBytes(3).toString('hex');
    }

    if (username.length > 20) {
      return res.status(400).json({ error: 'Username too long' });
    }

    const clientId = crypto.randomUUID();
    const token = createAuthToken();

    try {
      await redisClient.set(KEYS.token(token), clientId, 'EX', 60 * 60 * 24);
      await redisClient.set(KEYS.username(clientId), username, 'EX', 60 * 60 * 24);
    } catch (err) {
      console.error('apiAuth set error', err);
      return res.status(500).json({ error: 'Server error' });
    }

    res.json({ token, username });
  });

  return router;
}

module.exports = createApiAuthRouter;