'use strict';

const { sha256Hex } = require('./hash');

function normalizeKeyPart(value, label = 'key part') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function digestToken(token) {
  return sha256Hex(normalizeKeyPart(token, 'token'));
}

function isValidKey(key) {
  return typeof key === 'string' && key.length > 0;
}

module.exports = {
  isValidKey,

  username: (clientId) => `username:${normalizeKeyPart(clientId, 'clientId')}`,
  token: (token) => `token:${digestToken(token)}`,

  adminSession: (token) => `admin:session:${digestToken(token)}`,
  rateAdminLoginFailures: (scope) => `ratelimit:admin:login:fail:${normalizeKeyPart(scope, 'scope')}`,
  rateAdminLoginLock: (scope) => `ratelimit:admin:login:lock:${normalizeKeyPart(scope, 'scope')}`,

  userRoom: (clientId) => `user:${normalizeKeyPart(clientId, 'clientId')}`,
  socketSession: (clientId) => `socket:session:${normalizeKeyPart(clientId, 'clientId')}`,

  messages: (roomId) => `messages:${normalizeKeyPart(roomId, 'roomId')}`,
  messagesPattern: () => 'messages:*',

  mute: (clientId) => `msg:mute:${normalizeKeyPart(clientId, 'clientId')}`,
  muteLevel: (clientId) => `msg:mute_level:${normalizeKeyPart(clientId, 'clientId')}`,
  spamLastTime: (clientId) => `msg:last_time:${normalizeKeyPart(clientId, 'clientId')}`,
  spamLastInterval: (clientId) => `msg:last_interval:${normalizeKeyPart(clientId, 'clientId')}`,
  spamRepeatCount: (clientId) => `msg:repeat_interval_count:${normalizeKeyPart(clientId, 'clientId')}`,
  spamLastMsgHash: (clientId) => `msg:last_hash:${normalizeKeyPart(clientId, 'clientId')}`,
  spamRepeatMsgCount: (clientId) => `msg:repeat_msg_count:${normalizeKeyPart(clientId, 'clientId')}`,

  spamLastTimeIp: (ip) => `msg:last_time:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamLastIntervalIp: (ip) => `msg:last_interval:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamRepeatCountIp: (ip) => `msg:repeat_interval_count:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamLastMsgHashIp: (ip) => `msg:last_hash:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamRepeatMsgCountIp: (ip) => `msg:repeat_msg_count:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamMuteIp: (ip) => `msg:mute:ip:${normalizeKeyPart(ip, 'ip')}`,
  spamMuteLevelIp: (ip) => `msg:mute_level:ip:${normalizeKeyPart(ip, 'ip')}`,

  rateUsername: (clientId) => `ratelimit:username:${normalizeKeyPart(clientId, 'clientId')}`,
  rateClear: (clientId) => `ratelimit:clear:${normalizeKeyPart(clientId, 'clientId')}`,

  tokenBucketAuthIp: (ip) => `bucket:auth:ip:${normalizeKeyPart(ip, 'ip')}`,
};
