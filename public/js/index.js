'use strict';

import { getRoomIdFromPath } from './config.js';
import { state } from './state.js';
import { generateUserSeed } from './utils.js';
import { setupRoomInput, setupEventListeners, initialize } from './init.js';

document.addEventListener('DOMContentLoaded', () => {
  const roomId = getRoomIdFromPath();

  if (!roomId) {
    location.replace('/room/general');
    return;
  }

  state.roomId = roomId;

  if (!state.mySeed) {
    state.mySeed = generateUserSeed(40);
    localStorage.setItem('chat_seed', state.mySeed);
  }

  setupRoomInput();
  setupEventListeners();
  initialize();
});
