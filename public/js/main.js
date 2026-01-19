document.addEventListener('DOMContentLoaded', () => {
  /* ---------- 初期設定 ---------- */
  const SERVER_URL = window.location.origin.replace(/\/$/, '');
  const path = location.pathname.split('/').filter(Boolean);
  let roomId = path[1];

  if (path[0] !== 'room' || !roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
    location.replace('/room/open');
    return;
  }

  const socket = io(SERVER_URL);

  /* ---------- 状態 ---------- */
  let messages = [];
  let myName = localStorage.getItem('chat_username') || '';
  let myToken = localStorage.getItem('chatToken') || '';
  let mySeed = localStorage.getItem('chat_seed');
  let isAutoScroll = true;
  let pendingMessage = null;
  let activeModal = null;
  let isSocketAuthenticated = false;

  if (!mySeed) {
    mySeed = generateUserSeed(40);
    localStorage.setItem('chat_seed', mySeed);
  }

  /* ---------- DOM要素 ---------- */
  const elements = {
    chatContainer: document.querySelector('main') || document.documentElement,
    messageList: document.getElementById('messageList'),
    messageTextarea: document.getElementById('messageTextarea'),
    sendMessageButton: document.getElementById('sendMessageButton'),
    currentUsernameLabel: document.getElementById('currentUsernameLabel'),
    toastNotification: document.getElementById('toastNotification'),

    profileModal: document.getElementById('profileModal'),
    profileNameInput: document.getElementById('profileNameInput'),
    openProfileButton: document.getElementById('openProfileButton'),
    closeProfileButton: document.getElementById('closeProfileButton'),
    saveProfileButton: document.getElementById('saveProfileButton'),

    adminModal: document.getElementById('adminModal'),
    openAdminButton: document.getElementById('openAdminButton'),
    closeAdminButton: document.getElementById('closeAdminButton'),
    adminPasswordInput: document.getElementById('adminPasswordInput'),
    clearMessagesButton: document.getElementById('clearMessagesButton'),

    connectionText: document.getElementById('connectionText'),
    connectionIndicator: document.getElementById('connectionIndicator'),
    onlineUserCount: document.getElementById('onlineUserCount'),

    roomIdInput: document.getElementById('roomIdInput'),
    joinRoomButton: document.getElementById('joinRoomButton')
  };

  if (elements.currentUsernameLabel) {
    elements.currentUsernameLabel.textContent = myName || '未設定';
  }

  if (elements.roomIdInput && roomId) {
    elements.roomIdInput.value = roomId;
  }

  if (elements.roomIdInput) {
    if (roomId) {
      elements.roomIdInput.value = roomId;
    }

    elements.roomIdInput.addEventListener('focus', () => {
      selectAll(elements.roomIdInput);
    });

    elements.roomIdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        changeChatRoom(elements.roomIdInput.value.trim());
      }
    });
  }

  /* ---------- ユーティリティ ---------- */
  function generateUserSeed(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  }

  function selectAll(input) {
    if (!input) return;
    setTimeout(() => {
      input.select();
    }, 0);
  }

  function showToast(text, duration = 1800) {
    const toast = elements.toastNotification;
    if (!toast) return;

    toast.textContent = text;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    toast.classList.add('show');

    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  function focusInput(target = elements.messageTextarea) {
    if (!target) return;
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if ('value' in target) {
      const v = target.value;
      target.value = '';
      target.value = v;
    }
  }

  function isScrolledToBottom() {
    const c = elements.chatContainer || document.documentElement;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
  }

  function scrollBottom(smooth = true) {
    const c = elements.chatContainer || document.documentElement;
    c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function getInitials(name) {
    if (!name) return '?';
    return name
      .trim()
      .split(/\s+/)
      .map(v => v[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function setConnectionState(state) {
    const el = elements.connectionIndicator;
    if (!el) return;

    el.classList.remove('online', 'offline');

    switch (state) {
      case 'online':
        el.classList.add('online');
        el.setAttribute('aria-label', 'オンライン');
        if (elements.connectionText) elements.connectionText.textContent = 'オンライン';
        break;

      case 'offline':
        el.classList.add('offline');
        el.setAttribute('aria-label', '切断');
        if (elements.connectionText) elements.connectionText.textContent = '切断';
        break;

      default:
        el.setAttribute('aria-label', '接続中');
        if (elements.connectionText) elements.connectionText.textContent = '接続中';
    }
  }

  /* ---------- メッセージ描画 ---------- */
  function createMessage(msg) {
    const self = msg.seed === mySeed;

    const wrap = document.createElement('div');
    wrap.className = 'message-item' + (self ? ' is-self' : '');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = getInitials(msg.username);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const nameEl = document.createElement('div');
    nameEl.className = 'message-username';
    nameEl.textContent = msg.username || '匿名';

    const dot = document.createElement('span');
    dot.textContent = '•';
    dot.style.opacity = '0.6';

    const timeEl = document.createElement('span');
    timeEl.className = 'message-time';
    timeEl.textContent = msg.time || '';

    meta.append(nameEl, dot, timeEl);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.innerHTML = msg.message || '';

    bubble.append(meta, text);

    wrap.append(avatar, bubble);

    return wrap;
  }

  /* ---------- API ---------- */
  async function loadHistory() {
    try {
      const res = await fetch(`${SERVER_URL}/api/messages/${encodeURIComponent(roomId)}`, { cache: 'no-store' });
      if (!res.ok) throw 0;
      messages = await res.json();
      if (elements.messageList) {
        elements.messageList.innerHTML = '';
        messages.forEach(m => elements.messageList.appendChild(createMessage(m)));
      }
      if (isAutoScroll) scrollBottom(false);
    } catch {}
  }

  async function sendMessage() {
    const button = elements.sendMessageButton;
    const textarea = elements.messageTextarea;
    if (!textarea || !button) return;

    const text = textarea.value.trim();
    if (!text) {
      showToast('メッセージを入力してください');
      return;
    }

    button.disabled = true;
    button.textContent = '送信中…';

    try {
      if (!myName) {
        showToast('ユーザー名を設定してください');
        openProfileModal();
        return;
      }

      const payload = { roomId, username: myName, message: text, seed: mySeed, token: myToken };

      if (!myToken) {
        pendingMessage = payload;

        if (socket?.connected) {
          socket.emit('authenticate', { token: '', username: myName });
          showToast('認証情報を取得中です…');
        } else {
          showToast('サーバーに接続されていません');
        }

        return;
      }

      const res = await fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        return;
      }

      textarea.value = '';
      focusInput();
    } catch (e) {
      console.error(e);
      showToast('通信エラーが発生しました');
    } finally {
      button.disabled = false;
      button.textContent = '送信';
    }
  }

  /* ---------- モーダル ---------- */
  function openModal(modal) {
    if (!modal) return;
    if (activeModal && activeModal !== modal) {
      closeModal(activeModal);
    }
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    activeModal = modal;
    const input = modal.querySelector('input, textarea, button');
    input?.focus();

    const escHandler = e => { if (e.key === 'Escape') closeModal(modal); };
    modal._escHandler = escHandler;
    document.addEventListener('keydown', escHandler);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', modal._escHandler);
    if (activeModal === modal) {
      activeModal = null;
    }
    focusInput();
  }

  function openProfileModal() {
    if (elements.profileNameInput) {
      elements.profileNameInput.value = myName || '';
    }
    openModal(elements.profileModal);
    selectAll(elements.profileNameInput);
  }
  function closeProfileModal() { closeModal(elements.profileModal); }
  function openAdminModal() {
		if (elements.adminPasswordInput) {
      elements.adminPasswordInput.value = '';
    }
		openModal(elements.adminModal);
		focusMessageInput(elements.adminPasswordInput);
	}
  function closeAdminModal() { closeModal(elements.adminModal); }

  async function deleteAllMessages() {
    const password = elements.adminPasswordInput?.value || '';
    if (!password) {
      showToast('パスワードを入力してください');
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, roomId, token: myToken })
      });
      const data = await res.json().catch(() => ({}));
    } catch (e) {
      console.error(e);
    } finally {
      closeAdminModal();
      focusInput();
    }
}

  function saveProfile() {
    const v = (elements.profileNameInput?.value || '').trim().slice(0, 24);
    if (!v) { showToast('ユーザー名は1〜24文字で設定してください'); return; }
    myName = v;
    localStorage.setItem('chat_username', myName);
    if (elements.currentUsernameLabel) elements.currentUsernameLabel.textContent = myName;
    closeProfileModal();
    showToast('プロフィールを保存しました');
    focusInput();
  }

  /* ---------- モーダル Enterキー対応 ---------- */
  function addEnterKeyForModal(modal, action) {
    if (!modal) return;
    const input = modal.querySelector('input, textarea');
    if (!input) return;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        action();
      }
    });
  }

  addEnterKeyForModal(elements.profileModal, saveProfile);
  addEnterKeyForModal(elements.adminModal, deleteAllMessages);

  /* ---------- Socket.IO ---------- */
  function joinRoom() {
    socket.emit('joinRoom', { roomId });
  }

  socket.on('connect', () => {
    setConnectionState('online');
    socket.emit('authenticate', { token: myToken || '', username: myName || '' });
  });

  socket.on('disconnect', () => {
    setConnectionState('offline');
  });

  socket.io.on('reconnect_attempt', () => {
    setConnectionState('connecting');
  });

  socket.on('assignToken', token => {
    myToken = token;
    localStorage.setItem('chatToken', token);
    if (!pendingMessage) return;
    const resend = { ...pendingMessage, token: myToken };
    pendingMessage = null;
    (async () => {
      try {
        await fetch(`${SERVER_URL}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resend)
        });
      } catch (e) {
        console.error('再送信エラー', e);
      }
    })();
  });

  socket.on('newMessage', msg => {
    messages.push(msg);
    elements.messageList?.appendChild(createMessage(msg));
    if (isAutoScroll) scrollBottom(true);
  });

  socket.on('authenticated', () => {
    isSocketAuthenticated = true;
    joinRoom();
  });

  socket.on('clearMessages', () => {
    messages = [];
    if (elements.messageList) elements.messageList.innerHTML = '';
  });

  socket.on('toast', data => {
    const msg = typeof data === 'string' ? data : data?.message;
    if (msg) showToast(msg);
  });

  socket.on('roomUserCount', count => {
    if (typeof count === 'number' && elements.onlineUserCount) {
      elements.onlineUserCount.textContent = `オンライン: ${count}`;
    }
  });

  socket.on('joinedRoom', () => {
    loadHistory();
    focusInput();
  });

  /* ---------- イベント登録 ---------- */
  elements.sendMessageButton?.addEventListener('click', sendMessage);

  if (elements.messageTextarea) {
    const isMobileLike = window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
    elements.messageTextarea.addEventListener('keydown', e => {
      if (!isMobileLike && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  elements.openProfileButton?.addEventListener('click', openProfileModal);
  elements.closeProfileButton?.addEventListener('click', closeProfileModal);
  elements.saveProfileButton?.addEventListener('click', saveProfile);

  elements.openAdminButton?.addEventListener('click', openAdminModal);
  elements.closeAdminButton?.addEventListener('click', closeAdminModal);
  elements.clearMessagesButton?.addEventListener('click', deleteAllMessages);

  /* ---------- ルーム切替 ---------- */
  function changeChatRoom(newRoom) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) {
      showToast('ルーム名は英数字・一部記号32文字以内で指定してください');
      return;
    }
    if (newRoom === roomId) return;
    location.href = `/room/${encodeURIComponent(newRoom)}`;
  }

  elements.joinRoomButton?.addEventListener('click', () =>
    changeChatRoom(elements.roomIdInput.value.trim())
  );

  // 自動スクロール
  elements.chatContainer?.addEventListener('scroll', () => {
    isAutoScroll = isScrolledToBottom();
  });
});
