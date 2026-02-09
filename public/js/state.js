export const state = {
  socket: null,
  messages: [],

  myName: localStorage.getItem('chat_username') || '',
  myToken: localStorage.getItem('chatToken') || '',
  mySeed: localStorage.getItem('chat_seed') || null,

  roomId: null,

  isAutoScroll: true,
  pendingMessage: null,
  activeModal: null,
  isServerToastActive: false,
  isSending: false,

  authPromise: null,
  lastAuthAttempt: 0,
};
