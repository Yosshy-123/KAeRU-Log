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

/**
 * Create middleware to require authenticated socket session
 * Validates Bearer token from Authorization header
 * @param {Object} redisClient - Redis client instance
 * @param {Function} safeLogAction - Safe logging function
 * @returns {Function} Express middleware
 */
function createRequireSocketSession(redisClient, safeLogAction) {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      await safeLogAction({ user: null, action: 'invalidRestToken' });
      return res.status(401).json({ 
        error: 'Authentication required', 
        code: 'no_token' 
      });
    }

    let clientId;
    try {
      clientId = await validateAuthToken(redisClient, token);
    } catch (err) {
      await safeLogAction({ 
        user: null, 
        action: 'validateTokenError', 
        extra: { error: err.message } 
      });
      return res.status(500).json({ 
        error: 'Server error', 
        code: 'server_error' 
      });
    }

    if (!clientId) {
      await safeLogAction({ 
        user: null, 
        action: 'invalidRestToken', 
        extra: { token } 
      });
      return res.status(403).json({ 
        error: 'Invalid or expired token', 
        code: 'token_expired' 
      });
    }

    req.clientId = clientId;
    req.token = token;
    next();
  };
}

/**
 * Create Express application with all routes and middleware configured
 * @param {Object} config - Configuration object
 * @param {Object} config.redisClient - Redis client instance
 * @param {Object} config.io - Socket.IO instance
 * @param {string} config.adminPass - Admin password
 * @param {string} config.frontendUrl - Frontend URL for CORS
 * @returns {express.Application} Configured Express app
 */
function createApp({ redisClient, io, adminPass, frontendUrl }) {
  const app = express();

  // Trust proxy for X-Forwarded-* headers (important for Render.com)
  app.set('trust proxy', true);
  
  // Disable X-Powered-By header for security
  app.disable('x-powered-by');

  // Middleware: Body parser
  app.use(express.json({ limit: '100kb' }));

  // Middleware: CORS
  app.use(
    cors({
      origin: frontendUrl,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    })
  );

  // Middleware: Security headers
  app.use(securityHeaders(frontendUrl));

  /**
   * Safe logging wrapper
   * Catches errors in logging to prevent cascading failures
   */
  async function safeLogAction(payload) {
    try {
      await rawLogAction(redisClient, payload);
    } catch (err) {
      console.error('[safeLogAction] log failed', err);
    }
  }

  // Middleware: Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  const requireSocketSession = createRequireSocketSession(redisClient, safeLogAction);

  // Routes: Authentication (public)
  app.use('/api/auth', createApiAuthRouter({ redisClient, safeLogAction }));

  // Middleware: Require session for all other API routes
  app.use('/api', requireSocketSession);

  // Routes: Messages
  app.use(
    '/api',
    createApiMessagesRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast: () => {},
    })
  );

  // Routes: Username
  app.use(
    '/api',
    createApiUsernameRouter({
      redisClient,
      safeLogAction,
      emitUserToast: () => {},
    })
  );

  // Routes: Admin
  app.use(
    '/api/admin',
    createApiAdminRouter({
      redisClient,
      io,
      safeLogAction,
      emitUserToast: () => {},
      emitRoomToast: () => {},
      adminPass,
    })
  );

  // Middleware: Static files
  app.use(express.static(`${__dirname}/public`));

  // Route: Catch-all for SPA
  // Serve index.html for all non-API routes to enable client-side routing
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    res.sendFile(`${__dirname}/public/index.html`, (err) => {
      if (err && err.code !== 'EISDIR') {
        next(err);
      }
    });
  });

  // Middleware: 404 handler (must come before error handler)
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      code: 'not_found',
      path: req.path,
      method: req.method
    });
  });

  /**
   * Error handling middleware
   * Catches all errors from routes and middleware
   * Must be defined after all other middleware and routes
   */
  app.use((err, req, res, next) => {
    // Already sent response, pass to next handler
    if (res.headersSent) {
      return next(err);
    }

    // Extract error information
    const status = err.status || err.statusCode || 500;
    const errorCode = err.code || 'internal_error';
    
    // Message: different for development
    let message = err.message || 'Internal Server Error';
    if (status === 500) {
      message = 'Internal Server Error';
    }

    // Log the error
    console.error('Error:', {
      status,
      message,
      code: errorCode,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // Attempt to log to Redis (non-blocking)
    safeLogAction({
      user: req.clientId || null,
      action: 'serverError',
      extra: {
        status,
        code: errorCode,
        message,
        path: req.path,
        method: req.method
      }
    }).catch(e => {
      console.error('Failed to log error to Redis:', e);
    });

    // Send error response
    res.status(status).json({
      error: message,
      code: errorCode
    });
  });

  return app;
}

module.exports = createApp;