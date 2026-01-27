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

  if (!mySeed) {
    mySeed = Array.from({ length: 40 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
    localStorage.setItem('chat_seed', mySeed);
  }

  const elements = {
    chatContainer: document.querySelector('main') || document.documentElement,
    messageList: document.getElementById('messageList'),
    messageTextarea: document.getElementById('messageTextarea'),
    sendMessageButton: document.getElementById('sendMessageButton'),
    toastNotification: document.getElementById('toastNotification')
  };

  function showToast(text, duration = 1800) {
    const toast = elements.toastNotification;
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function focusInput(target = elements.messageTextarea) {
    if (!target) return;
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function createMessage(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'message-item' + (msg.seed === mySeed ? ' is-self' : '');
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = (msg.username || '匿名')[0].toUpperCase();
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<div class="message-username">${msg.username || '匿名'}</div><span>•</span><span class="message-time">${msg.time || ''}</span>`;
    const text = document.createElement('div');
    text.className = 'message-text';
    text.innerHTML = msg.message || '';
    bubble.append(meta, text);
    wrap.append(avatar, bubble);
    return wrap;
  }

  async function obtainToken() {
    if (myToken) return myToken;
    if (!myName) myName = 'guest-' + Math.random().toString(36).slice(2, 8);
    const res = await fetch(`${SERVER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myName })
    });
    if (!res.ok) throw new Error('認証失敗');
    const data = await res.json();
    myToken = data.token;
    myName = data.username;
    localStorage.setItem('chatToken', myToken);
    localStorage.setItem('chat_username', myName);
    return myToken;
  }

  async function fetchWithAuth(url, opts = {}, retry = true) {
    if (!opts.headers) opts.headers = {};
    if (myToken) opts.headers['Authorization'] = `Bearer ${myToken}`;
    const res = await fetch(url, opts);
    if ((res.status === 401 || res.status === 403) && retry) {
      myToken = null;
      localStorage.removeItem('chatToken');
      await obtainToken();
      opts.headers['Authorization'] = `Bearer ${myToken}`;
      return fetchWithAuth(url, opts, false);
    }
    return res;
  }

  async function sendMessage() {
    const text = elements.messageTextarea?.value.trim();
    if (!text) return;
    elements.sendMessageButton.disabled = true;
    elements.sendMessageButton.textContent = '送信中…';
    try {
      if (!myToken) await obtainToken();
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
      elements.sendMessageButton.textContent = '送信';
    }
  }

  function createSocket() {
    socket = io(SERVER_URL, { auth: { token: myToken }, transports: ['websocket'] });
    socket.on('connect', () => socket.emit('joinRoom', { roomId }));
    socket.on('newMessage', msg => {
      messages.push(msg);
      elements.messageList?.appendChild(createMessage(msg));
      if (isAutoScroll) elements.chatContainer.scrollTo({ top: elements.chatContainer.scrollHeight, behavior: 'smooth' });
    });
  }

  elements.sendMessageButton?.addEventListener('click', sendMessage);
  elements.messageTextarea?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  (async () => {
    await obtainToken();
    createSocket();
  })();
});
