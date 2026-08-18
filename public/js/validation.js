export const ROOM_ID_MAX_LENGTH = 32;
export const USERNAME_MAX_LENGTH = 20;

const ROOM_ID_PATTERN = new RegExp(`^[a-zA-Z0-9_-]{1,${ROOM_ID_MAX_LENGTH}}$`);

export function isValidRoomId(roomId) {
  return typeof roomId === 'string' && ROOM_ID_PATTERN.test(roomId);
}

export function isValidUsername(username) {
  return typeof username === 'string' && username.trim().length >= 1 && username.trim().length <= USERNAME_MAX_LENGTH;
}
