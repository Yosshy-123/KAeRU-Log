'use strict';

const cors = require('cors');
const { normalizeOrigin } = require('./origin');

const DEFAULT_METHODS = ['GET', 'POST', 'OPTIONS'];

function createCorsMiddleware(frontendUrl) {
  const origin = normalizeOrigin(frontendUrl);
  if (!origin) {
    throw new Error('frontendUrl must be a valid http(s) origin');
  }

  return cors({
    origin,
    methods: DEFAULT_METHODS,
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
    maxAge: 600,
  });
}

module.exports = createCorsMiddleware;
