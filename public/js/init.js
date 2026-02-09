import { elements } from './dom.js';
import { state } from './state.js';
import { selectAll, isScrolledToBottom } from './utils.js';
import { changeChatRoom } from './room.js';

import { openProfileModal, closeProfileModal, openAdminModal, closeAdminModal, addEnterKeyForModal } from './modal.js';
import { sendMessage, saveProfile, deleteAllMessages } from './services.js';
import { startConnection } from './socket.js';
import { obtainToken } from './api.js';

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

  elements.openAdminButton?.addEventListener('click', openAdminModal);
  elements.closeAdminButton?.addEventListener('click', closeAdminModal);

  elements.clearMessagesButton?.addEventListener('click', () => {
    deleteAllMessages();
    closeAdminModal();
  });

  elements.joinRoomButton?.addEventListener('click', () => {
    changeChatRoom(elements.roomIdInput.value.trim());
  });

  elements.chatContainer?.addEventListener('scroll', () => {
    state.isAutoScroll = isScrolledToBottom();
  });

  addEnterKeyForModal(elements.profileModal, saveProfile);
  addEnterKeyForModal(elements.adminModal, deleteAllMessages, closeAdminModal);
}

export async function initialize() {
  try {
    if (!state.myToken) {
      try {
        await obtainToken();
      } catch (e) {
        openProfileModal();
      }
    }

    if (state.myToken) {
      startConnection().catch(() => {});
    }

    if (state.pendingMessage && state.myToken) {
      const pm = state.pendingMessage;
      state.pendingMessage = null;
      sendMessage(pm);
    }
  } catch (e) {
    console.warn('initialization error', e);
  }
}
