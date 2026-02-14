/**
 * Safe DOM query selector
 * @param {string} sel - CSS selector
 * @returns {Element|null} DOM element or null
 */
function querySelector(sel) {
  try {
    return document.querySelector(sel);
  } catch (e) {
    console.warn(`Failed to query selector: ${sel}`, e);
    return null;
  }
}

/**
 * Cache DOM elements for access throughout the application
 * Elements are initialized after DOM is ready
 */
let elements = null;

/**
 * Initialize DOM element references
 * Call this after DOM is ready to ensure all elements exist
 */
function initializeElements() {
  elements = {
    chatContainer: querySelector('main') || document.documentElement,
    messageList: querySelector('#messageList'),
    messageTextarea: querySelector('#messageTextarea'),
    sendMessageButton: querySelector('#sendMessageButton'),
    toastNotification: querySelector('#toastNotification'),

    profileModal: querySelector('#profileModal'),
    profileNameInput: querySelector('#profileNameInput'),
    openProfileButton: querySelector('#openProfileButton'),
    closeProfileButton: querySelector('#closeProfileButton'),
    saveProfileButton: querySelector('#saveProfileButton'),

    adminModal: querySelector('#adminModal'),
    openAdminButton: querySelector('#openAdminButton'),

    adminPasswordInput: querySelector('#adminPasswordInput'),
    adminLoginButton: querySelector('#adminLoginButton'),
    adminLogoutButton: querySelector('#adminLogoutButton'),

    closeAdminButton: querySelector('#closeAdminButton'),
    closeAdminButton2: querySelector('#closeAdminButton2'),

    clearMessagesButton: querySelector('#clearMessagesButton'),

    adminLoginSection: querySelector('#adminLoginSection'),
    adminPanelSection: querySelector('#adminPanelSection'),
    adminModalTitle: querySelector('#adminModalTitle'),

    connectionText: querySelector('#connectionText'),
    connectionIndicator: querySelector('#connectionIndicator'),
    onlineUserCount: querySelector('#onlineUserCount'),

    roomIdInput: querySelector('#roomIdInput'),
    joinRoomButton: querySelector('#joinRoomButton'),
  };

  return elements;
}

/**
 * Get cached DOM elements
 * @returns {Object} Object containing DOM element references
 */
function getElements() {
  if (!elements) {
    console.warn('DOM elements not initialized yet, initializing now');
    initializeElements();
  }
  return elements;
}

export { initializeElements, getElements };
export const elements = new Proxy({}, {
  get: (target, prop) => {
    const els = getElements();
    return els[prop];
  },
});