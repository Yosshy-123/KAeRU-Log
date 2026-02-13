import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { fetchWithAuth, obtainToken } from './api.js';
import { showToast } from './toast.js';
import { openProfileModal, closeProfileModal, refreshAdminModalUI, closeAdminModal } from './modal.js';
import { focusInput, scrollBottom, validateUsername, validateRoomId } from './utils.js';
import { createMessage } from './render.js';
import { startConnection } from './socket.js';

export async function loadHistory() {
  if (!validateRoomId(state.roomId)) return;

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/messages/${encodeURIComponent(state.roomId)}`, {
      cache: 'no-store',
    });

    if (!res || !res.ok) throw new Error('loadHistory failed');

    state.messages = await res.json();

    if (elements.messageList) {
      elements.messageList.innerHTML = '';
      state.messages.forEach((m) => elements.messageList.appendChild(createMessage(m)));
    }

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

  const payload = overridePayload || {
    message: textarea.value.trim(),
    seed: state.mySeed,
    roomId: state.roomId,
  };

  if (!payload.message || !payload.seed || !payload.roomId) {
    showToast('メッセージを入力してください');
    state.isSending = false;
    button.disabled = false;
    return;
  }

  textarea.value = '';

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error || '送信に失敗しました';
      showToast(msg);

      if (res.status === 401 || res.status === 403) {
        state.pendingMessage = payload;
        await obtainToken();
        await sendMessage(state.pendingMessage);
        state.pendingMessage = null;
      } else if (res.status === 429) {
        showToast('送信制限中です。しばらくお待ちください');
      }

      textarea.value = payload.message;
      return;
    }

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

  if (!validateUsername(username)) {
    showToast('ユーザー名は1-24文字の英数字・一部記号で入力してください');
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error || '保存に失敗しました';
      showToast(msg);
      if (res.status === 429) {
        showToast('変更制限中です。30秒お待ちください');
      }
      return;
    }

    state.myName = username;
    localStorage.setItem('chat_username', state.myName);
    closeProfileModal();
    showToast('ユーザー名を保存しました');
  } catch (e) {
    console.error('saveProfile error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function adminLogin() {
  const input = elements.adminPasswordInput;
  if (!input) return;

  const password = input.value.trim();

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
      const body = await res.json().catch(() => null);
      const msg = body?.error || 'ログインに失敗しました';
      showToast(msg);
      if (res.status === 429) {
        showToast('ログイン制限中です。30秒お待ちください');
      }
      return;
    }

    state.isAdmin = true;
    refreshAdminModalUI();
    showToast('管理者としてログインしました');
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
      showToast('ログアウトに失敗しました');
      return;
    }

    state.isAdmin = false;
    refreshAdminModalUI();
    showToast('ログアウトしました');
  } catch (e) {
    console.error('adminLogout error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function deleteAllMessages() {
  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/clear/${encodeURIComponent(state.roomId)}`, {
      method: 'POST',
    });

    if (!res) {
      showToast('削除に失敗しました');
      return;
    }

    if (res.status === 401 || res.status === 403) {
      state.isAdmin = false;
      refreshAdminModalUI();
      showToast('管理者セッションが無効です。再ログインしてください');
      return;
    }

    if (!res.ok) {
      showToast('削除に失敗しました');
      return;
    }

    showToast('全メッセージを削除しました');
    closeAdminModal();
  } catch (e) {
    console.error('deleteAllMessages error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function getAdminStatus() {
  try {
    if (!state.myToken) {
      state.isAdmin = false;
      refreshAdminModalUI();
      return false;
    }

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