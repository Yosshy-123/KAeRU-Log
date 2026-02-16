'use strict';

const express = require('express');
const crypto = require('crypto');
const validator = require('validator');

const KEYS = require('../lib/redisKeys');
const { createAuthToken } = require('../auth');
const createTokenBucket = require('../utils/tokenBucket');

function createApiAuthRouter({ redisClient, safeLogAction }) {
  const router = express.Router();
  const tokenBucket = createTokenBucket(redisClient);

  router.post('/', async (req, res) => {
    const ip = req.ip;
    const rateKey = KEYS.tokenBucketAuthIp(ip) + ':' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8);

    const result = await tokenBucket.allow(rateKey, {
      capacity: 3,
      refillPerSec: 3 / (24 * 60 * 60),
    });

    if (!result.allowed) {
      await safeLogAction({ user: null, action: 'authRateLimited', extra: { ip } });
      return res.sendStatus(429);
    }

    let { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    if (username.trim().length > 20) {
      return res.status(400).json({ error: 'Username too long' });
    }

    const clientId = crypto.randomUUID();
    const token = createAuthToken();

    try {
      await redisClient.set(KEYS.token(token), clientId, 'EX', 60 * 60 * 24);
      await redisClient.set(KEYS.username(clientId), username, 'EX', 60 * 60 * 24);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    await safeLogAction({ user: clientId, action: 'issueToken' });

    res.json({ token, username });
  });

  return router;
}

module.exports = createApiAuthRouter;