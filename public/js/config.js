export const SERVER_URL = window.location.origin.replace(/\/$/, '');

export const AUTH_RETRY_COOLDOWN_MS = 10000;

export function getRoomIdFromPath() {
  const path = location.pathname.split('/').filter(Boolean);
  const roomId = path[1];

  if (path[0] !== 'room' || !roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
    return null;
  }
  return roomId;
}
