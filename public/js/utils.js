import { elements } from './dom.js';

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function selectAll(input) {
  if (!input) return;
  setTimeout(() => input.select(), 0);
}

export function focusInput(target = elements.messageTextarea) {
  if (!target) return;
  target.focus();

  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if ('setSelectionRange' in target && typeof target.value === 'string') {
    const end = target.value.length;
    try {
      target.setSelectionRange(end, end);
    } catch {
      // ignore unsupported input types
    }
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
  const s = String(name ?? '').trim();
  if (!s) return '?';

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return seg.segment(s).containing(0)?.segment ?? '?';
  }

  return Array.from(s)[0] ?? '?';
}

export function formatMessageTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('/') + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
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
      el.setAttribute('aria-label', '接続中...');
      if (elements.connectionText) elements.connectionText.textContent = '接続中...';
  }
}
