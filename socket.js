'use strict';

const { Server: SocketIOServer } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const KEYS = require('./lib/redisKeys');
const rawLogAction = require('./utils/logger');
const createWrapperFactory = require('./utils/socketWrapper');
const { validateAuthToken } = require('./auth');

function safeEmitSocket(socket, event, payload) {
  if (!socket || typeof socket.emit !== 'function') return false;
  try {
    socket.emit(event, payload);
    return true;
  } catch (e) {
    console.error('safeEmitSocket failed', e);
    return false;
  }
}

function createSocketServer({ httpServer, redisClient, frontendUrl }) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: frontendUrl,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    },
    adapter: createAdapter(redisClient, redisClient.duplicate()),
  });

  async function safeLogAction(payload) {
    try {
      await rawLogAction(redisClient, payload);
    } catch (err) {
      console.error('[safeLogAction] log failed', err);
    }
  }

  const wrapperFactory = createWrapperFactory({
    redisClient,
    io,
    log: safeLogAction,
    safeEmitSocket,
  });

  const ipSessions = new Map();
  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (!ipSessions.has(ip)) ipSessions.set(ip, new Set());
    const sessions = ipSessions.get(ip);
    if (sessions.size >= 3) {
      await safeLogAction({ user: null, action: 'ipSessionLimitExceeded', extra: { ip } });
      return next(new Error('IP_SESSION_LIMIT'));
    }
    sessions.add(socket.id);
    socket.on('disconnect', () => {
      sessions.delete(socket.id);
      if (sessions.size === 0) ipSessions.delete(ip);
    });

    try {
      socket.data = socket.data || {};
      const token = socket.handshake.auth?.token;

      if (!token) {
        await safeLogAction({ user: null, action: 'invalidSocketToken' });
        return next(new Error('NO_TOKEN'));
      }

      const clientId = await validateAuthToken(redisClient, token);

      if (!clientId) {
        await safeLogAction({ user: null, action: 'invalidSocketToken', extra: { token } });
        return next(new Error('TOKEN_EXPIRED'));
      }

      socket.data.clientId = clientId;
      socket.data.authenticated = true;
      socket.join(KEYS.userRoom(clientId));
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const wrap = wrapperFactory(socket);

    socket.on(
      'joinRoom',
      wrap(async (socket, data = {}) => {
        const { roomId } = data;

        if (!socket.data?.authenticated || !socket.data?.clientId) {
          if (!safeEmitSocket(socket, 'authRequired', {})) {
            await safeLogAction({ user: null, action: 'emitFailed', extra: { event: 'authRequired' } });
          }
          return;
        }

        if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
          await safeLogAction({ user: socket.data.clientId, action: 'joinRoomFailed', extra: { roomId } });
          return;
        }

        if (socket.data.roomId) socket.leave(socket.data.roomId);

        socket.join(roomId);
        socket.data.roomId = roomId;

        await safeLogAction({ user: socket.data.clientId, action: 'joinRoom', extra: { roomId } });

        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit('roomUserCount', roomSize);

        if (!safeEmitSocket(socket, 'joinedRoom', { roomId })) {
          await safeLogAction({ user: socket.data.clientId, action: 'emitFailed', extra: { event: 'joinedRoom' } });
        }
      })
    );

    socket.on('disconnect', async (reason) => {
      try {
        const roomId = socket.data?.roomId;
        const clientId = socket.data?.clientId;

        if (roomId) {
          socket.leave(roomId);
          const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
          io.to(roomId).emit('roomUserCount', roomSize);
        }

        if (clientId) {
          await safeLogAction({ user: clientId, action: 'disconnect', extra: { roomId, reason } });
        }
      } catch (err) {
        console.error('Error in disconnect handler', err);
      }
    });
  });

  return io;
}

module.exports = createSocketServer;