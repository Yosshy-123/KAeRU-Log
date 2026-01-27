module.exports = function createWrapperFactory({ redisClient, io, log, safeEmitSocket }) {
  if (!log) {
    // fallback logger that uses console
    log = async (payload) => {
      try { console.error('[socketWrapper] missing logger, payload:', payload); } catch {}
    };
  }

  return function wrapperFactory(socket) {
    return function wrap(handler) {
      return async (...args) => {
        try {
          // handler may expect (socket, data) as first args; we pass them as-is
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
