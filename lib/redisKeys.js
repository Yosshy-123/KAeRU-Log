'use strict';

module.exports = {
  username: (clientId) => `username:${clientId}`,
  token: (token) => `token:${token}`,

  adminSession: (token) => `admin:session:${token}`,

  userRoom: (clientId) => `user:${clientId}`,

  messages: (roomId) => `messages:${roomId}`,
  messagesPattern: () => 'messages:*',

  mute: (clientId) => `msg:mute:${clientId}`,
  muteLevel: (clientId) => `msg:mute_level:${clientId}`,
  spamLastTime: (clientId) => `msg:last_time:${clientId}`,
  spamLastInterval: (clientId) => `msg:last_interval:${clientId}`,
  spamRepeatCount: (clientId) => `msg:repeat_interval_count:${clientId}`,
  spamLastMsgHash: (clientId) => `msg:last_hash:${clientId}`,
  spamRepeatMsgCount: (clientId) => `msg:repeat_msg_count:${clientId}`,

  rateMsg: (clientId) => `ratelimit:msg:${clientId}`,
  rateUsername: (clientId) => `ratelimit:username:${clientId}`,
  rateClear: (clientId) => `ratelimit:clear:${clientId}`,
  rateAdminLogin: (clientId) => `ratelimit:admin:login:${clientId}`,
  rateAuthIp: (ip) => `ratelimit:auth:ip:${ip}`,

  tokenBucketAuthIp: (ip) => `bucket:auth:ip:${ip}`,
};