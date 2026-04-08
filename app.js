'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');

const securityHeaders = require('./securityHeaders');
const createApiAuthRouter = require('./routes/apiAuth');
const createApiMessagesRouter = require('./routes/apiMessages');
const createApiUsernameRouter = require('./routes/apiUsername');
const createApiAdminRouter = require('./routes/apiAdmin');
const { validateAuthToken } = require('./auth');
const { isTrustProxyEnabled } = require('./utils/trustProxy');

const PUBLIC_DIR = path.join(__dirname, 'public');

function extractBearerToken(authorizationHeader) {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (typeof header !== 'string') return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token || null;
}

function createRequireSocketSession(redisClient) {
  return async function requireSocketSession(req, res, next) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'no_token' });
    }

    try {
      const clientId = await validateAuthToken(redisClient, token);
      if (!clientId) {
        return res.status(403).json({ error: 'Invalid or expired token', code: 'token_expired' });
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

function createApiRouter({ redisClient, io, adminPass }) {
  const router = express.Router();
  const requireSocketSession = createRequireSocketSession(redisClient);

  router.use(requireSocketSession);
  router.use(createApiMessagesRouter({ redisClient, io, emitUserToast: () => {} }));
  router.use(createApiUsernameRouter({ redisClient, emitUserToast: () => {} }));
  router.use(
    '/admin',
    createApiAdminRouter({
      redisClient,
      io,
      emitUserToast: () => {},
      emitRoomToast: () => {},
      adminPass,
    })
  );

  return router;
}

function createErrorHandler() {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const status = Number.isInteger(err?.status) ? err.status : 500;
    const code = typeof err?.code === 'string' ? err.code : 'server_error';
    const message = status >= 500 ? 'Internal Server Error' : err?.message || 'Error';

    return res.status(status).json({ error: message, code });
  };
}

function createApp({ redisClient, io, adminPass, frontendUrl }) {
  const app = express();
  app.set('trust proxy', isTrustProxyEnabled(process.env.TRUST_PROXY));
  app.disable('x-powered-by');

  app.use(express.json({ limit: '64kb' }));
  app.use(
    cors({
      origin: frontendUrl,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    })
  );
  app.use(securityHeaders(frontendUrl));

  app.use('/api/auth', createApiAuthRouter({ redisClient }));
  app.use('/api', createApiRouter({ redisClient, io, adminPass }));

  app.use(express.static(PUBLIC_DIR, { etag: true, maxAge: '1h' }));

  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use(createErrorHandler());

  return app;
}

module.exports = createApp;
