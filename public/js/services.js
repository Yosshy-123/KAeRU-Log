import { SERVER_URL } from './config.js';
import { state } from './state.js';
import { elements } from './dom.js';
import { fetchWithAuth, obtainToken } from './api.js';
import { showToast } from './toast.js';
import { openProfileModal, closeProfileModal } from './modal.js';
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

  const text = overridePayload?.message ?? textarea.value.trim();
  if (!text) {
    state.isSending = false;
    return;
  }

  button.disabled = true;
  button.textContent = '送信中…';

  try {
    const payload = overridePayload ?? { roomId: state.roomId, message: text, seed: state.mySeed };

    if (!state.myToken) {
      state.pendingMessage = payload;
      try {
        await obtainToken();
      } catch (e) {
        showToast('認証に失敗しました');
        openProfileModal();
        return;
      } finally {
        state.pendingMessage = null;
      }
    }

    const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res) {
      showToast('送信できませんでした');
      return;
    }

    if (res.status === 401 || res.status === 403) {
      showToast('認証が必要です');
      state.myToken = null;
      localStorage.removeItem('chatToken');
      openProfileModal();
      return;
    }

    if (res.status === 429) {
      showToast('送信が制限されています（スパム/レート制限）');
      return;
    }

    if (!res.ok) {
      showToast('送信に失敗しました');
      return;
    }

    if (!overridePayload) {
      textarea.value = '';
      focusInput();
    }
  } catch (e) {
    console.error(e);
    showToast('通信エラーが発生しました');
  } finally {
    button.disabled = false;
    button.textContent = '送信';
    state.isSending = false;
  }
}

export async function saveProfile() {
  const v = (elements.profileNameInput?.value || '').trim();

  if (!v) {
    showToast('ユーザー名は空です');
    return;
  }
  if (v.length > 24) {
    showToast('ユーザー名は24文字以内にしてください');
    return;
  }

  try {
    if (!state.myToken) {
      try {
        await obtainToken();
      } catch (e) {
        showToast('認証に失敗しました');
        return;
      }
    }

    const res = await fetchWithAuth(`${SERVER_URL}/api/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: v }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        showToast('認証が必要です');
        state.myToken = null;
        localStorage.removeItem('chatToken');
        openProfileModal();
        return;
      }
      if (res.status === 429) {
        showToast('ユーザー名変更はしばらくお待ちください');
        return;
      }
      showToast('プロフィール保存に失敗しました');
      return;
    }

    state.myName = v;
    localStorage.setItem('chat_username', state.myName);

    closeProfileModal();
    showToast('プロフィールを保存しました');
    focusInput();

    if (!state.socket || !state.socket.connected) {
      startConnection().catch(() => {});
    }

    if (state.pendingMessage) {
      const pm = state.pendingMessage;
      state.pendingMessage = null;
      sendMessage(pm);
    }
  } catch (e) {
    console.error(e);
    showToast('通信エラーが発生しました');
  }
}

export async function deleteAllMessages() {
  const password = elements.adminPasswordInput?.value || '';
  if (!password) {
    showToast('パスワードを入力してください');
    return;
  }

  try {
    const res = await fetchWithAuth(`${SERVER_URL}/api/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, roomId: state.roomId }),
    });

    if (!res.ok) {
      showToast('削除に失敗しました');
    }
  } catch (e) {
    console.error(e);
    showToast('通信エラーが発生しました');
  }
}
