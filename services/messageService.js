'use strict';

const KEYS = require('../lib/redisKeys');
const { ensureStoredUsername } = require('../lib/usernames');
const { pushAndTrimList } = require('../lib/redisHelpers');
const createSpamService = require('./spamService');
const { createStoredMessage, parseStoredMessages, toPublicMessage } = require('../lib/messageCodec');
const config = require('../config');

function getMaxMessages(roomId) {
  return roomId === 'general' ? config.messages.generalRoomMax : config.messages.defaultRoomMax;
}

function createMessageService({ redisClient, io }) {
  if (!redisClient) {
    throw new Error('redisClient is required');
  }
  if (!io) {
    throw new Error('io is required');
  }

  const spamService = createSpamService(redisClient, KEYS);

  async function getHistory(roomId) {
    const rawMessages = await redisClient.lrange(KEYS.messages(roomId), 0, -1);
    return parseStoredMessages(rawMessages);
  }

  /**
   * Persist and broadcast a message.
   * @returns {{ ok: true } | { rejected: true, spamResult: object }}
   */
  async function sendMessage({ clientId, token, roomId, message, ip }) {
    const username = await ensureStoredUsername(redisClient, KEYS.username(clientId));

    const spamResult = await spamService.check(clientId, message, ip);
    if (spamResult.rejected || spamResult.muted) {
      return { rejected: true, spamResult };
    }

    const isAdmin = token ? (await redisClient.get(KEYS.adminSession(token))) === clientId : false;
    const now = Date.now();
    const messageRecord = {
      username,
      message,
      time: now,
      admin: isAdmin,
    };

    await pushAndTrimList(
      redisClient,
      KEYS.messages(roomId),
      createStoredMessage(messageRecord),
      getMaxMessages(roomId)
    );

    const publicMessage = toPublicMessage(messageRecord);
    if (publicMessage) {
      io.to(roomId).emit('newMessage', publicMessage);
    }

    return { ok: true };
  }

  async function clearRoom(roomId) {
    await redisClient.del(KEYS.messages(roomId));
    io.to(roomId).emit('clearMessages');
  }

  return {
    getHistory,
    sendMessage,
    clearRoom,
  };
}

module.exports = createMessageService;
