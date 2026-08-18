'use strict';

const crypto = require('crypto');
const express = require('express');

const KEYS = require('../lib/redisKeys');
const { requireRequestAuthContext } = require('../lib/requestAuth');
const { isValidRoomId } = require('../lib/validation');
const createAdminLoginDefense = require('../lib/adminLoginDefense');
const { hashIp } = require('../lib/ip');
const config = require('../config');
const createMessageService = require('../services/messageService');

function constantTimeEquals(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function buildAdminScopes(clientId, ip) {
  return [clientId, hashIp(ip)].filter((value) => typeof value === 'string' && value.trim());
}

function createApiAdminRouter({ redisClient, io, emitUserToast, emitRoomToast, adminPass }) {
  const router = express.Router();
  const messageService = createMessageService({ redisClient, io });
  const loginDefense = createAdminLoginDefense(redisClient, KEYS, {
    threshold: config.admin.failureThreshold,
    failureWindowMs: config.admin.failureWindowMs,
    lockoutMs: config.admin.lockoutMs,
    maxLockoutMs: config.admin.maxLockoutMs,
  });

  async function readAdminOwner(token) {
    return redisClient.get(KEYS.adminSession(token));
  }

  async function requireAdminSession(context, res, clientIdMessage) {
    const { clientId, token } = context;
    const adminOwnerClientId = await readAdminOwner(token);

    if (!adminOwnerClientId) {
      emitUserToast(clientId, clientIdMessage || '管理者ログインが必要です', { tone: 'warning' });
      res.sendStatus(403);
      return null;
    }

    if (adminOwnerClientId !== clientId) {
      emitUserToast(clientId, '管理者セッションが一致しません', { tone: 'warning' });
      res.sendStatus(403);
      return null;
    }

    return adminOwnerClientId;
  }

  router.post('/login', async (req, res) => {
    const context = requireRequestAuthContext(req, res);
    if (!context) {
      return;
    }

    const { clientId, token } = context;
    const ip = typeof req.ip === 'string' && req.ip ? req.ip : '0.0.0.0';
    const scopes = buildAdminScopes(clientId, ip);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    for (const scope of scopes) {
      const remainingMs = await loginDefense.getLockRemainingMs(scope);
      if (remainingMs > 0) {
        emitUserToast(clientId, '管理者ログインは一時的に制限されています', { tone: 'warning' });
        return res.sendStatus(429);
      }
    }

    if (!constantTimeEquals(password, adminPass)) {
      const results = await Promise.all(scopes.map((scope) => loginDefense.recordFailure(scope)));
      const locked = results.some((result) => result.locked);

      if (locked) {
        emitUserToast(clientId, '管理者ログイン試行が多すぎます。しばらくしてから再試行してください', {
          tone: 'warning',
        });
        return res.sendStatus(429);
      }

      emitUserToast(clientId, '管理者パスワードが正しくありません', { tone: 'error' });
      return res.sendStatus(403);
    }

    await Promise.all(scopes.map((scope) => loginDefense.reset(scope)));

    const tokenTtlSec = await redisClient.ttl(KEYS.token(token));
    if (!Number.isFinite(tokenTtlSec) || tokenTtlSec <= 0) {
      return res.status(403).json({ error: 'Invalid token TTL', code: 'invalid_token_ttl' });
    }

    await redisClient.set(KEYS.adminSession(token), clientId, 'EX', tokenTtlSec);
    emitUserToast(clientId, '管理者としてログインしました', { tone: 'success' });
    return res.json({ ok: true, admin: true });

  });

  router.get('/status', async (req, res) => {
    const context = requireRequestAuthContext(req, res);
    if (!context) {
      return;
    }

    const { clientId, token } = context;
    const adminOwnerClientId = await readAdminOwner(token);
    return res.json({ admin: adminOwnerClientId === clientId });

  });

  router.post('/logout', async (req, res) => {
    const context = requireRequestAuthContext(req, res);
    if (!context) {
      return;
    }

    const { clientId, token } = context;
    const adminOwnerClientId = await readAdminOwner(token);

    if (!adminOwnerClientId) {
      emitUserToast(clientId, '管理者セッションがありません', { tone: 'warning' });
      return res.sendStatus(403);
    }

    if (adminOwnerClientId !== clientId) {
      emitUserToast(clientId, '管理者セッションが一致しません', { tone: 'warning' });
      return res.sendStatus(403);
    }

    await redisClient.del(KEYS.adminSession(token));
    emitUserToast(clientId, '管理者ログアウトしました', { tone: 'success' });

    return res.json({ ok: true });

  });

  router.post('/clear/:roomId', async (req, res) => {
    const context = requireRequestAuthContext(req, res);
    if (!context) {
      return;
    }

    const roomId = typeof req.params.roomId === 'string' ? req.params.roomId.trim() : '';

    if (!isValidRoomId(roomId)) {
      return res.sendStatus(400);
    }

    const adminOwnerClientId = await requireAdminSession(context, res, '管理者ログインが必要です');
    if (!adminOwnerClientId) {
      return;
    }

    await messageService.clearRoom(roomId);

    emitRoomToast(roomId, '全メッセージ削除されました', { tone: 'success' });

    return res.json({ ok: true });

  });

  return router;
}

module.exports = createApiAdminRouter;
