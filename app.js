'use strict';

const express = require('express');
const cors = require('cors');

const securityHeaders = require('./securityHeaders');
const createApiAuthRouter = require('./routes/apiAuth');
const createApiMessagesRouter = require('./routes/apiMessages');
const createApiUsernameRouter = require('./routes/apiUsername');
const createApiAdminRouter = require('./routes/apiAdmin');

const { validateAuthToken } = require('./auth');
const rawLogAction = require('./utils/logger');
const KEYS = require('./lib/redisKeys');

// -------------------- async handler --------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// -------------------- REST セッション用ミドルウェア --------------------
function createRequireSocketSession(redisClient, safeLogAction) {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      await safeLogAction({ user: null, action: 'invalidRestToken' });
      return res.status(401).json({ error: 'Authentication required', code: 'no_token' });
    }

    const clientId = await validateAuthToken(redisClient, token);

    if (!clientId) {
      await safeLogAction({ user: null, action: 'invalidRestToken', extra: { token } });
      return res.status(403).json({ error: 'Invalid or expired token', code: 'token_expired' });
    }

    req.clientId = clientId;
    req.token = token;

    next();
  };
}

// -------------------- Toast helpers --------------------
function createToastEmitters(io) {
  function emitUserToast(clientId, message) {
    const roomName = KEYS.userRoom(clientId);
    const room = io.sockets.adapter.rooms.get(roomName);
    if (!room || room.size === 0) return;

    io.to(roomName).emit('toast', { scope: 'user', message, time: Date.now() });
  }

  function emitRoomToast(roomId, message) {
    if (!roomId) return;

    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room || room.size === 0) return;

    io.to(roomId).emit('toast', { scope: 'room', message, time: Date.now() });
  }

  return { emitUserToast, emitRoomToast };
}

function createApp({ redisClient, io, adminPass, frontendUrl }) {
  const app = express();

  // Render などのリバースプロキシ環境用
  app.set('trust proxy', 2);

  app.use(express.json({ limit: '100kb' }));

  // CORS
  app.use(
    cors({
      origin: frontendUrl,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    })
  );

  // セキュリティヘッダ
  app.use(securityHeaders(frontendUrl));

  // safe logger
  async function safeLogAction(payload) {
    try {
      await rawLogAction(redisClient, payload);
    } catch (err) {
      console.error('[safeLogAction] log failed', err);
    }
  }

  const { emitUserToast, emitRoomToast } = createToastEmitters(io);

  // -------------------- Routes --------------------
  // auth (token不要)
  app.use('/api', createApiAuthRouter({ redisClient, safeLogAction }));

  // token必須 middleware
  const requireSocketSession = createRequireSocketSession(redisClient, safeLogAction);

  // messages
  app.use(
    '/api',
    requireSocketSession,
    createApiMessagesRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast,
    })
  );

  // username
  app.use(
    '/api',
    requireSocketSession,
    createApiUsernameRouter({
      redisClient,
      safeLogAction,
      emitUserToast,
    })
  );

  // admin
  app.use(
    '/api/admin',
    requireSocketSession,
    createApiAdminRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast,
      emitRoomToast,
      adminPass,
    })
  );

  // -------------------- SPA fallback / static --------------------
  app.use(express.static(`${__dirname}/public`));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(`${__dirname}/public/index.html`);
  });

  // -------------------- Error handler --------------------
  app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Error:`, err);

    if (res.headersSent) return;

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ error: message, code: err.code || 'server_error' });
  });

  return app;
}

module.exports = createApp;
