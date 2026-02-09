import { state } from './state.js';
import { elements } from './dom.js';
import { focusInput, selectAll } from './utils.js';

export function openModal(modal) {
  if (!modal) return;
  if (state.activeModal && state.activeModal !== modal) closeModal(state.activeModal);

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  state.activeModal = modal;

  const input = modal.querySelector('input, textarea, button');
  input?.focus();

  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal(modal);
  };

  modal._escHandler = escHandler;
  document.addEventListener('keydown', escHandler);
}

export function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', modal._escHandler);

  if (state.activeModal === modal) state.activeModal = null;
  focusInput();
}

export function openProfileModal() {
  if (elements.profileNameInput) elements.profileNameInput.value = state.myName || '';
  openModal(elements.profileModal);
  selectAll(elements.profileNameInput);
}

export function closeProfileModal() {
  closeModal(elements.profileModal);
}

export function openAdminModal() {
  if (elements.adminPasswordInput) elements.adminPasswordInput.value = '';
  openModal(elements.adminModal);
  focusInput(elements.adminPasswordInput);
}

export function closeAdminModal() {
  closeModal(elements.adminModal);
}

export function addEnterKeyForModal(modal, action, closeAfter) {
  if (!modal) return;

  const input = modal.querySelector('input, textarea');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
      if (typeof closeAfter === 'function') closeAfter();
    }
  });
}
