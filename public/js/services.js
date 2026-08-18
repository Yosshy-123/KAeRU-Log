import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { safeSetItem } from './storage.js';
import { elements } from './dom.js';
import { fetchWithAuth } from './api.js';
import { showToast } from './toast.js';
import { closeProfileModal, refreshAdminModalUI, closeAdminModal } from './modal.js';
import { focusInput, scrollBottom } from './utils.js';
import { USERNAME_MAX_LENGTH, isValidUsername, isValidRoomId } from './validation.js';
import { createMessage } from './render.js';

function shouldShowFallbackToast(status) {
  return !Number.isInteger(status) || status >= 500;
}

function showNetworkFailure(action, status = 0) {
  if (shouldShowFallbackToast(status)) {
    showToast(`${action}に失敗しました`);
  }
}

function renderHistory(messages) {
  if (!elements.messageList) {
    return;
  }

  elements.messageList.innerHTML = '';
  messages.forEach((message) => {
    elements.messageList.appendChild(createMessage(message));
  });
}

function postMessage(roomId, payload) {
  return fetchWithAuth(`${SERVER_URL}/api/messages/${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function loadHistory() {
  if (!isValidRoomId(state.roomId)) return;

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/messages/${encodeURIComponent(state.roomId)}`, {
      cache: 'no-store',
    });

    if (!res || !res.ok) {
      showNetworkFailure('履歴の読み込み', res?.status || 0);
      return;
    }

    const history = await res.json().catch(() => []);
    state.messages = Array.isArray(history) ? history : [];

    renderHistory(state.messages);

    if (state.isAutoScroll) scrollBottom(false);
  } catch (e) {
    console.warn('loadHistory failed', e);
    showToast('履歴の読み込みに失敗しました');
  }
}

export async function sendMessage(overridePayload = null) {
  if (state.isSending) return;
  state.isSending = true;

  const button = elements.sendMessageButton;
  const textarea = elements.messageTextarea;

  if (!textarea || !button) {
    state.isSending = false;
    return;
  }

  button.disabled = true;

  const payload = overridePayload
    ? { message: typeof overridePayload.message === 'string' ? overridePayload.message.trim() : '' }
    : { message: textarea.value.trim() };

  const roomId = state.roomId;
  if (!payload.message || !roomId) {
    showToast('メッセージを入力してください');
    state.isSending = false;
    button.disabled = false;
    return;
  }

  textarea.value = '';

  try {
    const res = await postMessage(roomId, payload);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        state.pendingMessage = payload;
      } else {
        state.pendingMessage = null;
      }
      if (shouldShowFallbackToast(res.status)) {
        showToast('送信に失敗しました');
      }
      textarea.value = payload.message;
      return;
    }

    state.pendingMessage = null;
    focusInput();
  } catch (e) {
    console.error('sendMessage error', e);
    showToast('通信エラーが発生しました');
    textarea.value = payload.message;
  } finally {
    state.isSending = false;
    button.disabled = false;
  }
}

export async function saveProfile() {
  const input = elements.profileNameInput;
  if (!input) return;

  const username = input.value.trim();

  if (!isValidUsername(username)) {
    showToast(`ユーザー名は1〜${USERNAME_MAX_LENGTH}文字で入力してください`);
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (!res.ok) {
      showNetworkFailure('保存', res.status);
      return;
    }

    state.myName = username;
    safeSetItem('chat_username', state.myName);
    closeProfileModal();
  } catch (e) {
    console.error('saveProfile error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function adminLogin() {
  const input = elements.adminPasswordInput;
  if (!input) return;

  // Do not trim: server compares the exact string (constant-time).
  const password = input.value;

  if (!password) {
    showToast('パスワードを入力してください');
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      showNetworkFailure('ログイン', res.status);
      return;
    }

    state.isAdmin = true;
    refreshAdminModalUI();
  } catch (e) {
    console.error('adminLogin error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function adminLogout() {
  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/logout`, {
      method: 'POST',
    });

    if (!res.ok) {
      showNetworkFailure('ログアウト', res.status);
      return;
    }

    state.isAdmin = false;
    refreshAdminModalUI();
  } catch (e) {
    console.error('adminLogout error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function deleteAllMessages() {
  if (!isValidRoomId(state.roomId)) {
    showToast('ルームが未設定です');
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/clear/${encodeURIComponent(state.roomId)}`, {
      method: 'POST',
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        state.isAdmin = false;
        refreshAdminModalUI();
      } else {
        showNetworkFailure('削除', res.status);
      }
      return;
    }

    closeAdminModal();
  } catch (e) {
    console.error('deleteAllMessages error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function getAdminStatus() {
  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/status`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!res || !res.ok) {
      state.isAdmin = false;
      refreshAdminModalUI();
      return false;
    }

    const data = await res.json().catch(() => null);
    state.isAdmin = !!data?.admin;

    refreshAdminModalUI();
    return state.isAdmin;
  } catch (e) {
    console.error('getAdminStatus error', e);
    state.isAdmin = false;
    refreshAdminModalUI();
    return false;
  }
}
