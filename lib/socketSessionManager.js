'use strict';

const { isSocketActive } = require('./socketPresence');

class SocketSessionManager {
  constructor({ io, store }) {
    if (!io) {
      throw new Error('io is required');
    }
    if (!store) {
      throw new Error('store is required');
    }

    this.io = io;
    this.store = store;
  }

  async open(clientId, socketId) {
    const currentSocketId = await this.store.getSocketId(clientId);

    if (!currentSocketId) {
      const claimed = await this.store.claim(clientId, socketId);
      return {
        granted: claimed,
        previousSocketId: null,
        replaced: false,
      };
    }

    if (currentSocketId === socketId) {
      const refreshed = await this.store.claim(clientId, socketId);
      return {
        granted: refreshed,
        previousSocketId: currentSocketId,
        replaced: false,
      };
    }

    const previousIsActive = await isSocketActive(this.io, currentSocketId);
    if (previousIsActive) {
      return {
        granted: false,
        previousSocketId: currentSocketId,
        replaced: false,
      };
    }

    const replaced = await this.store.replace(clientId, currentSocketId, socketId);
    return {
      granted: replaced,
      previousSocketId: currentSocketId,
      replaced,
    };
  }
}

module.exports = SocketSessionManager;
