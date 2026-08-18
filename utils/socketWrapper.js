'use strict';

const logger = require('../lib/logger');

module.exports = function createWrapperFactory({ safeEmitSocket } = {}) {
  return function wrapperFactory(socket) {
    return function wrap(handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('socket handler must be a function');
      }

      return async (...args) => {
        try {
          await handler(socket, ...args);
        } catch (err) {
          try {
            logger.error('socket.error', { phase: 'handler', errorType: err?.name });
          } catch {
            // ignore logger failure
          }

          try {
            safeEmitSocket?.(socket, 'error', { code: 'internal_error' });
          } catch (emitErr) {
            logger.error('socket.error', { phase: 'emit_error', errorType: emitErr?.name });
          }
        }
      };
    };
  };
};
