import { elements } from './dom.js';
import { state } from './state.js';

export function generateUserSeed(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  let s = '';
  for (let i = 0; i < length; i++) s += chars[array[i] % chars.length];
  return s;
}

export function selectAll(input) {
  if (!input) return;
  setTimeout(() => input.select(), 0);
}

export function focusInput(target = elements.messageTextarea) {
  if (!target) return;
  target.focus();
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if ('value' in target) {
    const v = target.value;
    target.value = '';
    target.value = v;
  }
}

export function isScrolledToBottom() {
  const c = elements.chatContainer || document.documentElement;
  return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
}

export function scrollBottom(smooth = true) {
  const c = elements.chatContainer || document.documentElement;
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

export function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((v) => (v[0] || '').toUpperCase())
    .join('')
    .slice(0, 2);
}

export function setConnectionState(stateName) {
  const el = elements.connectionIndicator;
  if (!el) return;

  el.classList.remove('online', 'offline');

  switch (stateName) {
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

export function validateRoomId(roomId) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(roomId);
}

export function validateUsername(username) {
  return (
    typeof username === 'string' &&
    username.trim().length >= 1 &&
    username.trim().length <= 15
  );
}