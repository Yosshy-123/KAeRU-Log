'use strict';

const express = require('express');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/rateLimitUtils');
const { classifyTextInput, isValidUsername, normalizeUsername, USERNAME_MAX_LENGTH } = require('../lib/validation');
const config = require('../config');

const USERNAME_RATE_LIMIT_MS = config.rateLimit.usernameChangeMs;
const USERNAME_TTL_SEC = config.auth.sessionTtlSec;

function createApiUsernameRouter({ redisClient, emitUserToast }) {
  const router = express.Router();

  router.post('/username', async (req, res) => {
    const clientId = typeof req.clientId === 'string' ? req.clientId : '';
    if (!clientId) {
      return res.status(403).json({ error: 'Authentication required', code: 'no_token' });
    }

    const usernameInputType = classifyTextInput(req.body?.username);
    if (usernameInputType === 'invalid_type') {
      emitUserToast(clientId, 'ユーザー名を入力してください', { tone: 'warning' });
      return res.status(400).json({ error: 'Invalid username', code: 'invalid_username' });
    }

    const normalizedUsername = normalizeUsername(req.body?.username);
    if (!normalizedUsername) {
      // missing or empty — same client response as before
      emitUserToast(clientId, 'ユーザー名を入力してください', { tone: 'warning' });
      return res.status(400).json({ error: 'Invalid username', code: 'invalid_username' });
    }

    if (!isValidUsername(normalizedUsername)) {
      emitUserToast(clientId, `ユーザー名は${USERNAME_MAX_LENGTH}文字以内にしてください`, {
        tone: 'warning',
      });
      return res.status(400).json({ error: 'Username too long', code: 'invalid_username' });
    }

    const key = KEYS.username(clientId);
    const current = await redisClient.get(key);
    const currentNormalized = normalizeUsername(current);

    if (currentNormalized === normalizedUsername) {
      return res.json({ ok: true });
    }

    const rateKey = KEYS.rateUsername(clientId);
    if (!(await checkRateLimitMs(redisClient, rateKey, USERNAME_RATE_LIMIT_MS))) {
      emitUserToast(clientId, 'ユーザー名の変更は30秒以上間隔をあけてください', { tone: 'warning' });
      return res.sendStatus(429);
    }

    await redisClient.set(key, normalizedUsername, 'EX', USERNAME_TTL_SEC);

    emitUserToast(
      clientId,
      !currentNormalized ? 'ユーザー名が登録されました' : 'ユーザー名を変更しました',
      { tone: 'success' }
    );

    return res.json({ ok: true });

  });

  return router;
}

module.exports = createApiUsernameRouter;
