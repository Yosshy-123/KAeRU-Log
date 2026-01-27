module.exports = {
  username: (clientId) => `username:${clientId}`,
  token: (token) => `token:${token}`,
  messages: (roomId) => `messages:${roomId}`,
  msgMute: (clientId) => `msg:mute:${clientId}`,
  msgMuteLevel: (clientId) => `msg:mute_level:${clientId}`,
  msgLastMute: (clientId) => `msg:last_mute:${clientId}`,
  msgLastTime: (clientId) => `msg:last_time:${clientId}`,
  msgRepeatCount: (clientId) => `msg:repeat_interval_count:${clientId}`,
  msgLastInterval: (clientId) => `msg:last_interval:${clientId}`,
  systemCurrentMonth: () => `system:current_month`,
  resetLock: () => `system:reset_lock`,
};
