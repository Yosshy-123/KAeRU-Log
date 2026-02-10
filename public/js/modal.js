import { state } from './state.js';
import { elements } from './dom.js';
import { focusInput, selectAll } from './utils.js';

export function openModal(modal) {
  if (!modal) return;

  if (state.activeModal && state.activeModal !== modal) {
    closeModal(state.activeModal);
  }

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  state.activeModal = modal;

  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal(modal);
  };

  modal._escHandler = escHandler;
  document.addEventListener('keydown', escHandler);

  const input = modal.querySelector('input, textarea, button');
  input?.focus();
}

export function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');

  if (modal._escHandler) {
    document.removeEventListener('keydown', modal._escHandler);
    modal._escHandler = null;
  }

  if (state.activeModal === modal) state.activeModal = null;

  focusInput();
}

export function openProfileModal() {
  if (elements.profileNameInput) {
    elements.profileNameInput.value = state.myName || '';
  }
  openModal(elements.profileModal);
  selectAll(elements.profileNameInput);
}

export function closeProfileModal() {
  closeModal(elements.profileModal);
}

/**
 * 管理モーダルUI切り替え
 */
export function refreshAdminModalUI() {
  if (!elements.adminModal) return;

  if (state.isAdmin) {
    elements.adminLoginSection?.classList.add('hidden');

    elements.adminPanelSection?.classList.remove('hidden');

    if (elements.adminModalTitle) {
      elements.adminModalTitle.textContent = '管理パネル';
    }

    elements.clearMessagesButton?.focus();
  } else {
    elements.adminLoginSection?.classList.remove('hidden');

    elements.adminPanelSection?.classList.add('hidden');

    if (elements.adminModalTitle) {
      elements.adminModalTitle.textContent = '管理者ログイン';
    }

    if (elements.adminPasswordInput) {
      elements.adminPasswordInput.value = '';
      elements.adminPasswordInput.focus();
      selectAll(elements.adminPasswordInput);
    }
  }
}

export function openAdminModal() {
  openModal(elements.adminModal);
  refreshAdminModalUI();
}

export function closeAdminModal() {
  closeModal(elements.adminModal);
}

export function addEnterKeyForModal(modal, action) {
  if (!modal) return;

  const input = modal.querySelector('input, textarea');
  if (!input) return;

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await action();
    }
  });
}
