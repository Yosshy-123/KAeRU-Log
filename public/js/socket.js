import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { setConnectionState, scrollBottom, focusInput } from './utils.js';
import { showServerToast } from './toast.js';
import { createMessage } from './render.js';
import { loadHistory } from './services.js';
import { obtainToken } from './api.js';
import { openProfileModal } from './modal.js';

export function joinRoom() {
  if (!state.socket) return;
  if (!state.roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(state.roomId)) return;
  state.socket.emit('joinRoom', { roomId: state.roomId });
}

export function createSocket() {
  if (
    state.socket &&
    (state.socket.connected || (state.socket.io && state.socket.io.engine && !state.socket.io.engine.closed))
  ) {
    return;
  }

  state.socket = io(SERVER_URL, {
    auth: { token: state.myToken || '' },
    transports: ['websocket'],
  });

  state.socket.on('connect', () => {
    setConnectionState('online');
    joinRoom();
  });

  state.socket.on('disconnect', () => setConnectionState('offline'));

  state.socket.io.on('reconnect_attempt', () => {
    if (state.socket) state.socket.auth = { token: state.myToken || '' };
    setConnectionState('connecting');
  });

  state.socket.on('newMessage', (msg) => {
    state.messages.push(msg);
    elements.messageList?.appendChild(createMessage(msg));
    if (state.isAutoScroll) scrollBottom(true);
  });

  state.socket.on('clearMessages', () => {
    state.messages = [];
    if (elements.messageList) elements.messageList.innerHTML = '';
  });

  state.socket.on('toast', (data) => {
    if (!data || typeof data !== 'object') return;
    if (!data.message) return;
    showServerToast(data.message);
  });

  state.socket.on('roomUserCount', (count) => {
    if (typeof count === 'number' && elements.onlineUserCount) {
      elements.onlineUserCount.textContent = `${count}`;
    }
  });

  state.socket.on('joinedRoom', () => {
    loadHistory();
    focusInput();
  });

  state.socket.on('connect_error', async (err) => {
    const msg = String((err && err.message) || '');

    if (/TOKEN_EXPIRED/.test(msg)) {
      state.myToken = null;
      localStorage.removeItem('chatToken');

      try {
        await obtainToken();

        if (state.socket) {
          state.socket.auth = { token: state.myToken || '' };
          try { state.socket.disconnect(); } catch (e) {}
          try { state.socket.connect(); } catch (e) {}
        } else {
          createSocket();
        }
      } catch (e) {
        openProfileModal();
      }
      return;
    }

    if (/NO_TOKEN/.test(msg) || /NO_TOKEN/.test(msg.toUpperCase())) {
      state.myToken = null;
      localStorage.removeItem('chatToken');
      openProfileModal();
      return;
    }

    openProfileModal();
  });
}

export async function startConnection() {
  if (!state.myToken) {
    try {
      await obtainToken();
    } catch (e) {
      openProfileModal();
      throw e;
    }
  }

  if (!state.socket) createSocket();
  else if (!state.socket.connected) {
    state.socket.auth = { token: state.myToken || '' };
    state.socket.connect();
  }
}
