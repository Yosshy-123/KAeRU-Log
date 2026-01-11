(() => {
	/* ---------- 初期設定 ---------- */
	const SERVER_URL = window.location.origin.replace(/\/$/, ''); // サーバーのURLを定義
	const path = location.pathname.split('/').filter(Boolean);
	let roomId = path[1];

	if (path[0] !== 'room' || !roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
		location.replace('/room/open');
		return;
	}

	const socket = io(SERVER_URL);

	/* ---------- 状態 ---------- */
	let messages = [];
	let myToken = localStorage.getItem('chatToken') || '';
	let myName = localStorage.getItem('chat_username') || '';
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
		chatContainer: document.querySelector('main'),
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

	function showToastMessage(text, ms = 1800) {
		if (!elements.toastNotification) return;

		elements.toastNotification.textContent = text;
		elements.toastNotification.classList.add('show');

		clearTimeout(showToastMessage._t);
		showToastMessage._t = setTimeout(() => {
			elements.toastNotification.classList.remove('show');
		}, ms);
	}

	function isScrolledToBottom() {
		const c = elements.chatContainer || document.documentElement;
		return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
	}

	function scrollChatToBottom(smooth = true) {
		const c = elements.chatContainer || document.documentElement;
		c.scrollTo({
			top: c.scrollHeight,
			behavior: smooth ? 'smooth' : 'auto'
		});
	}

	function getUserInitials(name) {
		if (!name) return '?';
		return name
			.trim()
			.split(/\s+/)
			.map(p => p[0] || '')
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function focusMessageInput(elm = elements.messageTextarea) {
		if (!elm) return;

		elm.focus();
		elm.scrollIntoView({ behavior: 'smooth', block: 'center' });

		if (elm.value !== undefined) {
			const val = elm.value;
			elm.value = '';
			elm.value = val;
		}
	}

	/* ---------- メッセージ描画 ---------- */
	function createMessageElement(msg) {
		const isSelf = msg.seed === mySeed;

		const wrap = document.createElement('div');
		wrap.className = `message-item${isSelf ? ' is-self' : ''}`;

		const avatar = document.createElement('div');
		avatar.className = 'message-avatar';
		avatar.textContent = getUserInitials(msg.username);

		const bubble = document.createElement('div');
		bubble.className = 'message-bubble';

		const meta = document.createElement('div');
		meta.className = 'message-meta';

		const nameEl = document.createElement('span');
		nameEl.className = 'message-username';
		nameEl.textContent = msg.username || '匿名';

		const dot = document.createElement('span');
		dot.textContent = '•';
		dot.style.opacity = '0.6';

		const timeEl = document.createElement('span');
		timeEl.textContent = msg.time || '';

		meta.append(nameEl, dot, timeEl);

		const textEl = document.createElement('div');
		textEl.className = 'message-text';
		textEl.innerHTML = msg.message || '';

		bubble.append(meta, textEl);
		wrap.append(avatar, bubble);

		return wrap;
	}

	/* ---------- API ---------- */
	async function loadMessageHistory() {
		try {
			const res = await fetch(
				`${SERVER_URL}/api/messages/${encodeURIComponent(roomId)}`,
				{ cache: 'no-store' }
			);
			if (!res.ok) throw 0;

			messages = await res.json();

			if (elements.messageList) {
				elements.messageList.innerHTML = '';
				messages.forEach(msg =>
					elements.messageList.appendChild(createMessageElement(msg))
				);
			}

			if (isAutoScroll) scrollChatToBottom(false);
		} catch {
			showToastMessage('メッセージ取得に失敗しました');
		}
	}

	async function sendChatMessage() {
		const text = (elements.messageTextarea?.value || '').trim();
		if (!text) return;

		if (!myName) {
			elements.profileModal?.classList.add('show');
			showToastMessage('ユーザー名を設定してください');
			return;
		}

		const payload = {
			username: myName,
			message: text,
			token: myToken,
			seed: mySeed,
			roomId
		};

		if (!myToken) {
			if (socket?.connected) {
				pendingMessage = payload;
				socket.emit('authenticate', { token: '', username: myName || '' });
				showToastMessage('トークンを再取得しています...');
				return;
			}
			showToastMessage('再接続してください');
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

					if (socket?.connected) {
						socket.emit('authenticate', { token: '', username: myName || '' });
						showToastMessage('トークンを再取得しています...');
						return;
					}
					showToastMessage('認証エラーのため送信できませんでした');
				} else {
					showToastMessage(data.error || '送信に失敗しました');
				}
				return;
			}

			if (elements.messageTextarea) elements.messageTextarea.value = '';
		} catch (e) {
			console.error(e);
			showToastMessage('送信に失敗しました');
		}
	}

	/* ---------- モーダル ---------- */
	function openProfileModal() {
		if (elements.profileNameInput) {
			elements.profileNameInput.value = myName || '';
		}
		elements.profileModal?.classList.add('show');
		focusMessageInput(elements.profileNameInput);
	}

	function closeProfileModal() {
		elements.profileModal?.classList.remove('show');
	}

	function openAdminModal() {
		if (elements.adminPasswordInput) elements.adminPasswordInput.value = '';
		elements.adminModal?.classList.add('show');
		focusMessageInput(elements.adminPasswordInput);
	}

	function closeAdminModal() {
		elements.adminModal?.classList.remove('show');
	}

	/* ---------- 管理操作 ---------- */
	async function deleteAllMessages() {
		const password = elements.adminPasswordInput?.value || '';
		if (!password) {
			showToastMessage('パスワードを入力してください');
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
				showToastMessage(data.error || '削除に失敗しました');
				return;
			}

			closeAdminModal();
			focusMessageInput();
		} catch {
			showToastMessage('削除に失敗しました');
		}
	}

	/* ---------- イベント登録 ---------- */
	if (elements.sendMessageButton) {
		elements.sendMessageButton.addEventListener('click', sendChatMessage);
	}

	if (elements.messageTextarea) {
		const isMobileLike = window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches;

		elements.messageTextarea.addEventListener('keydown', e => {
			if (!isMobileLike && e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendChatMessage();
			}
		});
	}

	elements.openProfileButton?.addEventListener('click', openProfileModal);
	elements.closeProfileButton?.addEventListener('click', () => {
		closeProfileModal();
		focusMessageInput();
	});

	elements.saveProfileButton?.addEventListener('click', () => {
		const v = (elements.profileNameInput?.value || '').trim().slice(0, 24);
		if (!v) {
			showToastMessage('ユーザー名は1〜24文字で設定してください');
			return;
		}
		myName = v;
		localStorage.setItem('chat_username', myName);
		if (elements.currentUsernameLabel) elements.currentUsernameLabel.textContent = myName;
		closeProfileModal();
		showToastMessage('プロフィールを保存しました');
		focusMessageInput();
	});

	elements.openAdminButton?.addEventListener('click', openAdminModal);
	elements.closeAdminButton?.addEventListener('click', () => {
		closeAdminModal();
		focusMessageInput();
	});
	elements.clearMessagesButton?.addEventListener('click', deleteAllMessages);

	elements.chatContainer?.addEventListener('scroll', () => {
		isAutoScroll = isScrolledToBottom();
	});

	/* ---------- Socket.IO ---------- */
	function joinRoom() {
		socket.emit('joinRoom', { roomId });
	}

	socket.on('connect', () => {
		if (elements.connectionText) elements.connectionText.textContent = 'オンライン';
		elements.connectionIndicator?.classList.remove('offline');
		elements.connectionIndicator?.classList.add('online');

		socket.emit('authenticate', {
			token: myToken || '',
			username: myName || ''
		});
	});

	socket.on('reconnect', () => {
		socket.emit('authenticate', {
			token: myToken || '',
			username: myName || ''
		});
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

		const msgToResend = { ...pendingMessage, token: myToken };
		pendingMessage = null;

		(async () => {
			try {
				const res = await fetch(`${SERVER_URL}/api/messages`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(msgToResend)
				});

				if (res.ok) {
					if (elements.messageTextarea) elements.messageTextarea.value = '';
				} else {
					const data = await res.json().catch(() => ({}));
				}
			} catch (e) {
				console.error('resend error', e);
			}
		})();
	});

	socket.on('newMessage', msg => {
		messages.push(msg);
		elements.messageList?.appendChild(createMessageElement(msg));
		if (isAutoScroll) scrollChatToBottom(true);
	});

	socket.on('authenticated', () => {
		isSocketAuthenticated = true;
		joinRoom();
	});

	socket.on('clearMessages', () => {
		messages = [];
		if (elements.messageList) elements.messageList.innerHTML = '';
		showToastMessage('全メッセージ削除されました');
	});

	socket.on('notify', data => {
		const msg = typeof data === 'string' ? data : data?.message;
		if (msg) showToastMessage(msg);
	});

	socket.on('roomUserCount', count => {
		if (typeof count === 'number' && elements.onlineUserCount) {
			elements.onlineUserCount.textContent = `オンライン: ${count}`;
		}
	});

	socket.on('joinedRoom', () => {
		loadMessageHistory();
		focusMessageInput();
	});

	/* ---------- ルーム移動 ---------- */
	function changeChatRoom(newRoom) {
		if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newRoom)) {
			showToastMessage('ルーム名は英数字・一部記号32文字以内で指定してください');
			return;
		}
		if (newRoom === roomId) return;
		location.href = `/room/${encodeURIComponent(newRoom)}`;
	}

	elements.joinRoomButton?.addEventListener('click', () => {
		changeChatRoom(elements.roomIdInput.value.trim());
	});

	if (elements.roomIdInput) {
		elements.roomIdInput.addEventListener('keydown', e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				elements.joinRoomButton?.click();
			}
		});
		elements.roomIdInput.value = roomId;
	}
})();
