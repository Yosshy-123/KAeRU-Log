import { showToast } from './toast.js';
import { state } from './state.js';
import { disconnectSocketGracefully } from './socket.js';
import { ROOM_ID_MAX_LENGTH, isValidRoomId } from './validation.js';

export function changeChatRoom(newRoom) {
  if (!isValidRoomId(newRoom)) {
    showToast(`ルーム名は英数字・一部記号${ROOM_ID_MAX_LENGTH}文字以内で指定してください`);
    return;
  }

  if (newRoom === state.roomId) {
    return;
  }

  const nextUrl = `/room/${encodeURIComponent(newRoom)}`;

  if (state.socket) {
    void disconnectSocketGracefully().finally(() => {
      location.href = nextUrl;
    });
    return;
  }

  location.href = nextUrl;
}
