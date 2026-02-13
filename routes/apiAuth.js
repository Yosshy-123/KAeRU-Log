'use strict';

const express = require('express');
const crypto = require('crypto');
const validator = require('validator');

const KEYS = require('../lib/redisKeys');
const { escapeHTML } = require('../utils/sanitize');
const { createAuthToken } = require('../auth');
const createTokenBucket = require('../utils/tokenBucket');

function createApiAuthRouter({ redisClient, safeLogAction }) {
  const router = express.Router();
  const tokenBucket = createTokenBucket(redisClient);

  router.post('/auth', async (req, res) => {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const rateKey = KEYS.tokenBucketAuthIp(ip) + ':' + crypto.createHash('md5').update(userAgent).digest('hex').slice(0, 8);

    const result = await tokenBucket.allow(rateKey, {
      capacity: 5,
      refillPerSec: 5 / (24 * 60 * 60),
    });

    if (!result.allowed) {
      await safeLogAction({ user: null, action: 'authRateLimited', extra: { ip } });
      return res.sendStatus(429);
    }

    let { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      username = 'guest-' + crypto.randomBytes(3).toString('hex');
    }

    if (username.length > 24 || !validator.isAlphanumeric(username, 'en-US', { ignore: ' _-' })) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const clientId = crypto.randomUUID();
    const token = createAuthToken();

    try {
      await redisClient.set(KEYS.token(token), clientId, 'EX', 60 * 60 * 24);
      await redisClient.set(KEYS.username(clientId), escapeHTML(username), 'EX', 60 * 60 * 24);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    await safeLogAction({ user: clientId, action: 'issueToken' });

    res.json({ token, username });
  });

  return router;
}

module.exports = createApiAuthRouter;