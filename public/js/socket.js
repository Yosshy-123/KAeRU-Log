import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { setConnectionState, scrollBottom, focusInput } from './utils.js';
import { isValidRoomId } from './validation.js';
import { showServerToast, showToast } from './toast.js';
import { createMessage } from './render.js';
import { obtainToken } from './api.js';

let tokenRefreshPromise = null;
let authRetryInFlight = false;

async function refreshTokenOnce() {
  if (tokenRefreshPromise) return tokenRefreshPromise;

  tokenRefreshPromise = (async () => {
    await obtainToken();
    return true;
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

let disconnectInFlight = null;

export function disconnectSocketGracefully(timeoutMs = 150) {
  const socket = state.socket;
  if (!socket || typeof socket.disconnect !== 'function') {
    return Promise.resolve();
  }

  if (socket.disconnected === true && socket.connected !== true) {
    return Promise.resolve();
  }

  if (disconnectInFlight) {
    return disconnectInFlight;
  }

  disconnectInFlight = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    try {
      socket.once('disconnect', finish);
    } catch {
      // ignore and rely on the timeout fallback below
    }

    try {
      socket.disconnect();
    } catch (err) {
      console.warn('disconnectSocketGracefully failed', err);
      finish();
      return;
    }

    window.setTimeout(finish, timeoutMs);
  }).finally(() => {
    disconnectInFlight = null;
  });

  return disconnectInFlight;
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

    try {
      if (state.socket.connected) {
        state.socket.disconnect();
      }
    } catch {
      // ignore
    }

    try {
      state.socket.connect();
    } catch {
      showToast('再接続に失敗しました');
    }
  } catch {
    showToast('認証に失敗しました。再接続できませんでした。');
  } finally {
    authRetryInFlight = false;
  }
}

export function joinRoom() {
  if (!state.socket) return;
  if (!state.roomId || !isValidRoomId(state.roomId)) return;
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
    autoConnect: false,
    withCredentials: true,
  });

  state.socket.on('connect', () => {
    authRetryInFlight = false;
    setConnectionState('online');
    joinRoom();
  });

  state.socket.on('disconnect', () => {
    setConnectionState('offline');
  });

  state.socket.io.on('reconnect_attempt', () => {
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

  state.socket.on('error', (err) => {
    console.error('Socket error:', err);
    showToast('エラーが発生しました');
  });

  state.socket.on('toast', (data) => {
    showServerToast(data);
  });

  state.socket.on('roomUserCount', (count) => {
    if (typeof count === 'number' && elements.onlineUserCount) {
      elements.onlineUserCount.textContent = `${count}`;
    }
  });

  state.socket.on('joinedRoom', () => {
    focusInput();
  });

  state.socket.on('connect_error', async (err) => {
    const msg = String(err?.message || '');

    if (/TOKEN_EXPIRED/i.test(msg) || /NO_TOKEN/i.test(msg)) {
      await reconnectAfterAuthFailure();
      return;
    }

    if (/CLIENT_SESSION_LIMIT/i.test(msg)) {
      setConnectionState('offline');
      showToast('この clientId は別の接続で使用中です');

      try {
        state.socket.disconnect();
      } catch {
        // ignore
      }

      return;
    }

    setConnectionState('offline');
    showToast('接続に失敗しました');
  });
}

export async function startConnection() {
  if (!state.socket) {
    createSocket();
  }

  if (!state.socket.connected) {
    setConnectionState('connecting');
    try {
      state.socket.connect();
    } catch {
      showToast('接続開始に失敗しました');
    }
  }
}
