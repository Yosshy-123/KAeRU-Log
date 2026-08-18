'use strict';

const logger = require('./logger');

/** Codes allowed to carry an explicit public message to clients. */
const PUBLIC_ERROR_CODES = new Set([
  'validation_error',
  'invalid_username',
  'invalid_message',
  'invalid_room',
  'unauthorized',
  'no_token',
  'token_expired',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
]);

function createErrorHandler() {
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    const status = Number.isInteger(err?.status) ? err.status : 500;
    const code = typeof err?.code === 'string' && err.code ? err.code : 'server_error';

    // Only known public codes may expose err.publicMessage.
    // Raw Error.message is never sent for unknown or server errors.
    let message;
    if (status >= 500) {
      message = 'Server error';
    } else if (PUBLIC_ERROR_CODES.has(code) && typeof err?.publicMessage === 'string' && err.publicMessage) {
      message = err.publicMessage;
    } else if (status >= 400 && status < 500) {
      message = 'Request failed';
    } else {
      message = 'Server error';
    }

    if (status >= 500 || !PUBLIC_ERROR_CODES.has(code)) {
      logger.error(status >= 500 ? 'http.internal_error' : 'http.client_error', {
        method: req?.method,
        path: req?.originalUrl || req?.url,
        status,
        code,
        errorType: err?.name,
        errorMessage: typeof err?.message === 'string' ? err.message.slice(0, 200) : undefined,
      });
    }

    return res.status(status).json({ error: message, code });
  };
}

module.exports = {
  createErrorHandler,
  PUBLIC_ERROR_CODES,
};
