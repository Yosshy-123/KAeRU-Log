import { formatMessageTime, getInitials } from './utils.js';

export function createMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'message-item';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble message-tile';
  if (msg.admin === true) bubble.classList.add('admin');

  const topRow = document.createElement('div');
  topRow.className = 'message-tile-top';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar message-icon';
  avatar.textContent = getInitials(msg.username);

  const meta = document.createElement('div');
  meta.className = 'message-meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'message-username';
  nameEl.textContent = msg.username;

  if (msg.admin === true) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = '管理者';
    nameEl.appendChild(badge);
  }

  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  timeEl.textContent = formatMessageTime(msg.time);

  meta.append(nameEl, timeEl);

  const text = document.createElement('div');
  text.className = 'message-text';
  text.textContent = msg.message;

  topRow.append(avatar, meta);
  bubble.append(topRow, text);
  wrap.append(bubble);

  return wrap;
}