import { showToast } from './toast.js';
import { state } from './state.js';
import { validateRoomId } from './utils.js';

export function changeChatRoom(newRoom) {
  if (!validateRoomId(newRoom)) {
    showToast('ルーム名は英数字・一部記号32文字以内で指定してください');
    return;
  }
  if (newRoom === state.roomId) return;
  location.href = `/room/${encodeURIComponent(newRoom)}`;
}