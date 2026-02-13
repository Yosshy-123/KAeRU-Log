'use strict';

const express = require('express');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/redisUtils');

function createApiAdminRouter({ redisClient, io, safeLogAction, emitUserToast, emitRoomToast, adminPass }) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { password } = req.body;
    const clientId = req.clientId;
    const token = req.token;

    if (!clientId || !token) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    if (!(await checkRateLimitMs(redisClient, KEYS.rateAdminLogin(clientId), 30000))) {
      emitUserToast(clientId, 'ログイン操作には30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    if (password !== adminPass) {
      await safeLogAction({ user: clientId, action: 'InvalidAdminPassword', extra: {} });
      emitUserToast(clientId, '管理者パスワードが正しくありません');
      return res.sendStatus(403);
    }

    const tokenTtlSec = await redisClient.ttl(KEYS.token(token));

    if (tokenTtlSec <= 0) {
      await safeLogAction({ user: clientId, action: 'AdminLoginFailedNoTtl' });
      return res.status(403).json({ error: 'Invalid token TTL', code: 'invalid_token_ttl' });
    }

    await redisClient.set(KEYS.adminSession(token), clientId, 'EX', tokenTtlSec);

    await safeLogAction({ user: clientId, action: 'AdminLogin' });

    res.json({ ok: true, admin: true });
  });

  router.get('/status', async (req, res) => {
    const clientId = req.clientId;
    const token = req.token;

    if (!clientId || !token) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    const adminOwnerClientId = await redisClient.get(KEYS.adminSession(token));
    const isAdmin = adminOwnerClientId === clientId;

    res.json({ admin: isAdmin });
  });

  router.post('/logout', async (req, res) => {
    const clientId = req.clientId;
    const token = req.token;

    if (!clientId || !token) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    const adminOwnerClientId = await redisClient.get(KEYS.adminSession(token));
    if (!adminOwnerClientId) {
      await safeLogAction({ user: clientId, action: 'UnauthorizedLogout' });
      emitUserToast(clientId, '管理者セッションがありません');
      return res.sendStatus(403);
    }

    if (adminOwnerClientId !== clientId) {
      await safeLogAction({
        user: clientId,
        action: 'UnauthorizedLogoutMismatch',
        extra: { adminOwnerClientId },
      });
      emitUserToast(clientId, '管理者セッションが一致しません');
      return res.sendStatus(403);
    }

    await redisClient.del(KEYS.adminSession(token));

    await safeLogAction({ user: clientId, action: 'AdminLogout' });

    emitUserToast(clientId, '管理者ログアウトしました');

    res.json({ ok: true });
  });

  router.post('/clear/:roomId([a-zA-Z0-9_-]{1,32})', async (req, res) => {
    const roomId = req.params.roomId;
    const clientId = req.clientId;
    const token = req.token;

    if (!clientId || !token) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    if (!(await checkRateLimitMs(redisClient, KEYS.rateClear(clientId), 30000))) {
      emitUserToast(clientId, '削除操作は30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    const adminOwnerClientId = await redisClient.get(KEYS.adminSession(token));
    if (!adminOwnerClientId) {
      await safeLogAction({ user: clientId, action: 'UnauthorizedClear', extra: { roomId } });
      emitUserToast(clientId, '管理者ログインが必要です');
      return res.sendStatus(403);
    }

    if (adminOwnerClientId !== clientId) {
      await safeLogAction({
        user: clientId,
        action: 'UnauthorizedClearMismatch',
        extra: { roomId, adminOwnerClientId },
      });
      emitUserToast(clientId, '管理者セッションが一致しません');
      return res.sendStatus(403);
    }

    if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

    await redisClient.del(KEYS.messages(roomId));
    io.to(roomId).emit('clearMessages');

    emitRoomToast(roomId, '全メッセージ削除されました');

    await safeLogAction({ user: clientId, action: 'clearMessages', extra: { roomId } });

    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiAdminRouter;