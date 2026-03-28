'use strict';

const express = require('express');
const crypto = require('crypto');

const KEYS = require('../lib/redisKeys');
const { checkRateLimitMs } = require('../utils/rateLimitUtils');

/**
 * createApiAdminRouter options:
 *  - redisClient
 *  - emitUserToast(clientId, message)
 *  - adminPass (string)
 */
function createApiAdminRouter({ redisClient, emitUserToast, adminPass }) {
  const router = express.Router();

  // timing-safe string comparison
  function safeCompareStrings(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      // perform a timingSafeEqual against a pad to avoid leaking length via timing
      const pad = Buffer.alloc(Math.max(bufA.length, bufB.length), 0);
      try { crypto.timingSafeEqual(bufA, pad); } catch (e) { /* ignore */ }
      return false;
    }
    try {
      return crypto.timingSafeEqual(bufA, bufB);
    } catch (e) {
      return false;
    }
  }

  // admin login failure tracking: when too many failures, block for a while
  async function recordFailedLogin(clientId) {
    try {
      const key = `admin:login_fail:${clientId}`;
      const failures = await redisClient.incr(key);
      if (failures === 1) {
        // set expiry for the failure window (e.g., 15 minutes)
        await redisClient.expire(key, 15 * 60);
      }
      return failures;
    } catch (e) {
      return null;
    }
  }

  async function clearFailedLogin(clientId) {
    try {
      const key = `admin:login_fail:${clientId}`;
      await redisClient.del(key);
    } catch (e) {
      // ignore
    }
  }

  router.post('/login', async (req, res) => {
    const { password } = req.body;
    const clientId = req.clientId;
    const token = req.token;

    if (!clientId || !token) return res.status(403).json({ error: 'Authentication required', code: 'no_token' });

    // global rate-limit guard (30s) to slow down repeated attempts
    if (!(await checkRateLimitMs(redisClient, KEYS.rateAdminLogin(clientId), 30000))) {
      emitUserToast(clientId, 'ログイン操作には30秒以上間隔をあけてください');
      return res.sendStatus(429);
    }

    // check recent failure count
    const failKey = `admin:login_fail:${clientId}`;
    const fails = Number(await redisClient.get(failKey) || 0);
    if (fails >= 5) {
      emitUserToast(clientId, '管理者ログイン試行が多すぎます。後でお試しください。');
      return res.sendStatus(429);
    }

    // timing-safe comparison
    if (!safeCompareStrings(password || '', adminPass || '')) {
      emitUserToast(clientId, '管理者パスワードが正しくありません');
      await recordFailedLogin(clientId);
      return res.sendStatus(403);
    }

    // password ok -> clear failure counter
    await clearFailedLogin(clientId);

    // token TTL check
    let tokenTtlSec = 0;
    try {
      tokenTtlSec = await redisClient.ttl(KEYS.token(token));
    } catch (e) {
      tokenTtlSec = -1;
    }

    if (tokenTtlSec <= 0) {
      return res.status(403).json({ error: 'Invalid token TTL', code: 'invalid_token_ttl' });
    }

    await redisClient.set(KEYS.adminSession(token), clientId, 'EX', tokenTtlSec);

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
      emitUserToast(clientId, '管理者セッションがありません');
      return res.sendStatus(403);
    }

    if (adminOwnerClientId !== clientId) {
      emitUserToast(clientId, '管理者セッションが一致しません');
      return res.sendStatus(403);
    }

    await redisClient.del(KEYS.adminSession(token));

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
      emitUserToast(clientId, '管理者ログインが必要です');
      return res.sendStatus(403);
    }

    if (adminOwnerClientId !== clientId) {
      emitUserToast(clientId, '管理者ログインが一致しません');
      return res.sendStatus(403);
    }

    try {
      // clear messages for room
      await redisClient.del(KEYS.messages(roomId));
      // notify clients (if application has io)
      if (typeof req.app !== 'undefined' && req.app.get && req.app.get('io')) {
        const io = req.app.get('io');
        io.to(roomId).emit('clearMessages');
      }
      emitUserToast(clientId, 'メッセージをクリアしました');
      res.json({ ok: true });
    } catch (err) {
      console.error('admin clear error', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createApiAdminRouter;