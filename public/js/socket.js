import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { setConnectionState, scrollBottom, focusInput, validateRoomId } from './utils.js';
import { showServerToast, showToast } from './toast.js';
import { createMessage } from './render.js';
import { loadHistory } from './services.js';
import { obtainToken } from './api.js';

let tokenRefreshPromise = null;
let authRetryInFlight = false;

function applySocketAuth() {
  if (!state.socket) return;

  if (state.myToken) {
    state.socket.auth = { token: state.myToken };
  } else {
    try {
      delete state.socket.auth;
    } catch (e) {}
  }
}

async function refreshTokenOnce() {
  if (tokenRefreshPromise) return tokenRefreshPromise;

  tokenRefreshPromise = (async () => {
    await obtainToken();
    return Boolean(state.myToken);
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

async function reconnectAfterAuthFailure() {
  if (authRetryInFlight) return;
  authRetryInFlight = true;

  try {
    const ok = await refreshTokenOnce();

    if (!ok || !state.socket) {
      showToast('認証に失敗しました。再接続できませんでした。');
      return;
    }

    applySocketAuth();

    try {
      if (state.socket.connected) {
        state.socket.disconnect();
      }
    } catch (e) {}

    try {
      state.socket.connect();
    } catch (e) {
      showToast('再接続に失敗しました');
    }
  } catch (e) {
    showToast('認証に失敗しました。再接続できませんでした。');
  } finally {
    authRetryInFlight = false;
  }
}

export function joinRoom() {
  if (!state.socket) return;
  if (!state.roomId || !validateRoomId(state.roomId)) return;
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
    transports: ['websocket'],
    secure: true,
    autoConnect: false,
  });

  applySocketAuth();

  state.socket.on('connect', () => {
    authRetryInFlight = false;
    setConnectionState('online');
    joinRoom();
  });

  state.socket.on('disconnect', () => {
    setConnectionState('offline');
  });

  state.socket.io.on('reconnect_attempt', () => {
    applySocketAuth();
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
    showServerToast('メッセージがクリアされました');
  });

  state.socket.on('error', (err) => {
    console.error('Socket error:', err);
    showToast('エラーが発生しました: ' + (err?.message || '不明'));
  });

  state.socket.on('toast', (data) => {
    if (data.scope === 'user') {
      showToast(data.message);
    } else if (data.scope === 'room') {
      showServerToast(data.message);
    }
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
    const msg = String(err?.message || '');

    if (/TOKEN_EXPIRED/i.test(msg) || /NO_TOKEN/i.test(msg)) {
      state.myToken = null;
      localStorage.removeItem('chatToken');

      await reconnectAfterAuthFailure();
      return;
    }

    setConnectionState('offline');
    showToast('接続に失敗しました: ' + (err?.message || '不明'));
  });
}

export async function startConnection() {
  if (!state.myToken) {
    try {
      await refreshTokenOnce();
    } catch (e) {
      showToast('トークン取得に失敗しました');
      throw e;
    }
  }

  if (!state.socket) {
    createSocket();
  }

  applySocketAuth();

  if (!state.socket.connected) {
    setConnectionState('connecting');
    try {
      state.socket.connect();
    } catch (e) {
      showToast('接続開始に失敗しました');
    }
  }
}