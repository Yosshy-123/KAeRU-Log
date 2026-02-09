'use strict';

const express = require('express');
const crypto = require('crypto');

const KEYS = require('../lib/redisKeys');
const { escapeHTML } = require('../utils/sanitize');
const { createAuthToken } = require('../auth');
const createTokenBucket = require('../utils/tokenBucket');

function createApiAuthRouter({ redisClient, safeLogAction }) {
  const router = express.Router();
  const tokenBucket = createTokenBucket(redisClient);

  // POST /api/auth
  router.post('/auth', async (req, res) => {
    const ip = req.ip;

    const result = await tokenBucket.allow(KEYS.tokenBucketAuthIp(ip), {
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

    if (username.length > 24) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const clientId = crypto.randomUUID();
    const token = createAuthToken();

    await redisClient.set(KEYS.token(token), clientId, 'EX', 60 * 60 * 24);
    await redisClient.set(KEYS.username(clientId), escapeHTML(username), 'EX', 60 * 60 * 24);

    await safeLogAction({ user: clientId, action: 'issueToken' });

    res.json({ token, clientId, username });
  });

  return router;
}

module.exports = createApiAuthRouter;