'use strict';

const express = require('express');
const cors = require('cors');
const validator = require('validator');
const winston = require('winston');

const securityHeaders = require('./securityHeaders');
const createApiAuthRouter = require('./routes/apiAuth');
const createApiMessagesRouter = require('./routes/apiMessages');
const createApiUsernameRouter = require('./routes/apiUsername');
const createApiAdminRouter = require('./routes/apiAdmin');

const { validateAuthToken } = require('./auth');
const rawLogAction = require('./utils/logger');
const KEYS = require('./lib/redisKeys');

function createRequireSocketSession(redisClient, safeLogAction) {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      await safeLogAction({ user: null, action: 'invalidRestToken' });
      return res.status(401).json({ error: 'Authentication required', code: 'no_token' });
    }

    let clientId;
    try {
      clientId = await validateAuthToken(redisClient, token);
    } catch (err) {
      await safeLogAction({ user: null, action: 'validateTokenError', extra: { error: err.message } });
      return res.status(500).json({ error: 'Server error', code: 'server_error' });
    }

    if (!clientId) {
      await safeLogAction({ user: null, action: 'invalidRestToken', extra: { token } });
      return res.status(403).json({ error: 'Invalid or expired token', code: 'token_expired' });
    }

    req.clientId = clientId;
    req.token = token;
    next();
  };
}

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
  app.set('trust proxy', true);

  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));

  app.use(
    cors({
      origin: frontendUrl,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    })
  );

  app.use(securityHeaders(frontendUrl));

  async function safeLogAction(payload) {
    try {
      await rawLogAction(redisClient, payload);
    } catch (err) {
      console.error('[safeLogAction] log failed', err);
    }
  }

  const { emitUserToast, emitRoomToast } = createToastEmitters(io);

  app.use('/api', createApiAuthRouter({ redisClient, safeLogAction }));

  const requireSocketSession = createRequireSocketSession(redisClient, safeLogAction);

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

  app.use(
    '/api',
    requireSocketSession,
    createApiUsernameRouter({
      redisClient,
      safeLogAction,
      emitUserToast,
    })
  );

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

  app.use(express.static(`${__dirname}/public`));

  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    res.sendFile(`${__dirname}/public/index.html`, (err) => {
      if (err) return next(err);
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return;

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ error: message, code: err.code || 'server_error' });
  });

  return app;
}

module.exports = createApp;
