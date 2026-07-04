'use strict';

const path = require('path');
const express = require('express');

const createCorsMiddleware = require('./lib/cors');
const securityHeaders = require('./securityHeaders');
const createApiAuthRouter = require('./routes/apiAuth');
const createApiMessagesRouter = require('./routes/apiMessages');
const createApiUsernameRouter = require('./routes/apiUsername');
const createApiAdminRouter = require('./routes/apiAdmin');
const KEYS = require('./lib/redisKeys');
const { validateAuthToken } = require('./auth');
const { getAuthTokenFromRequest } = require('./lib/authCookie');
const { sendAuthError } = require('./lib/requestAuth');
const { isTrustProxyEnabled } = require('./utils/trustProxy');
const { createToastEmitters } = require('./lib/toast');

const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

function createRequireSocketSession(redisClient) {
  return async function requireSocketSession(req, res, next) {
    const token = getAuthTokenFromRequest(req);

    if (!token) {
      return sendAuthError(res, 401);
    }

    try {
      const clientId = await validateAuthToken(redisClient, token);

      if (!clientId) {
        return sendAuthError(res, 403, 'token_expired');
      }

      req.clientId = clientId;
      req.token = token;
      return next();
    } catch (err) {
      console.error('requireSocketSession failed', err);
      return res.status(500).json({ error: 'Server error', code: 'server_error' });
    }
  };
}

function mountApiRoutes(app, { redisClient, io, adminPass, frontendUrl }) {
  const requireSocketSession = createRequireSocketSession(redisClient);
  const { emitUserToast, emitRoomToast } = createToastEmitters(io, {
    userRoom: KEYS.userRoom,
  });

  app.use(
    '/api',
    createApiAuthRouter({
      redisClient,
      frontendUrl,
    })
  );

  const apiRouter = express.Router();
  apiRouter.use(requireSocketSession);

  apiRouter.use(
    createApiMessagesRouter({
      redisClient,
      io,
      emitUserToast,
    })
  );

  apiRouter.use(
    createApiUsernameRouter({
      redisClient,
      emitUserToast,
    })
  );

  apiRouter.use(
    '/admin',
    createApiAdminRouter({
      redisClient,
      io,
      emitUserToast,
      emitRoomToast,
      adminPass,
    })
  );

  app.use('/api', apiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' });
  });
}

function createErrorHandler() {
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    const status = Number.isInteger(err?.status) ? err.status : 500;
    const code = typeof err?.code === 'string' ? err.code : 'server_error';
    const message = status >= 500 ? 'Internal Server Error' : 'Request failed';

    return res.status(status).json({ error: message, code });
  };
}

function createApp({ redisClient, io, adminPass, frontendUrl }) {
  if (!redisClient) throw new Error('redisClient is required');
  if (!io) throw new Error('io is required');
  if (!adminPass) throw new Error('adminPass is required');
  if (!frontendUrl) throw new Error('frontendUrl is required');

  const app = express();
  const trustProxy = isTrustProxyEnabled(process.env.TRUST_PROXY);

  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(createCorsMiddleware(frontendUrl));
  app.use(securityHeaders({ frontendUrl }));

  mountApiRoutes(app, { redisClient, io, adminPass, frontendUrl });

  app.use(express.static(PUBLIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(INDEX_FILE);
  });
  app.use(createErrorHandler());

  return app;
}

module.exports = createApp;
