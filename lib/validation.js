'use strict';

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;
const USERNAME_MAX_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 300;

/**
 * Classifies a raw input value for a text field before normalization.
 * - 'missing'      : undefined or null
 * - 'invalid_type' : not a string (number, boolean, object, array, etc.)
 * - 'empty'        : string that is empty after trim()
 * - 'ok'           : non-empty string (after trim consideration of content)
 */
function classifyTextInput(value) {
  if (value === undefined || value === null) {
    return 'missing';
  }
  if (typeof value !== 'string') {
    return 'invalid_type';
  }
  if (value.trim() === '') {
    return 'empty';
  }
  return 'ok';
}

function normalizeText(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input.trim();
}

function isValidRoomId(roomId) {
  return typeof roomId === 'string' && ROOM_ID_PATTERN.test(roomId);
}

function normalizeUsername(username) {
  return normalizeText(username);
}

function isValidUsername(username) {
  const normalized = normalizeUsername(username);
  return normalized.length >= 1 && normalized.length <= USERNAME_MAX_LENGTH;
}

function normalizeMessage(message) {
  return normalizeText(message);
}

function isValidMessage(message) {
  const normalized = normalizeMessage(message);
  return normalized.length >= 1 && normalized.length <= MESSAGE_MAX_LENGTH;
}

module.exports = {
  ROOM_ID_PATTERN,
  USERNAME_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  classifyTextInput,
  isValidRoomId,
  normalizeUsername,
  isValidUsername,
  normalizeMessage,
  isValidMessage,
};
