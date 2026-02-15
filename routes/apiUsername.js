'use strict';

const express = require('express');
const validator = require('validator');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/redisUtils');

function createApiUsernameRouter({ redisClient, safeLogAction, emitUserToast }) {
  const router = express.Router();

  router.post('/username', async (req, res) => {
    const clientId = req.clientId;
    if (!clientId) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      emitUserToast(clientId, 'ユーザー名を入力してください');
      return res.status(400).json({ error: 'Invalid username' });
    }

  if (username.trim().length > 20) {
    emitUserToast(clientId, 'ユーザー名は20文字以内にしてください');
    return res.status(400).json({ error: 'Username too long' });
  }

    const key = KEYS.username(clientId);
    const current = await redisClient.get(key);
    if (current === sanitized) return res.json({ ok: true });

    const rateKey = KEYS.rateUsername(clientId);
    if (!(await checkRateLimitMs(redisClient, rateKey, 30000))) {
      emitUserToast(clientId, 'ユーザー名の変更は30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    await redisClient.set(key, sanitized, 'EX', 60 * 60 * 24);

    if (!current) {
      await safeLogAction({ user: clientId, action: 'usernameSet', extra: { newUsername: sanitized } });
      emitUserToast(clientId, 'ユーザー名が登録されました');
    } else {
      await safeLogAction({
        user: clientId,
        action: 'usernameChanged',
        extra: { oldUsername: current, newUsername: sanitized },
      });
      emitUserToast(clientId, 'ユーザー名を変更しました');
    }

    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiUsernameRouter;