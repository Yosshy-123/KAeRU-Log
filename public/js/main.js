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
    joinRoomButton: document.getElementById('joinRoomButton'),

    mobileOpenProfile: document.getElementById('mobileOpenProfile'),
    mobileOpenAdmin: document.getElementById('mobileOpenAdmin'),
    mobileMenu: document.getElementById('mobileMenu'),
    mobileMenuClose: document.getElementById('mobileMenuClose'),
    mobileMenuOverlay: document.getElementById('mobileMenuOverlay'),
    roomIdInputMobile: document.getElementById('roomIdInputMobile'),
    joinRoomButtonMobile: document.getElementById('joinRoomButtonMobile'),
    menuToggleButton: document.getElementById('menuToggleButton')
  };

  if (elements.currentUsernameLabel) {
    elements.currentUsernameLabel.textContent = myName || '未設定';
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

  function showToast(text, duration = 1800) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;

    toast.textContent = text;
    toast.classList.remove('opacity-0', 'scale-90');
    toast.classList.add('opacity-100', 'scale-100');

    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('opacity-100', 'scale-100');
      toast.classList.add('opacity-0', 'scale-90');
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

  /* ---------- メッセージ描画 ---------- */
  function createMessage(msg) {
    const self = msg.seed === mySeed;

    const wrap = document.createElement('div');
    wrap.className = `flex items-start gap-3 ${self ? 'justify-end' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center font-semibold text-sm text-slate-700';
    avatar.textContent = getInitials(msg.username);

    const bubble = document.createElement('div');
    bubble.className = 'rounded-xl p-3 bg-white shadow max-w-[70%]';

    const meta = document.createElement('div');
    meta.className = 'flex items-center gap-2 text-xs text-slate-500 mb-1';

    const nameEl = document.createElement('span');
    nameEl.className = 'font-semibold';
    nameEl.textContent = msg.username || '匿名';

    const dot = document.createElement('span');
    dot.textContent = '•';
    dot.style.opacity = '0.6';

    const timeEl = document.createElement('span');
    timeEl.textContent = msg.time || '';

    meta.append(nameEl, dot, timeEl);

    const text = document.createElement('div');
    text.className = 'text-sm text-slate-800 whitespace-pre-wrap';
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
    } catch {
      showToast('メッセージ取得に失敗しました');
    }
  }

  async function sendMessage() {
    const text = elements.messageTextarea?.value.trim();
    if (!text) return;

    if (!myName) {
      showToast('ユーザー名を設定してください');
      openProfileModal();
      return;
    }

    const payload = { roomId, username: myName, message: text, seed: mySeed, token: myToken };

    if (!myToken) {
      if (socket?.connected) {
        pendingMessage = payload;
        socket.emit('authenticate', { token: '', username: myName });
        showToast('トークンを再取得しています...');
        return;
      }
      showToast('再接続してください');
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          myToken = '';
          localStorage.removeItem('chatToken');
          pendingMessage = payload;
          if (socket?.connected) socket.emit('authenticate', { token: '', username: myName });
          showToast('認証エラーのため送信できませんでした');
        } else {
          showToast(data.error || '送信に失敗しました');
        }
        return;
      }
      if (elements.messageTextarea) elements.messageTextarea.value = '';
      focusInput();
    } catch (e) {
      console.error(e);
      showToast('送信に失敗しました');
    }
  }

  /* ---------- モーダル ---------- */
  function openProfileModal() {
    if (elements.profileNameInput) elements.profileNameInput.value = myName || '';
    elements.profileModal?.classList.add('flex');
    elements.profileModal?.classList.remove('hidden');
    focusInput(elements.profileNameInput);
  }

  function closeProfileModal() {
    elements.profileModal?.classList.add('hidden');
    elements.profileModal?.classList.remove('flex');
  }

  function openAdminModal() {
    if (elements.adminPasswordInput) elements.adminPasswordInput.value = '';
    elements.adminModal?.classList.add('flex');
    elements.adminModal?.classList.remove('hidden');
    focusInput(elements.adminPasswordInput);
  }

  function closeAdminModal() {
    elements.adminModal?.classList.add('hidden');
    elements.adminModal?.classList.remove('flex');
  }

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
      if (!res.ok) {
        showToast(data.error || '削除に失敗しました');
        return;
      }
      closeAdminModal();
      focusInput();
    } catch {
      showToast('削除に失敗しました');
    }
  }

  /* ---------- Socket.IO ---------- */
  function joinRoom() {
    socket.emit('joinRoom', { roomId });
  }

  socket.on('connect', () => {
    if (elements.connectionText) elements.connectionText.textContent = 'オンライン';
    elements.connectionIndicator?.classList.remove('offline');
    elements.connectionIndicator?.classList.add('online');
    socket.emit('authenticate', { token: myToken || '', username: myName || '' });
  });

  socket.on('reconnect', () => {
    socket.emit('authenticate', { token: myToken || '', username: myName || '' });
  });

  socket.on('disconnect', () => {
    isSocketAuthenticated = false;
    if (elements.connectionText) elements.connectionText.textContent = '切断';
    elements.connectionIndicator?.classList.remove('online');
    elements.connectionIndicator?.classList.add('offline');
  });

  socket.on('assignToken', token => {
    myToken = token;
    localStorage.setItem('chatToken', token);
    if (!pendingMessage) return;
    const resend = { ...pendingMessage, token: myToken };
    pendingMessage = null;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resend)
        });
        if (res.ok && elements.messageTextarea) elements.messageTextarea.value = '';
      } catch (e) {
        console.error('resend error', e);
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
    showToast('全メッセージ削除されました');
  });

  socket.on('notify', data => {
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

  // プロフィール・管理モーダル
  elements.openProfileButton?.addEventListener('click', openProfileModal);
  elements.closeProfileButton?.addEventListener('click', () => { closeProfileModal(); focusInput(); });
  elements.saveProfileButton?.addEventListener('click', () => {
    const v = (elements.profileNameInput?.value || '').trim().slice(0, 24);
    if (!v) { showToast('ユーザー名は1〜24文字で設定してください'); return; }
    myName = v;
    localStorage.setItem('chat_username', myName);
    if (elements.currentUsernameLabel) elements.currentUsernameLabel.textContent = myName;
    closeProfileModal();
    showToast('プロフィールを保存しました');
    focusInput();
  });

  elements.openAdminButton?.addEventListener('click', openAdminModal);
  elements.closeAdminButton?.addEventListener('click', () => { closeAdminModal(); focusInput(); });
  elements.clearMessagesButton?.addEventListener('click', deleteAllMessages);

  // モバイル用
  elements.mobileOpenProfile?.addEventListener('click', openProfileModal);
  elements.mobileOpenAdmin?.addEventListener('click', openAdminModal);
  elements.menuToggleButton?.addEventListener('click', () => {
    elements.mobileMenu?.classList.remove('translate-x-full');
    elements.mobileMenuOverlay?.classList.remove('hidden');
  });
  elements.mobileMenuClose?.addEventListener('click', () => {
    elements.mobileMenu?.classList.add('translate-x-full');
    elements.mobileMenuOverlay?.classList.add('hidden');
  });
  elements.mobileMenuOverlay?.addEventListener('click', () => {
    elements.mobileMenu?.classList.add('translate-x-full');
    elements.mobileMenuOverlay?.classList.add('hidden');
  });
  elements.joinRoomButtonMobile?.addEventListener('click', () =>
    changeChatRoom(elements.roomIdInputMobile?.value.trim())
  );

  elements.chatContainer?.addEventListener('scroll', () => {
    isAutoScroll = isScrolledToBottom();
  });

  /* ---------- ルーム移動 ---------- */
  function changeChatRoom(newRoom) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) {
      showToast('ルーム名は英数字・一部記号32文字以内で指定してください');
      return;
    }
    if (newRoom === roomId) return;
    location.href = `/room/${encodeURIComponent(newRoom)}`;
  }

  elements.joinRoomButton?.addEventListener('click', () => changeChatRoom(elements.roomIdInput.value.trim()));
  if (elements.roomIdInput) {
    elements.roomIdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); elements.joinRoomButton?.click(); }
    });
    elements.roomIdInput.value = roomId;
  }
  if (elements.roomIdInputMobile) elements.roomIdInputMobile.value = roomId;
});
