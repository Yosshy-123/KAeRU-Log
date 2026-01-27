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
  let myToken = localStorage.getItem('chatToken') || '';
  let myName = localStorage.getItem('chat_username') || '';
  let mySeed = localStorage.getItem('chat_seed');
  let isAutoScroll = true;
  let pendingMessage = null;
  let activeModal = null;
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
    elements.roomIdInput.value = roomId;
    elements.roomIdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') changeChatRoom(elements.roomIdInput.value.trim());
    });
  }

  function generateUserSeed(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, i => chars[i % chars.length]).join('');
  }

  function showToast(msg, duration = 1800) {
    const toast = elements.toastNotification;
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function createMessage(msg) {
    const self = msg.seed === mySeed;
    const wrap = document.createElement('div');
    wrap.className = 'message-item' + (self ? ' is-self' : '');
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = (msg.username || '?').slice(0, 2).toUpperCase();
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

  async function obtainToken() {
    if (!myName) myName = '';
    const res = await fetch(`${SERVER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myName })
    });
    if (!res.ok) throw new Error('auth failed');
    const data = await res.json();
    if (data.token) {
      myToken = data.token;
      localStorage.setItem('chatToken', myToken);
      return myToken;
    }
    throw new Error('invalid auth response');
  }

  async function fetchWithAuth(url, opts = {}) {
    if (!opts.headers) opts.headers = {};
    if (myToken) opts.headers['Authorization'] = `Bearer ${myToken}`;
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
      myToken = null;
      localStorage.removeItem('chatToken');
      await obtainToken();
      opts.headers['Authorization'] = `Bearer ${myToken}`;
      return fetch(url, opts);
    }
    return res;
  }

  async function loadHistory() {
    try {
      const res = await fetchWithAuth(`${SERVER_URL}/api/messages/${encodeURIComponent(roomId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      messages = await res.json();
      if (elements.messageList) {
        elements.messageList.innerHTML = '';
        messages.forEach(m => elements.messageList.appendChild(createMessage(m)));
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async function sendMessage() {
    if (!elements.messageTextarea) return;
    const text = elements.messageTextarea.value.trim();
    if (!text) return;
    elements.sendMessageButton.disabled = true;
    try {
      const payload = { roomId, message: text, seed: mySeed };
      const res = await fetchWithAuth(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) showToast('送信失敗');
      else elements.messageTextarea.value = '';
    } catch (e) {
      console.error(e);
      showToast('通信エラー');
    } finally {
      elements.sendMessageButton.disabled = false;
    }
  }

  function createSocket() {
    socket = io(SERVER_URL, { auth: { token: myToken }, transports: ['websocket'] });
    socket.on('connect', () => {
      socket.emit('joinRoom', { roomId });
    });
    socket.on('disconnect', () => setConnectionState('offline'));
    socket.on('newMessage', msg => {
      messages.push(msg);
      elements.messageList?.appendChild(createMessage(msg));
      if (isAutoScroll) elements.chatContainer.scrollTo({ top: elements.chatContainer.scrollHeight, behavior: 'smooth' });
    });
    socket.on('connect_error', async err => {
      console.warn('connect_error', err);
      if (/Authentication|Invalid token/i.test(err.message)) {
        myToken = null;
        localStorage.removeItem('chatToken');
        await obtainToken();
        if (socket) {
          socket.auth = { token: myToken };
          socket.disconnect();
          socket.connect();
        }
      }
    });
  }

  async function startConnection() {
    if (!myToken) await obtainToken();
    if (!socket) createSocket();
    else if (!socket.connected) {
      socket.auth = { token: myToken };
      socket.connect();
    }
  }

  function changeChatRoom(newRoom) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) return;
    if (newRoom === roomId) return;
    location.href = `/room/${encodeURIComponent(newRoom)}`;
  }

  elements.sendMessageButton?.addEventListener('click', sendMessage);
  elements.joinRoomButton?.addEventListener('click', () => changeChatRoom(elements.roomIdInput.value.trim()));

  (async () => {
    try {
      await startConnection();
      await loadHistory();
    } catch (e) {
      console.warn(e);
    }
  })();
});
