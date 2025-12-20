(async () => {
			const socket = io();
			let seed = localStorage.getItem('chat_seed');
			if (!seed) {
				const res = await fetch('/api/register', {
					method: 'POST'
				}).then(r => r.json());
				seed = res.seed;
				localStorage.setItem('chat_seed', seed);
			}
			let username = localStorage.getItem('chat_username') || '';
			const el = {
				messages: document.getElementById('messages'),
				input: document.getElementById('messageInput'),
				send: document.getElementById('sendBtn'),
				editUserBtn: document.getElementById('editUserBtn'),
				userModal: document.getElementById('userModal'),
				usernameInput: document.getElementById('usernameInput'),
				saveUsernameBtn: document.getElementById('saveUsernameBtn'),
				closeUserModalBtn: document.getElementById('closeUserModalBtn'),
				adminModal: document.getElementById('adminModal'),
				openAdminBtn: document.getElementById('openAdminBtn'),
				closeAdminModalBtn: document.getElementById('closeAdminModalBtn'),
				adminPassword: document.getElementById('adminPassword'),
				clearAllBtn: document.getElementById('clearAllBtn'),
				userCount: document.getElementById('userCount'),
				scrollContainer: document.querySelector('main')
			};
			const newBtn = document.createElement('button');
			newBtn.className = 'new-msg-btn';
			newBtn.type = 'button';
			newBtn.textContent = '新着メッセージ';
			document.body.appendChild(newBtn);
			let unseen = 0;

			function isNearBottom() {
				const sc = el.scrollContainer;
				return sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
			}

			function showNewButton() {
				unseen++;
				newBtn.textContent = `新着メッセージ (${unseen})`;
				newBtn.classList.add('show');
			}

			function hideNewButton() {
				unseen = 0;
				newBtn.classList.remove('show');
				newBtn.textContent = '新着メッセージ';
			}
			newBtn.addEventListener('click', () => {
				el.scrollContainer.scrollTo({
					top: el.scrollContainer.scrollHeight,
					behavior: 'smooth'
				});
				hideNewButton();
			});

			function showUserModal() {
				el.usernameInput.value = username;
				el.userModal.classList.add('show');
			}

			function hideUserModal() {
				el.userModal.classList.remove('show');
			}

			function showAdminModal() {
				el.adminPassword.value = '';
				el.adminModal.classList.add('show');
			}

			function hideAdminModal() {
				el.adminModal.classList.remove('show');
			}
			el.editUserBtn.addEventListener('click', showUserModal);
			el.closeUserModalBtn.addEventListener('click', hideUserModal);
			el.saveUsernameBtn.addEventListener('click', async () => {
				username = el.usernameInput.value.trim().slice(0, 24);
				if (username === '') return;
				await fetch('/api/username', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						seed,
						username
					})
				});
				localStorage.setItem('chat_username', username);
				hideUserModal();
				fetchMessages();
			});
			el.openAdminBtn.addEventListener('click', showAdminModal);
			el.closeAdminModalBtn.addEventListener('click', hideAdminModal);
			el.clearAllBtn.addEventListener('click', async () => {
				await fetch('/api/pass', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						password: el.adminPassword.value
					})
				});
				hideAdminModal();
			});
			el.scrollContainer.addEventListener('scroll', () => {
				if (isNearBottom()) hideNewButton();
			});
			async function fetchMessages() {
				const msgs = await fetch('/api/messages').then(r => r.json());
				el.messages.innerHTML = '';
				msgs.forEach((m, i) => {
					const div = document.createElement('div');
					div.className = 'msg' + (m.seed === seed ? ' self' : '');
					const bubble = document.createElement('div');
					bubble.className = 'bubble';
					bubble.textContent = `[${m.time}] ${m.username}: ${m.message}`;
					if (el.adminPassword.value) {
						const btn = document.createElement('button');
						btn.className = 'delete-btn';
						btn.textContent = '×';
						btn.addEventListener('click', async () => {
							await fetch('/api/pass', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									password: el.adminPassword.value,
									messageId: i
								})
							});
						});
						div.appendChild(btn);
					}
					div.appendChild(bubble);
					el.messages.appendChild(div);
				});
				el.scrollContainer.scrollTo({
					top: el.scrollContainer.scrollHeight,
					behavior: 'auto'
				});
				hideNewButton();
			}
			socket.on('newMessage', m => {
				const near = isNearBottom();
				const div = document.createElement('div');
				div.className = 'msg' + (m.seed === seed ? ' self' : '');
				const bubble = document.createElement('div');
				bubble.className = 'bubble';
				bubble.textContent = `[${m.time}] ${m.username}: ${m.message}`;
				div.appendChild(bubble);
				el.messages.appendChild(div);
				if (near) {
					el.scrollContainer.scrollTo({
						top: el.scrollContainer.scrollHeight,
						behavior: 'smooth'
					});
					hideNewButton();
				} else {
					showNewButton();
				}
			});
			socket.on('clearMessages', () => {
				fetchMessages();
			});
			socket.on('userCount', n => el.userCount.textContent = n);
			fetchMessages();
			el.send.addEventListener('click', async () => {
				const msg = el.input.value.trim();
				if (!msg) return;
				const time = new Date().toLocaleString();
				await fetch('/api/messages', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						seed,
						message: msg,
						time,
						username
					})
				});
				el.input.value = '';
				el.scrollContainer.scrollTo({
					top: el.scrollContainer.scrollHeight,
					behavior: 'smooth'
				});
				hideNewButton();
			});
			el.input.addEventListener('keydown', e => {
						if (e.key === 'Enter' && !e.shiftKey '){ e.preventDefault(); el.send.click(); } });
						})();
