'use strict';

const logger = require('./logger');

async function countRoomMembers(io, roomId) {
  if (!io || typeof io.in !== 'function' || typeof roomId !== 'string' || roomId.trim() === '') {
    return null;
  }

  try {
    const sockets = await io.in(roomId).allSockets();
    return sockets instanceof Set ? sockets.size : 0;
  } catch (err) {
    logger.error('socket.presence.error', { phase: 'countRoomMembers', errorType: err?.name });
    return null;
  }
}

async function isSocketActive(io, socketId) {
  if (!io || typeof io.in !== 'function' || typeof socketId !== 'string' || socketId.trim() === '') {
    return false;
  }

  try {
    const sockets = await io.in(socketId.trim()).allSockets();
    return sockets instanceof Set && sockets.size > 0;
  } catch (err) {
    logger.error('socket.presence.error', { phase: 'isSocketActive', errorType: err?.name });
    return false;
  }
}

module.exports = {
  countRoomMembers,
  isSocketActive,
};
