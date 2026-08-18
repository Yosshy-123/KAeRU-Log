import { isValidRoomId } from './validation.js';

export const SERVER_URL =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin.replace(/\/$/, '') : '';

export const AUTH_RETRY_COOLDOWN_MS = 10000;

export function getRoomIdFromPath() {
  const pathname = typeof globalThis.location?.pathname === 'string' ? globalThis.location.pathname : '';
  const path = pathname.split('/').filter(Boolean);
  const roomId = path[1];

  if (path.length !== 2 || path[0] !== 'room' || !isValidRoomId(roomId)) {
    return null;
  }

  return roomId;
}
