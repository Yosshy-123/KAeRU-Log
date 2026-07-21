'use strict';

const crypto = require('crypto');
const { Server: SocketIOServer } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const KEYS = require('./lib/redisKeys');
const createWrapperFactory = require('./utils/socketWrapper');
const { validateAuthToken } = require('./auth');
const ClientSessionStore = require('./lib/clientSessionStore');
const SocketSessionManager = require('./lib/socketSessionManager');
const { countRoomMembers } = require('./lib/socketPresence');
const { isValidRoomId } = require('./lib/validation');
const { getAuthTokenFromRequest } = require('./lib/authCookie');

function safeEmitSocket(socket, event, payload) {
  if (!socket || typeof socket.emit !== 'function') {
    return false;
  }

  try {
    socket.emit(event, payload);
    return true;
  } catch (err) {
    console.error('safeEmitSocket failed', err);
    return false;
  }
}

function createSocketError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function createReleaseSession({ store, clientId, socketId }) {
  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;

    try {
      await store.release(clientId, socketId);
    } catch (err) {
      console.error('Failed to release client session slot', err);
    }
  };
}

function createDisconnectCleanup({ releaseSession, afterDisconnect = async () => {} }) {
  let done = false;

  return async () => {
    if (done) {
      return;
    }

    done = true;

    await releaseSession();
    await afterDisconnect();
  };
}

function createSocketServer({ httpServer, redisClient }) {
  if (!httpServer) {
    throw new Error('httpServer is required');
  }
  if (!redisClient) {
    throw new Error('redisClient is required');
  }

  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  pubClient.on('error', (err) => console.error('Redis pubClient error', err));
  subClient.on('error', (err) => console.error('Redis subClient error', err));

  const io = new SocketIOServer(httpServer, {
    adapter: createAdapter(pubClient, subClient),
  });

  io.closeRedisConnections = async () => {
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  };

  const wrapperFactory = createWrapperFactory({ safeEmitSocket });
  const clientSessionStore = new ClientSessionStore(redisClient, { ttlSec: 24 * 60 * 60 });
  const socketSessionManager = new SocketSessionManager({ io, store: clientSessionStore });

  io.use(async (socket, next) => {
    socket.data = socket.data || {};
    socket.data.authenticated = false;
    socket.data.cleanup = async () => {};

    const token = getAuthTokenFromRequest(socket.handshake);
    if (!token) {
      return next(createSocketError('NO_TOKEN'));
    }

    let clientId = null;
    let connectionId = null;

    try {
      clientId = await validateAuthToken(redisClient, token);
      if (!clientId) {
        return next(createSocketError('TOKEN_EXPIRED'));
      }

      connectionId = socket.id || crypto.randomUUID();
      socket.data.clientId = clientId;
      socket.data.connectionId = connectionId;

      const session = await socketSessionManager.open(clientId, connectionId);
      if (!session.granted) {
        return next(createSocketError('CLIENT_SESSION_LIMIT'));
      }

      socket.data.cleanup = createReleaseSession({
        store: clientSessionStore,
        clientId,
        socketId: connectionId,
      });

      socket.data.authenticated = true;
      await socket.join(KEYS.userRoom(clientId));

      return next();
    } catch (err) {
      if (clientId && connectionId) {
        await clientSessionStore.release(clientId, connectionId).catch((releaseErr) => {
          console.error('Failed to release session after auth error', releaseErr);
        });
      }

      console.error('Authentication error in socket middleware', err);
      return next(createSocketError('AUTHENTICATION_ERROR'));
    }
  });

  io.on('connection', (socket) => {
    const wrap = wrapperFactory(socket);

    const emitRoomUserCount = async (roomId) => {
      if (!roomId) {
        return;
      }

      try {
        const roomSize = await countRoomMembers(io, roomId);
        if (typeof roomSize !== 'number') {
          return;
        }

        io.to(roomId).emit('roomUserCount', roomSize);
      } catch (err) {
        console.error('Failed to emit roomUserCount', err);
      }
    };

    const previousCleanup = typeof socket.data?.cleanup === 'function' ? socket.data.cleanup : async () => {};
    socket.data.cleanup = createDisconnectCleanup({
      releaseSession: previousCleanup,
      afterDisconnect: async () => {
        const roomId = socket.data?.roomId;
        socket.data.roomId = null;

        if (!roomId) {
          return;
        }

        try {
          await emitRoomUserCount(roomId);
        } catch (err) {
          console.error('Error in disconnect cleanup', err);
        }
      },
    });

    socket.once('disconnect', () => {
      void socket.data.cleanup?.();
    });

    socket.on(
      'joinRoom',
      wrap(async (socket, data = {}) => {
        const roomId = typeof data?.roomId === 'string' ? data.roomId.trim() : '';

        if (!socket.data?.authenticated || !socket.data?.clientId) {
          safeEmitSocket(socket, 'authRequired', {});
          return;
        }

        if (!isValidRoomId(roomId)) {
          return;
        }

        const previousRoomId = socket.data.roomId;
        if (previousRoomId && previousRoomId !== roomId) {
          await socket.leave(previousRoomId);
          await emitRoomUserCount(previousRoomId);
        }

        socket.data.roomId = roomId;
        await socket.join(roomId);
        await emitRoomUserCount(roomId);
        safeEmitSocket(socket, 'joinedRoom', { roomId });
      })
    );
  });

  return io;
}

module.exports = createSocketServer;
