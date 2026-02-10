import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { fetchWithAuth, obtainToken } from './api.js';
import { showToast } from './toast.js';
import { openProfileModal, closeProfileModal, refreshAdminModalUI, closeAdminModal } from './modal.js';
import { focusInput, scrollBottom } from './utils.js';
import { createMessage } from './render.js';
import { startConnection } from './socket.js';

export async function loadHistory() {
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

  if (button.disabled) return;

  button.disabled = true;

  let payload = overridePayload;

  if (!payload) {
    const message = textarea.value.trim();
    if (!message) {
      button.disabled = false;
      state.isSending = false;
      return;
    }

    payload = {
      roomId: state.roomId,
      message,
      seed: state.mySeed,
    };

    textarea.value = '';
  }

  try {
    if (!state.myToken) {
      try {
        await obtainToken();
      } catch (e) {
        showToast('認証に失敗しました');
        button.disabled = false;
        state.isSending = false;
        return;
      }
    }

    const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res) {
      showToast('送信できませんでした');
      button.disabled = false;
      state.isSending = false;
      return;
    }

    if (res.status === 429) {
      showToast('送信制限中です。しばらくお待ちください');
      button.disabled = false;
      state.isSending = false;
      return;
    }

    if (!res.ok) {
      showToast('送信に失敗しました');
      button.disabled = false;
      state.isSending = false;
      return;
    }

    state.isSending = false;
    button.disabled = false;
  } catch (e) {
    console.error('sendMessage error', e);
    showToast('通信エラーが発生しました');
    button.disabled = false;
    state.isSending = false;
  }
}

export async function saveProfile() {
  const name = elements.profileNameInput?.value.trim();

  if (!name) {
    showToast('ユーザー名を入力してください');
    return;
  }

  if (name.length > 24) {
    showToast('ユーザー名は24文字以内にしてください');
    return;
  }

  if (name === state.myName) {
    closeProfileModal();
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name }),
    });

    if (!res) {
      showToast('保存できませんでした');
      return;
    }

    if (res.status === 429) {
      showToast('変更制限中です。しばらくお待ちください');
      return;
    }

    if (!res.ok) {
      showToast('保存に失敗しました');
      return;
    }

    state.myName = name;
    localStorage.setItem('chat_username', name);

    closeProfileModal();
  } catch (e) {
    console.error('saveProfile error', e);
    showToast('通信エラーが発生しました');
  }
}

export async function adminLogin() {
  const password = elements.adminPasswordInput?.value.trim();

  if (!password) {
    showToast('パスワードを入力してください');
    return false;
  }

  try {
    if (!state.myToken) {
      try {
        await obtainToken();
      } catch (e) {
        showToast('認証に失敗しました');
        return false;
      }
    }
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res) {
      showToast('ログインできませんでした');
      return false;
    }

    if (res.status === 401 || res.status === 403) {
      showToast('パスワードが正しくありません');
      return false;
    }

    if (!res.ok) {
      showToast('ログインに失敗しました');
      return false;
    }

    const data = await res.json();

    if (data.admin) {
      state.isAdmin = true;
      refreshAdminModalUI();
      showToast('管理者としてログインしました');
      return true;
    } else {
      showToast('管理者権限の確認に失敗しました');
      return false;
    }
  } catch (e) {
    console.error('adminLogin error', e);
    showToast('通信エラーが発生しました');
    return false;
  }
}

export async function adminLogout() {
  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/admin/logout`, {
      method: 'POST',
    });

    if (!res) {
      showToast('ログアウトできませんでした');
      return;
    }

    if (!res.ok) {
      showToast('ログアウトに失敗しました');
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