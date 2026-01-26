document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ---------- 初期設定 ---------- */
  const SERVER_URL = window.location.origin.replace(/\/$/, '');
  const path = location.pathname.split('/').filter(Boolean);
  let roomId = path[1];

  if (path[0] !== 'room' || !roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
    location.replace('/room/open');
    return;
  }

  let socket = null; // 後で初期化

  /* ---------- 状態 ---------- */
  let messages = [];
  let myName = localStorage.getItem('chat_username') || '';
  let myToken = localStorage.getItem('chatToken') || '';
  let mySeed = localStorage.getItem('chat_seed');
  let isAutoScroll = true;
  let pendingMessage = null;
  let activeModal = null;
  let isServerToastActive = false;
  let isSending = false;

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

  if (elements.roomIdInput) {
    elements.roomIdInput.value = roomId || '';

    elements.roomIdInput.addEventListener('focus', () => selectAll(elements.roomIdInput));

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
    setTimeout(() => input.select(), 0);
  }

  function showToast(text, duration = 1800) {
    if (isServerToastActive) return;
    const toast = elements.toastNotification;
    if (!toast) return;

    toast.textContent = text;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.classList.add('show');

    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function showToastserver(text, duration = 1800) {
    const toast = elements.toastNotification;
    if (!toast) return;

    isServerToastActive = true;
    toast.textContent = text;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.classList.add('show');

    clearTimeout(showToastserver._t);
    showToastserver._t = setTimeout(() => {
      toast.classList.remove('show');
      isServerToastActive = false;
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

  /* ---------- API ヘルパー ---------- */
  async function obtainToken() {
    if (!myName) {
      openProfileModal();
      throw new Error('username required');
    }

    const res = await fetch(`${SERVER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myName })
    });

    if (!res.ok) {
      throw new Error('failed to obtain token');
    }

    const data = await res.json();
    if (data?.token) {
      myToken = data.token;
      localStorage.setItem('chatToken', myToken);
      console.log('[Auth] token obtained');
      return myToken;
    }
    throw new Error('invalid auth response');
  }

  async function fetchWithAuth(url, opts = {}, retry = true) {
    if (!opts.headers) opts.headers = {};
    if (myToken) opts.headers['Authorization'] = `Bearer ${myToken}`;

    const res = await fetch(url, opts);
    if ((res.status === 401 || res.status === 403) && retry) {
      try {
        myToken = null;
        localStorage.removeItem('chatToken');
        await obtainToken();
        opts.headers['Authorization'] = `Bearer ${myToken}`;
        return await fetchWithAuth(url, opts, false);
      } catch (e) {
        return res;
      }
    }
    return res;
  }

  /* ---------- API ---------- */
  async function loadHistory() {
    try {
      const res = await fetchWithAuth(`${SERVER_URL}/api/messages/${encodeURIComponent(roomId)}`, {
        cache: 'no-store'
      });

      if (!res || !res.ok) throw 0;
      messages = await res.json();

      if (elements.messageList) {
        elements.messageList.innerHTML = '';
        messages.forEach(m => elements.messageList.appendChild(createMessage(m)));
      }

      if (isAutoScroll) scrollBottom(false);
    } catch (e) {
      console.warn('loadHistory failed', e);
    }
  }

  async function sendMessage(overridePayload = null) {
    if (isSending) return;
    isSending = true;

    const button = elements.sendMessageButton;
    const textarea = elements.messageTextarea;
    if (!textarea || !button) {
      isSending = false;
      return;
    }

    const text = overridePayload?.message ?? textarea.value.trim();
    if (!text) {
      isSending = false;
      return;
    }

    button.disabled = true;
    button.textContent = '送信中…';

    try {
      const payload = overridePayload ?? { roomId, message: text, seed: mySeed };

      if (!myToken) {
        pendingMessage = payload;
        try {
          await obtainToken();
        } catch (e) {
          showToast('認証に失敗しました');
          isSending = false;
          button.disabled = false;
          button.textContent = '送信';
          return;
        }
      }

      const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res || !res.ok) {
        showToast('送信できませんでした');
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
      if (pendingMessage && !overridePayload) pendingMessage = null;
      button.disabled = false;
      button.textContent = '送信';
      isSending = false;
    }
  }

  /* ---------- モーダル ---------- */
  function openModal(modal) {
    if (!modal) return;
    if (activeModal && activeModal !== modal) closeModal(activeModal);

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    activeModal = modal;

    const input = modal.querySelector('input, textarea, button');
    input?.focus();

    const escHandler = e => {
      if (e.key === 'Escape') closeModal(modal);
    };

    modal._escHandler = escHandler;
    document.addEventListener('keydown', escHandler);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', modal._escHandler);
    if (activeModal === modal) activeModal = null;
    focusInput();
  }

  function openProfileModal() {
    if (elements.profileNameInput) elements.profileNameInput.value = myName || '';
    openModal(elements.profileModal);
    selectAll(elements.profileNameInput);
  }

  function closeProfileModal() {
    closeModal(elements.profileModal);
  }

  function openAdminModal() {
    if (elements.adminPasswordInput) elements.adminPasswordInput.value = '';
    openModal(elements.adminModal);
    focusInput(elements.adminPasswordInput);
  }

  function closeAdminModal() {
    closeModal(elements.adminModal);
  }

  async function deleteAllMessages() {
    const password = elements.adminPasswordInput?.value || '';
    if (!password) {
      showToast('パスワードを入力してください');
      return;
    }

    try {
      await fetchWithAuth(`${SERVER_URL}/api/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, roomId })
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function saveProfile() {
    const v = (elements.profileNameInput?.value || '').trim();
    if (!v) {
      showToast('ユーザー名は空です');
      return;
    }
    if (v.length > 24) showToast('ユーザー名は24文字以内にしてください');

    try {
      const res = await fetchWithAuth(`${SERVER_URL}/api/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: v })
      });

      if (!res.ok) {
        showToast('プロフィール保存に失敗しました');
        return;
      }

      myName = v;
      localStorage.setItem('chat_username', myName);
      closeProfileModal();
      showToast('プロフィールを保存しました');
      focusInput();

      if (!socket || !socket.connected) startConnection().catch(err => console.warn('startConnection failed', err));
      if (pendingMessage) {
        const pm = pendingMessage;
        pendingMessage = null;
        sendMessage(pm);
      }
    } catch (e) {
      console.error(e);
      showToast('通信エラーが発生しました');
    }
  }

  /* ---------- モーダル Enterキー対応 ---------- */
  function addEnterKeyForModal(modal, action, close) {
    if (!modal) return;
    const input = modal.querySelector('input, textarea');
    if (!input) return;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        action();
        if (typeof close === 'function') close();
      }
    });
  }

  addEnterKeyForModal(elements.profileModal, saveProfile);
  addEnterKeyForModal(elements.adminModal, deleteAllMessages, closeAdminModal);

  /* ---------- Socket.IO: 接続管理 ---------- */
  function joinRoom() {
    if (!socket) return;
    socket.emit('joinRoom', { roomId });
  }

  function createSocket() {
    socket = io(SERVER_URL, { auth: { token: myToken || '' } });

    socket.on('connect', () => {
      setConnectionState('online');
      joinRoom();
    });

    socket.on('disconnect', () => setConnectionState('offline'));

    socket.io.on('reconnect_attempt', () => {
      if (socket) socket.auth = { token: myToken || '' };
      setConnectionState('connecting');
    });

    socket.on('newMessage', msg => {
      messages.push(msg);
      elements.messageList?.appendChild(createMessage(msg));
      if (isAutoScroll) scrollBottom(true);
    });

    socket.on('clearMessages', () => {
      messages = [];
      if (elements.messageList) elements.messageList.innerHTML = '';
    });

    socket.on('toast', data => {
      if (!data || typeof data !== 'object') return;
      const { message } = data;
      if (!message) return;
      showToastserver(message);
    });

    socket.on('roomUserCount', count => {
      if (typeof count === 'number' && elements.onlineUserCount) {
        elements.onlineUserCount.textContent = `${count}`;
      }
    });

    socket.on('joinedRoom', () => {
      loadHistory();
      focusInput();
    });

    socket.on('connect_error', err => {
      console.warn('connect_error', err);
      if (err && /Authentication|Invalid token|Authentication required/i.test(String(err.message || ''))) {
        myToken = null;
        localStorage.removeItem('chatToken');
        obtainToken()
          .then(() => {
            if (socket) {
              socket.auth = { token: myToken || '' };
              socket.connect();
            } else {
              createSocket();
            }
          })
          .catch(() => openProfileModal());
      }
    });
  }

  async function startConnection() {
    if (!myToken) await obtainToken();
    if (!socket) createSocket();
    else if (!socket.connected) {
      socket.auth = { token: myToken || '' };
      socket.connect();
    }
  }

  /* ---------- イベント登録 ---------- */
  elements.sendMessageButton?.addEventListener('click', () => sendMessage());

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
  elements.clearMessagesButton?.addEventListener('click', () => {
    deleteAllMessages();
    closeAdminModal();
  });

  /* ---------- ルーム切替 ---------- */
  function changeChatRoom(newRoom) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) {
      showToast('ルーム名は英数字・一部記号32文字以内で指定してください');
      return;
    }
    if (newRoom === roomId) return;
    location.href = `/room/${encodeURIComponent(newRoom)}`;
  }

  elements.joinRoomButton?.addEventListener('click', () => changeChatRoom(elements.roomIdInput.value.trim()));

  elements.chatContainer?.addEventListener('scroll', () => {
    isAutoScroll = isScrolledToBottom();
  });

  /* ---------- 初期処理 ---------- */
  (async () => {
    try {
      if (myToken) {
        startConnection().catch(() => {});
      } else if (myName) {
        try {
          await obtainToken();
          startConnection().catch(() => {});
        } catch (e) {
          openProfileModal();
        }
      } else {
        openProfileModal();
      }

      if (pendingMessage && myToken) {
        const pm = pendingMessage;
        pendingMessage = null;
        sendMessage(pm);
      }
    } catch (e) {
      console.warn('initialization error', e);
    }
  })();
});
