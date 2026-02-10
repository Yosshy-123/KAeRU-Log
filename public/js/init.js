import { elements } from './dom.js';
import { state } from './state.js';
import { selectAll, isScrolledToBottom } from './utils.js';
import { changeChatRoom } from './room.js';

import {
  openProfileModal,
  closeProfileModal,
  openAdminModal,
  closeAdminModal,
  addEnterKeyForModal,
} from './modal.js';

import {
  sendMessage,
  saveProfile,
  deleteAllMessages,
  adminLogin,
  adminLogout,
  getAdminStatus,
  loadHistory,
} from './services.js';

import { startConnection } from './socket.js';
import { obtainToken } from './api.js';

/* ----------------- Room input ----------------- */
export function setupRoomInput() {
  if (!elements.roomIdInput) return;

  elements.roomIdInput.value = state.roomId;

  elements.roomIdInput.addEventListener('focus', () => selectAll(elements.roomIdInput));

  elements.roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      changeChatRoom(elements.roomIdInput.value.trim());
    }
  });
}

/* --------------- Event listeners -------------- */
export function setupEventListeners() {
  elements.sendMessageButton?.addEventListener('click', () => sendMessage());

  if (elements.messageTextarea) {
    const isMobileLike = window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches;

    elements.messageTextarea.addEventListener('keydown', (e) => {
      if (!isMobileLike && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  elements.openProfileButton?.addEventListener('click', openProfileModal);
  elements.closeProfileButton?.addEventListener('click', closeProfileModal);
  elements.saveProfileButton?.addEventListener('click', saveProfile);

  elements.openAdminButton?.addEventListener('click', async () => {
    await getAdminStatus();
    openAdminModal();
  });

  elements.closeAdminButton?.addEventListener('click', closeAdminModal);
  elements.closeAdminButton2?.addEventListener('click', closeAdminModal);

  elements.adminLoginButton?.addEventListener('click', async () => {
    await adminLogin();
  });

  elements.adminLogoutButton?.addEventListener('click', async () => {
    await adminLogout();
  });

  elements.clearMessagesButton?.addEventListener('click', async () => {
    await deleteAllMessages();
  });

  elements.joinRoomButton?.addEventListener('click', () => {
    changeChatRoom(elements.roomIdInput.value.trim());
  });

  elements.chatContainer?.addEventListener('scroll', () => {
    state.isAutoScroll = isScrolledToBottom();
  });

  addEnterKeyForModal(elements.adminModal, async () => {
    if (!state.isAdmin) {
      await adminLogin();
    } else {
      await deleteAllMessages();
    }
  });

  addEnterKeyForModal(elements.profileModal, saveProfile);
}

/* ------------------ Initialize -----------------
*/
export async function initialize() {
  try {
    if (!state.myToken) {
      try {
        await obtainToken();
      } catch (e) {
        openProfileModal();
        return;
      }
    }

    try {
      await getAdminStatus();
    } catch (e) {
      state.isAdmin = false;
    }

    try {
      startConnection().catch((err) => {
        console.warn('socket start error', err);
      });
    } catch (e) {
      console.warn('startConnection threw', e);
    }

    try {
      if (state.roomId) {
        await loadHistory();
      }
    } catch (e) {
      console.warn('loadHistory failed', e);
    }

    if (state.pendingMessage && state.myToken) {
      const pm = state.pendingMessage;
      state.pendingMessage = null;
      try {
        await sendMessage(pm);
      } catch (e) {
        console.warn('sending pending message failed', e);
      }
    }
  } catch (e) {
    console.warn('initialize error', e);
  }
}
