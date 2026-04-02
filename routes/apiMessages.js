'use strict';

const express = require('express');
const validator = require('validator');

const KEYS = require('../lib/redisKeys');
const { pushAndTrimList } = require('../lib/redisHelpers');
const createSpamService = require('../services/spamService');

const { formatJST } = require('../utils/time');

function createApiMessagesRouter({ redisClient, io, emitUserToast }) {
  const router = express.Router();
  const spamService = createSpamService(redisClient, KEYS);

  router.get('/messages/:roomId([a-zA-Z0-9_-]{1,32})', async (req, res) => {
    const roomId = req.params.roomId;
    if (!validator.matches(roomId, /^[a-zA-Z0-9_-]{1,32}$/)) return res.sendStatus(400);

    try {
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
        messages.map(({ username, message, time, admin }) => {
          const out = { username, message, time };
          if (admin === true) out.admin = true;
          return out;
        })
      );
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/messages', async (req, res) => {
    const { message, roomId } = req.body;

    if (!roomId || !message) return res.sendStatus(400);
    if (!validator.matches(roomId, /^[a-zA-Z0-9_-]{1,32}$/)) return res.sendStatus(400);
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

      return res.sendStatus(429);
    }

    if (spamResult.muted) {
      emitUserToast(clientId, `スパムを検知したため${spamResult.muteSec}秒間ミュートされました`);

      return res.sendStatus(429);
    }

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
      return res.status(500).json({ error: 'Server error' });
    }

    const storedMessage = {
      username,
      message,
      time: formatJST(new Date()),
    };

    if (isAdmin) {
      storedMessage.admin = true;
    }

    const maxMessages = roomId === 'general' ? 300 : 100;
    await pushAndTrimList(redisClient, KEYS.messages(roomId), JSON.stringify(storedMessage), maxMessages);

    io.to(roomId).emit('newMessage', storedMessage);

    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiMessagesRouter;
