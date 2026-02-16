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

function createApp({ redisClient, io, adminPass, frontendUrl }) {
  const app = express();

  app.set('trust proxy', true); // Render などのリバースプロキシ環境用

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

  const requireSocketSession = createRequireSocketSession(redisClient, safeLogAction);

  app.use('/api/auth', createApiAuthRouter({ redisClient, safeLogAction }));

  const apiRouter = express.Router();

  apiRouter.use(requireSocketSession);

  apiRouter.use(
    createApiMessagesRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast: () => {},
    })
  );

  apiRouter.use(
    createApiUsernameRouter({
      redisClient,
      safeLogAction,
      emitUserToast: () => {},
    })
  );

  apiRouter.use(
    '/admin',
    createApiAdminRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast: () => {},
      emitRoomToast: () => {},
      adminPass,
    })
  );

  app.use('/api', apiRouter);

  app.use(express.static(`${__dirname}/public`));

  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    res.sendFile(`${__dirname}/public/index.html`, (err) => {
      if (err) return next(err);
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ error: message, code: err.code || 'server_error' });
  });

  return app;
}

module.exports = createApp;