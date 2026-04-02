'use strict';

import { getRoomIdFromPath } from './config.js';
import { state } from './state.js';
import { setupRoomInput, setupEventListeners, initialize } from './init.js';

document.addEventListener('DOMContentLoaded', () => {
  const roomId = getRoomIdFromPath();

  if (!roomId) {
    location.replace('/room/general');
    return;
  }

  state.roomId = roomId;

  setupRoomInput();
  setupEventListeners();
  initialize();
});
