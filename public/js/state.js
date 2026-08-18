import { safeGetItem } from './storage.js';

export const state = {
  socket: null,
  messages: [],

  myName: safeGetItem('chat_username', ''),

  roomId: null,

  isAutoScroll: true,
  pendingMessage: null,
  activeModal: null,
  isSending: false,

  authPromise: null,
  lastAuthAttempt: 0,

  isAdmin: false,
};
