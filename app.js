'use strict';

const path = require('path');
const express = require('express');

const securityHeaders = require('./securityHeaders');
const createApiAuthRouter = require('./routes/apiAuth');
const createApiMessagesRouter = require('./routes/apiMessages');
const createApiUsernameRouter = require('./routes/apiUsername');
const createApiAdminRouter = require('./routes/apiAdmin');
const KEYS = require('./lib/redisKeys');
const { validateAuthToken } = require('./auth');
const { getAuthTokenFromRequest, sendAuthError } = require('./lib/requestAuth');
const { isTrustProxyEnabled } = require('./utils/trustProxy');
const { createToastEmitters } = require('./lib/toast');
const config = require('./config');

const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

function createRequireSocketSession(redisClient) {
  return async function requireSocketSession(req, res, next) {
    const token = getAuthTokenFromRequest(req);

    if (!token) {
      return sendAuthError(res, 401);
    }

    const clientId = await validateAuthToken(redisClient, token);

    if (!clientId) {
      return sendAuthError(res, 403, 'token_expired');
    }

    req.clientId = clientId;
    req.token = token;
    return next();

  };
}

function mountApiRoutes(app, { redisClient, io, adminPass, httpsEnabled }) {
  const requireSocketSession = createRequireSocketSession(redisClient);
  const { emitUserToast, emitRoomToast } = createToastEmitters(io, {
    userRoom: KEYS.userRoom,
  });

  app.use(
    '/api',
    createApiAuthRouter({
      redisClient,
      httpsEnabled,
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

const { createErrorHandler, PUBLIC_ERROR_CODES } = require('./lib/errorHandler');

function createApp({ redisClient, io, adminPass, httpsEnabled }) {
  if (!redisClient) throw new Error('redisClient is required');
  if (!io) throw new Error('io is required');
  if (!adminPass) throw new Error('adminPass is required');

  const app = express();
  const trustProxy = isTrustProxyEnabled(process.env.TRUST_PROXY);

  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(express.json({ limit: config.http.jsonBodyLimit }));
  app.use(securityHeaders({ httpsEnabled }));

  mountApiRoutes(app, { redisClient, io, adminPass, httpsEnabled });

  app.use(express.static(PUBLIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(INDEX_FILE);
  });
  app.use(createErrorHandler());

  return app;
}

module.exports = createApp;
module.exports.createErrorHandler = createErrorHandler;
module.exports.PUBLIC_ERROR_CODES = PUBLIC_ERROR_CODES;
