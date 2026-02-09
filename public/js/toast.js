import { elements } from './dom.js';
import { state } from './state.js';

export function showToast(text, duration = 1800) {
  if (state.isServerToastActive) return;

  const toast = elements.toastNotification;
  if (!toast) return;

  toast.textContent = text;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.classList.add('show');

  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

export function showServerToast(text, duration = 1800) {
  const toast = elements.toastNotification;
  if (!toast) return;

  state.isServerToastActive = true;

  toast.textContent = text;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.classList.add('show');

  clearTimeout(showServerToast._t);
  showServerToast._t = setTimeout(() => {
    toast.classList.remove('show');
    state.isServerToastActive = false;
  }, duration);
}
