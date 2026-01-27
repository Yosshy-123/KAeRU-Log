module.exports = {
  // user / token
  username: (clientId) => `username:${clientId}`,
  token: (token) => `token:${token}`,

  // messages
  messages: (roomId) => `messages:${roomId}`,
  messagesPattern: () => 'messages:*',

  // spam / mute
  mute: (clientId) => `msg:mute:${clientId}`,
  muteLevel: (clientId) => `msg:mute_level:${clientId}`,
  spamLastTime: (clientId) => `msg:last_time:${clientId}`,
  spamLastInterval: (clientId) => `msg:last_interval:${clientId}`,
  spamRepeatCount: (clientId) => `msg:repeat_interval_count:${clientId}`,

  // rate keys (message rate, username change etc)
  rateMsg: (clientId) => `ratelimit:msg:${clientId}`,
  rateUsername: (clientId) => `ratelimit:username:${clientId}`,
  rateClear: (clientId) => `ratelimit:clear:${clientId}`,
  rateAuthIp: (ip) => `ratelimit:auth:ip:${ip}`,

  // system / reset
  systemCurrentMonth: () => 'system:current_month',
  resetLock: () => 'system:reset_lock',
};
