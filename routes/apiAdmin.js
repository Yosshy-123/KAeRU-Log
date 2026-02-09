'use strict';

const express = require('express');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/redisUtils');

function createApiAdminRouter({ redisClient, io, safeLogAction, emitUserToast, emitRoomToast, adminPass }) {
  const router = express.Router();

  router.post('/clear', async (req, res) => {
    const { password, roomId } = req.body;
    const clientId = req.clientId;

    if (!clientId) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    if (!(await checkRateLimitMs(redisClient, KEYS.rateClear(clientId), 30000))) {
      emitUserToast(clientId, '削除操作は30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    if (password !== adminPass) {
      await safeLogAction({ user: clientId, action: 'InvalidAdminPassword', extra: { roomId } });
      emitUserToast(clientId, '管理者パスワードが正しくありません');
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