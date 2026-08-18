'use strict';

const { formatISO8601 } = require('../utils/time');

function parseStoredMessage(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  const time = raw.time;

  if (!username || !message || typeof time !== 'number' || !Number.isFinite(time)) {
    return null;
  }

  return {
    username,
    message,
    time,
    admin: raw.admin === true,
  };
}

function createStoredMessage({ username, message, time, admin = false }) {
  return JSON.stringify({
    username,
    message,
    time,
    ...(admin ? { admin: true } : {}),
  });
}

function toPublicMessage(raw) {
  const parsed = parseStoredMessage(raw);
  if (!parsed) {
    return null;
  }

  const message = {
    username: parsed.username,
    message: parsed.message,
    time: formatISO8601(new Date(parsed.time)),
  };

  if (parsed.admin) {
    message.admin = true;
  }

  return message;
}

function parseStoredMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [];
  }

  return rawMessages
    .map((entry) => {
      try {
        return JSON.parse(entry);
      } catch {
        return null;
      }
    })
    .map(toPublicMessage)
    .filter(Boolean);
}

module.exports = {
  parseStoredMessage,
  createStoredMessage,
  toPublicMessage,
  parseStoredMessages,
};
