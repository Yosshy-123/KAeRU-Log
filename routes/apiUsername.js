'use strict';

const express = require('express');
const validator = require('validator');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/redisUtils');

function createApiUsernameRouter({ redisClient, safeLogAction, emitUserToast }) {
  const router = express.Router();

  router.post('/username', async (req, res) => {
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(403).json({ error: 'Authentication required', code: 'no_token' });
    }

    const { username } = req.body;

    // 入力チェック
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

    // 変更がない場合は OK を返す
    if (current === username) {
      return res.json({ ok: true });
    }

    // レート制限（30秒）
    const rateKey = KEYS.rateUsername(clientId);
    if (!(await checkRateLimitMs(redisClient, rateKey, 30000))) {
      emitUserToast(clientId, 'ユーザー名の変更は30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    // 新しい username を保存（24時間）
    await redisClient.set(key, username, 'EX', 60 * 60 * 24);

    // ログとトースト
    if (!current) {
      await safeLogAction({
        user: clientId,
        action: 'usernameSet',
        extra: { newUsername: username }
      });
      emitUserToast(clientId, 'ユーザー名が登録されました');
    } else {
      await safeLogAction({
        user: clientId,
        action: 'usernameChanged',
        extra: { oldUsername: current, newUsername: username }
      });
      emitUserToast(clientId, 'ユーザー名を変更しました');
    }

    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiUsernameRouter;
