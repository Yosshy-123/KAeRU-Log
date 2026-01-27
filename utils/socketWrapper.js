// utils/socketWrapper.js
module.exports = function createHandlerWrapper({ redisClient, io, logAction, safeEmitSocket }) {
  return function createWrapper(socket) {
    return (fn) => (...args) => {
      if (!socket || typeof socket.emit !== 'function') {
        console.warn('Invalid socket in handler', args);
        return;
      }
      Promise.resolve(fn(socket, ...args)).catch(async (err) => {
        try {
          await logAction(redisClient, { user: socket.data?.clientId || '-', action: 'socketHandlerError', extra: { message: err.message }});
        } catch (e) {
          console.error('Failed to log socketHandlerError', e);
        }
        // クライアントには統一されたエラーイベントを送る
        safeEmitSocket(socket, 'error', { message: err.message || 'Internal Server Error' });
      });
    };
  };
};
