import { state } from './state.js';
import { getInitials } from './utils.js';

export function createMessage(msg) {
  const self = msg.seed === state.mySeed;

  const wrap = document.createElement('div');
  wrap.className = 'message-item' + (self ? ' is-self' : '');

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = getInitials(msg.username);

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  if (msg.admin === true) bubble.classList.add('admin');

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

  const dot = document.createElement('span');
  dot.textContent = '•';
  dot.style.opacity = '0.6';

  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  timeEl.textContent = msg.time;

  meta.append(nameEl, dot, timeEl);

  const text = document.createElement('div');
  text.className = 'message-text';
  text.textContent = msg.message;

  bubble.append(meta, text);
  wrap.append(avatar, bubble);

  return wrap;
}