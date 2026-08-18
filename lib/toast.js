'use strict';

const logger = require('./logger');

const { shortSha256Hex } = require('./hash');

const DEFAULT_DURATION_MS = 1800;
const MAX_TOAST_LENGTH = 140;
const ALLOWED_SCOPES = new Set(['user', 'room']);
const ALLOWED_TONES = new Set(['info', 'success', 'warning', 'error']);
const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high']);

function normalizeToastText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const source = String(value);
  const normalized = typeof source.normalize === 'function' ? source.normalize('NFKC') : source;
  const cleaned = normalized
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.slice(0, MAX_TOAST_LENGTH);
}

function normalizeEnum(value, allowed, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function createToastId({ scope, target, tone, priority, message }) {
  return shortSha256Hex([scope, target, tone, priority, message].join(':'), 24);
}

function createToastPayload(input = {}) {
  const scope = normalizeEnum(input.scope, ALLOWED_SCOPES, 'user');
  const target = normalizeToastText(input.target) || scope;
  const tone = normalizeEnum(input.tone, ALLOWED_TONES, 'info');
  const priority = normalizeEnum(input.priority, ALLOWED_PRIORITIES, 'normal');
  const message = normalizeToastText(input.message);

  if (!message) {
    return null;
  }

  const durationBase = tone === 'error' ? 2400 : tone === 'warning' ? 2200 : DEFAULT_DURATION_MS;
  const durationMs = normalizePositiveInteger(input.durationMs, durationBase);
  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim()
    : createToastId({ scope, target, tone, priority, message });

  return {
    id,
    scope,
    target,
    tone,
    priority,
    durationMs,
    message,
    at: Date.now(),
  };
}

function createToastEmitters(io, { userRoom } = {}) {
  if (!io || typeof io.to !== 'function') {
    throw new Error('io is required');
  }
  if (typeof userRoom !== 'function') {
    throw new Error('userRoom is required');
  }

  function emitToast(roomName, payload) {
    if (!roomName || !payload) {
      return false;
    }

    try {
      io.to(roomName).emit('toast', payload);
      return true;
    } catch (err) {
      logger.error('socket.error', { phase: 'toast_emit', errorType: err?.name });
      return false;
    }
  }

  function emitUserToast(clientId, message, options = {}) {
    const safeClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!safeClientId) {
      return false;
    }

    const payload = createToastPayload({
      scope: 'user',
      target: safeClientId,
      message,
      ...options,
    });

    return emitToast(userRoom(safeClientId), payload);
  }

  function emitRoomToast(roomId, message, options = {}) {
    const safeRoomId = typeof roomId === 'string' ? roomId.trim() : '';
    if (!safeRoomId) {
      return false;
    }

    const payload = createToastPayload({
      scope: 'room',
      target: safeRoomId,
      message,
      ...options,
    });

    return emitToast(safeRoomId, payload);
  }

  return {
    emitUserToast,
    emitRoomToast,
    createToastPayload,
    normalizeToastText,
  };
}

module.exports = {
  createToastEmitters,
  createToastPayload,
  normalizeToastText,
};
