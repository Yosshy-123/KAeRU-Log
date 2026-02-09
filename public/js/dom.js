const $ = (sel) => document.querySelector(sel);

export const elements = {
  chatContainer: $('main') || document.documentElement,
  messageList: $('#messageList'),
  messageTextarea: $('#messageTextarea'),
  sendMessageButton: $('#sendMessageButton'),
  toastNotification: $('#toastNotification'),

  profileModal: $('#profileModal'),
  profileNameInput: $('#profileNameInput'),
  openProfileButton: $('#openProfileButton'),
  closeProfileButton: $('#closeProfileButton'),
  saveProfileButton: $('#saveProfileButton'),

  adminModal: $('#adminModal'),
  openAdminButton: $('#openAdminButton'),
  closeAdminButton: $('#closeAdminButton'),
  adminPasswordInput: $('#adminPasswordInput'),
  clearMessagesButton: $('#clearMessagesButton'),

  connectionText: $('#connectionText'),
  connectionIndicator: $('#connectionIndicator'),
  onlineUserCount: $('#onlineUserCount'),

  roomIdInput: $('#roomIdInput'),
  joinRoomButton: $('#joinRoomButton'),
};
