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

import { startConnection, disconnectSocketGracefully } from './socket.js';
import { obtainToken } from './api.js';
import { showToast } from './toast.js';

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

let navigationCleanupRegistered = false;

function registerNavigationCleanup() {
  if (navigationCleanupRegistered) {
    return;
  }

  navigationCleanupRegistered = true;

  const handlePageExit = () => {
    void disconnectSocketGracefully();
  };

  window.addEventListener('pagehide', handlePageExit, { capture: true });
  window.addEventListener('beforeunload', handlePageExit, { capture: true });
}

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

    elements.messageTextarea.addEventListener('input', () => {
      elements.messageTextarea.style.height = 'auto';
      elements.messageTextarea.style.height = `${elements.messageTextarea.scrollHeight}px`;
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

  elements.adminLoginButton?.addEventListener('click', adminLogin);
  elements.adminLogoutButton?.addEventListener('click', adminLogout);
  elements.clearMessagesButton?.addEventListener('click', deleteAllMessages);

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

export async function initialize() {
  try {
    try {
      await obtainToken();
    } catch (err) {
      showToast(err?.message === 'authCooldown' ? '認証の再試行を少し待ってください' : (err?.message || '認証に失敗しました'));
      openProfileModal();
      return;
    }

    try {
      await getAdminStatus();
    } catch {
      state.isAdmin = false;
    }

    try {
      await startConnection();
      registerNavigationCleanup();
    } catch (err) {
      console.warn('startConnection failed', err);
    }

    if (state.roomId) {
      try {
        await loadHistory();
      } catch (err) {
        console.warn('loadHistory failed', err);
      }
    }

    if (state.pendingMessage) {
      const pending = state.pendingMessage;
      state.pendingMessage = null;

      try {
        await sendMessage(pending);
      } catch (err) {
        console.warn('sending pending message failed', err);
      }
    }
  } catch (err) {
    console.warn('initialize error', err);
  }
}
