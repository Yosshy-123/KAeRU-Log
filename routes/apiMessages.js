'use strict';

const express = require('express');

const createMessageService = require('../services/messageService');
const { classifyTextInput, isValidRoomId, isValidMessage, normalizeMessage } = require('../lib/validation');

function readRoomId(req) {
  return typeof req.params?.roomId === 'string' ? req.params.roomId.trim() : '';
}

function readMessage(req) {
  return normalizeMessage(req.body?.message);
}

function createSpamToastMessage(spamResult) {
  if (!spamResult) {
    return null;
  }

  if (spamResult.muted && spamResult.muteSec) {
    return `スパムを検知したため${spamResult.muteSec}秒間ミュートされています`;
  }

  if (spamResult.reason === 'rate-limit') {
    return '送信間隔が短すぎます';
  }

  if (spamResult.reason === 'error') {
    return '送信が制限されています';
  }

  return '送信が制限されています';
}

function createApiMessagesRouter({ redisClient, io, emitUserToast }) {
  const router = express.Router();
  const messageService = createMessageService({ redisClient, io });

  router.get('/messages/:roomId', async (req, res) => {
    const roomId = readRoomId(req);
    if (!isValidRoomId(roomId)) {
      return res.sendStatus(400);
    }

    const messages = await messageService.getHistory(roomId);
    return res.json(messages);
  });

  router.post('/messages/:roomId', async (req, res) => {
    const roomId = readRoomId(req);
    const messageInputType = classifyTextInput(req.body?.message);
    const message = readMessage(req);

    if (!isValidRoomId(roomId)) {
      return res.sendStatus(400);
    }

    // invalid_type / empty / missing / over-length all keep the same client response.
    if (messageInputType === 'invalid_type' || !isValidMessage(message)) {
      emitUserToast(typeof req.clientId === 'string' ? req.clientId : '', 'メッセージは1〜300文字で入力してください', {
        tone: 'warning',
      });
      return res.sendStatus(400);
    }

    const clientId = typeof req.clientId === 'string' ? req.clientId : '';
    if (!clientId) {
      return res.status(403).json({ error: 'Authentication required', code: 'no_token' });
    }

    const result = await messageService.sendMessage({
      clientId,
      token: typeof req.token === 'string' ? req.token : '',
      roomId,
      message,
      ip: req.ip,
    });

    if (result.rejected) {
      emitUserToast(clientId, createSpamToastMessage(result.spamResult), { tone: 'warning' });
      return res.sendStatus(429);
    }

    return res.json({ ok: true });
  });

  return router;
}

module.exports = createApiMessagesRouter;
