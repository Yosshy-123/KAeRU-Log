document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const SERVER_URL = window.location.origin.replace(/\/$/, '');
  const path = location.pathname.split('/').filter(Boolean);
  let roomId = path[1];

  if (path[0] !== 'room' || !roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
    location.replace('/room/general');
    return;
  }

  let socket = null;
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

  // ---------- ユーティリティ ----------
  function generateUserSeed(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint32Array(length);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(array);
    else for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 2 ** 32);
    let result = '';
    for (let i = 0; i < length; i++) result += chars[array[i] % chars.length];
    return result;
  }

  function selectAll(input) { if (!input) return; setTimeout(() => input.select(), 0); }

  function showToast(text, duration = 1800) {
    if (isServerToastActive) return;
    const toast = elements.toastNotification;
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function showToastserver(text, duration = 1800) {
    const toast = elements.toastNotification;
    if (!toast) return;
    isServerToastActive = true;
    toast.textContent = text;
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
    if ('value' in target) { const v = target.value; target.value = ''; target.value = v; }
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
    return name.trim().split(/\s+/).map(v => v[0] || '').join('').toUpperCase().slice(0, 2);
  }

  function setConnectionState(state) {
    const el = elements.connectionIndicator;
    if (!el) return;
    el.classList.remove('online', 'offline');
    switch (state) {
      case 'online': el.classList.add('online'); if (elements.connectionText) elements.connectionText.textContent = 'オンライン'; break;
      case 'offline': el.classList.add('offline'); if (elements.connectionText) elements.connectionText.textContent = '切断'; break;
      default: if (elements.connectionText) elements.connectionText.textContent = '接続中';
    }
  }

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
    dot.textContent = '•'; dot.style.opacity = '0.6';
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

  // ---------- API ----------
  async function fetchWithAuth(url, opts = {}, retry = true) {
    if (!opts.headers) opts.headers = {};
    if (myToken) opts.headers['Authorization'] = `Bearer ${myToken}`;
    let res;
    try { res = await fetch(url, opts); } catch (e) { console.error(e); throw e; }
    if ((res.status === 401 || res.status === 403) && retry) {
      myToken = null;
      localStorage.removeItem('chatToken');
      await obtainToken();
      opts.headers['Authorization'] = `Bearer ${myToken}`;
      return await fetchWithAuth(url, opts, false);
    }
    return res;
  }

  async function obtainToken() {
    if (myToken) return myToken;
    const res = await fetch(`${SERVER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myName || '' })
    });
    if (!res.ok) throw new Error('Auth failed');
    const data = await res.json();
    myToken = data.token;
    myName = data.username || myName;
    localStorage.setItem('chatToken', myToken);
    localStorage.setItem('chat_username', myName);
    return myToken;
  }

  async function sendMessage(overridePayload = null) {
    if (isSending) return;
    isSending = true;
    const btn = elements.sendMessageButton;
    const ta = elements.messageTextarea;
    if (!ta || !btn) { isSending = false; return; }
    const text = overridePayload?.message ?? ta.value.trim();
    if (!text) { isSending = false; return; }
    btn.disabled = true; btn.textContent = '送信中…';

    const payload = overridePayload ?? { roomId, message: text, seed: mySeed };
    try {
      if (!myToken) await obtainToken();
      const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${myToken}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { showToast('送信できません'); return; }
      if (!overridePayload) { ta.value = ''; focusInput(); }
    } catch (e) {
      console.error(e);
      showToast('通信エラー');
    } finally {
      btn.disabled = false; btn.textContent = '送信';
      isSending = false;
    }
  }

  // ---------- Socket ----------
  function joinRoom() { if (socket) socket.emit('joinRoom', { roomId }); }

  function createSocket() {
    if (socket && socket.connected) return;
    socket = io(SERVER_URL, { auth: { token: myToken } });
    socket.on('connect', () => { setConnectionState('online'); joinRoom(); });
    socket.on('disconnect', () => setConnectionState('offline'));
    socket.on('newMessage', msg => {
      messages.push(msg);
      elements.messageList?.appendChild(createMessage(msg));
      if (isAutoScroll) scrollBottom();
    });
    socket.on('clearMessages', () => { messages = []; if (elements.messageList) elements.messageList.innerHTML = ''; });
    socket.on('roomUserCount', count => { if (elements.onlineUserCount) elements.onlineUserCount.textContent = count; });
    socket.on('toast', data => { if (data?.message) showToastserver(data.message); });
  }

  async function startConnection() {
    if (!myToken) await obtainToken();
    if (!socket) createSocket();
    else if (!socket.connected) { socket.auth = { token: myToken }; socket.connect(); }
  }

  // ---------- DOM Event ----------
  elements.sendMessageButton?.addEventListener('click', () => sendMessage());
  elements.messageTextarea?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  elements.joinRoomButton?.addEventListener('click', () => changeChatRoom(elements.roomIdInput.value.trim()));

  // ---------- 初期処理 ----------
  (async () => {
    try {
      await obtainToken();
      await startConnection();
    } catch (e) {
      console.warn('initialization failed', e);
    }
  })();

  function changeChatRoom(newRoom) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) { showToast('ルーム名不正'); return; }
    if (newRoom === roomId) return;
    location.href = `/room/${encodeURIComponent(newRoom)}`;
  }
});
