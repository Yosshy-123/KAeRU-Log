const $ = (id) => document.getElementById(id);

export const elements = {
  chatContainer: $('chatMain'),
  messageList: $('messageList'),
  messageTextarea: $('messageTextarea'),
  sendMessageButton: $('sendMessageButton'),
  toastNotification: $('toastNotification'),

  profileModal: $('profileModal'),
  profileNameInput: $('profileNameInput'),
  openProfileButton: $('openProfileButton'),
  closeProfileButton: $('closeProfileButton'),
  saveProfileButton: $('saveProfileButton'),

  adminModal: $('adminModal'),
  openAdminButton: $('openAdminButton'),

  adminPasswordInput: $('adminPasswordInput'),
  adminLoginButton: $('adminLoginButton'),
  adminLogoutButton: $('adminLogoutButton'),

  closeAdminButton: $('closeAdminButton'),
  closeAdminButton2: $('closeAdminButton2'),

  clearMessagesButton: $('clearMessagesButton'),

  adminLoginSection: $('adminLoginSection'),
  adminPanelSection: $('adminPanelSection'),
  adminModalTitle: $('adminModalTitle'),

  connectionText: $('connectionText'),
  connectionIndicator: $('connectionIndicator'),
  onlineUserCount: $('onlineUserCount'),

  roomIdInput: $('roomIdInput'),
  joinRoomButton: $('joinRoomButton'),
};