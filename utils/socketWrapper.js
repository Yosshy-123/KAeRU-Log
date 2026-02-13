module.exports = function createWrapperFactory({ redisClient, io, log, safeEmitSocket }) {
  if (!log) {
    log = async (payload) => {
      try { console.error('[socketWrapper] missing logger, payload:', payload); } catch {}
    };
  }

  return function wrapperFactory(socket) {
    return function wrap(handler) {
      return async (...args) => {
        try {
          await handler(socket, ...args);
        } catch (err) {
          try {
            await log({ user: socket?.data?.clientId || '-', action: 'socketHandlerError', extra: { message: err.message } });
          } catch (e) {
            try { console.error('Failed to log socket handler error', e); } catch {}
          }

          try {
            safeEmitSocket(socket, 'error', { message: err.message || 'Internal Server Error' });
          } catch (e) {
            // ignore
          }
        }
      };
    };
  };
};