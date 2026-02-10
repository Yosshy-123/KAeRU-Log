'use strict';

const express = require('express');

const KEYS = require('../lib/redisKeys');
const { pushAndTrimList } = require('../lib/redisHelpers');
const createSpamService = require('../services/spamService');

const { escapeHTML } = require('../utils/sanitize');
const { formatJST } = require('../utils/time');

function createApiMessagesRouter({ redisClient, io, safeLogAction, emitUserToast }) {
  const router = express.Router();
  const spamService = createSpamService(redisClient, safeLogAction, KEYS);

  // GET /api/messages/:roomId
  router.get('/messages/:roomId([a-zA-Z0-9_-]{1,32})', async (req, res) => {
    const roomId = req.params.roomId;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

    const rawMessages = await redisClient.lrange(KEYS.messages(roomId), 0, -1);
    const messages = rawMessages
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json(
      messages.map(({ username, message, time, seed, admin }) => {
        const out = { username, message, time, seed };
        if (admin === true) out.admin = true;
        return out;
      })
    );
  });

  // POST /api/messages
  router.post('/messages', async (req, res) => {
    const { message, seed, roomId } = req.body;

    if (!roomId || !message || !seed) return res.sendStatus(400);
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);
    if (typeof message !== 'string' || message.length === 0 || message.length > 300) return res.sendStatus(400);

    const clientId = req.clientId;
    if (!clientId) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    const username = await redisClient.get(KEYS.username(clientId));
    if (!username) return res.status(400).json({ error: 'Username not set' });

    const spamResult = await spamService.check(clientId, message);

    if (spamResult.rejected) {
      if (spamResult.muted) {
        emitUserToast(
          clientId,
          spamResult.muteSec
            ? `スパムを検知したため${spamResult.muteSec}秒間ミュートされました`
            : '送信が制限されています'
        );
      }

      await safeLogAction({
        user: clientId,
        action: 'sendMessageRejected',
        extra: { reason: spamResult.reason || 'rate-limit' },
      });

      return res.sendStatus(429);
    }

    if (spamResult.muted) {
      emitUserToast(clientId, `スパムを検知したため${spamResult.muteSec}秒間ミュートされました`);

      await safeLogAction({
        user: clientId,
        action: 'sendMessageBlocked',
        extra: { reason: spamResult.reason || 'spam' },
      });

      return res.sendStatus(429);
    }

    // --- admin判定 ---
    let isAdmin = false;
    try {
      const token = req.token;
      if (token) {
        const adminOwnerClientId = await redisClient.get(KEYS.adminSession(token));
        if (adminOwnerClientId && adminOwnerClientId === clientId) {
          isAdmin = true;
        }
      }
    } catch (err) {
      await safeLogAction({ user: clientId, action: 'adminCheckError', extra: { message: err.message } });
    }

    const storedMessage = {
      username,
      message: escapeHTML(message),
      time: formatJST(new Date()),
      seed,
    };

    if (isAdmin) {
      storedMessage.admin = true;
    }

    await pushAndTrimList(redisClient, KEYS.messages(roomId), JSON.stringify(storedMessage), 100);

    io.to(roomId).emit('newMessage', storedMessage);

    await safeLogAction({
      user: clientId,
      action: isAdmin ? 'sendMessageAdmin' : 'sendMessage',
      extra: { roomId, message: storedMessage.message },
    });

    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiMessagesRouter;
