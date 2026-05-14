'use strict';

const fs = require('fs');
const path = require('path');
const { sha256Hex, shortSha256Hex } = require('../lib/hash');
const createRedisLuaScript = require('../lib/redisLuaScript');

const DEFAULTS = {
  baseMuteSec: 60,
  maxMuteSec: 60 * 60 * 24,
  repeatLimit: 3,
  sameMessageLimit: 3,
  messageRateLimitMs: 1200,
  intervalJitterMs: 300,
  intervalWindowSec: 60 * 60,
  shortRateWindowSec: 15,
  shortRateLimit: 6,
};

const IP_RATE_MULTIPLIER_DEFAULT = 1.8;
const LUA_PATH = path.join(__dirname, '..', 'lua', 'spamService.lua');
const LUA_SOURCE = fs.readFileSync(LUA_PATH, 'utf8');
const SCOPE_CLIENT = 'client';
const SCOPE_IP = 'ip';
const NORMALIZE_WHITESPACE_RE = /[-\u001F\u007F\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;

function normalizeNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeMessage(msg) {
  if (typeof msg !== 'string') {
    return '';
  }

  const source = msg.normalize ? msg.normalize('NFKC') : String(msg);
  return source.replace(NORMALIZE_WHITESPACE_RE, ' ').replace(/\s+/g, ' ').trim();
}

function validKey(key) {
  return typeof key === 'string' && key.trim() !== '';
}

function createBaseConfig(config = {}) {
  return {
    baseMuteSec: normalizeNumber(config.baseMuteSec, DEFAULTS.baseMuteSec),
    maxMuteSec: normalizeNumber(config.maxMuteSec, DEFAULTS.maxMuteSec),
    repeatLimit: normalizeNumber(config.repeatLimit, DEFAULTS.repeatLimit),
    sameMessageLimit: normalizeNumber(config.sameMessageLimit, DEFAULTS.sameMessageLimit),
    messageRateLimitMs: normalizeNumber(config.messageRateLimitMs, DEFAULTS.messageRateLimitMs),
    intervalJitterMs: normalizeNumber(config.intervalJitterMs, DEFAULTS.intervalJitterMs),
    intervalWindowSec: normalizeNumber(config.intervalWindowSec, DEFAULTS.intervalWindowSec),
    shortRateWindowSec: normalizeNumber(config.shortRateWindowSec, DEFAULTS.shortRateWindowSec),
    shortRateLimit: normalizeNumber(config.shortRateLimit, DEFAULTS.shortRateLimit),
  };
}

function deriveScopeConfig(baseConfig, multiplier) {
  return {
    messageRateLimitMs: Math.round(baseConfig.messageRateLimitMs * multiplier),
    intervalJitterMs: Math.round(baseConfig.intervalJitterMs * multiplier),
    repeatLimit: Math.max(1, Math.ceil(baseConfig.repeatLimit * multiplier)),
    sameMessageLimit: Math.max(1, Math.ceil(baseConfig.sameMessageLimit * multiplier)),
    shortRateLimit: Math.max(1, Math.ceil(baseConfig.shortRateLimit * multiplier)),
  };
}

function createScopeProfiles(baseConfig, ipConfig, KEYS) {
  return {
    [SCOPE_CLIENT]: {
      label: SCOPE_CLIENT,
      keyPrefix: 'short_rate:',
      config: baseConfig,
      keys: {
        lastKey: KEYS.spamLastTime,
        prevDeltaKey: KEYS.spamLastInterval,
        repeatKey: KEYS.spamRepeatCount,
        muteKey: KEYS.mute,
        muteLevelKey: KEYS.muteLevel,
        lastMsgHashKey: KEYS.spamLastMsgHash,
        repeatMsgKey: KEYS.spamRepeatMsgCount,
      },
    },
    [SCOPE_IP]: {
      label: SCOPE_IP,
      keyPrefix: 'short_rate:ip:',
      config: ipConfig,
      keys: {
        lastKey: KEYS.spamLastTimeIp,
        prevDeltaKey: KEYS.spamLastIntervalIp,
        repeatKey: KEYS.spamRepeatCountIp,
        muteKey: KEYS.spamMuteIp,
        muteLevelKey: KEYS.spamMuteLevelIp,
        lastMsgHashKey: KEYS.spamLastMsgHashIp,
        repeatMsgKey: KEYS.spamRepeatMsgCountIp,
      },
    },
  };
}

function buildScope(profile, scopeId) {
  const normalizedScopeId = typeof scopeId === 'string' ? scopeId.trim() : '';
  if (!normalizedScopeId) {
    return null;
  }

  const scopeKey = profile.label === SCOPE_IP
    ? shortSha256Hex(normalizedScopeId, 16)
    : normalizedScopeId;

  const { keys } = profile;
  return {
    lastKey: keys.lastKey(scopeKey),
    prevDeltaKey: keys.prevDeltaKey(scopeKey),
    repeatKey: keys.repeatKey(scopeKey),
    muteKey: keys.muteKey(scopeKey),
    muteLevelKey: keys.muteLevelKey(scopeKey),
    lastMsgHashKey: keys.lastMsgHashKey(scopeKey),
    repeatMsgKey: keys.repeatMsgKey(scopeKey),
    shortRateKey: `${profile.keyPrefix}${scopeKey}`,
    keyLabel: `${profile.label}:${scopeKey}`,
  };
}

function createScopeResult({ muted = false, rejected = false, reason = null, muteSec = 0, scope = null } = {}) {
  return { muted, rejected, reason, muteSec, scope };
}

function combineResults(results) {
  const filtered = results.filter(Boolean);
  if (filtered.length === 0) {
    return createScopeResult();
  }

  return filtered.reduce((acc, result) => ({
    muted: acc.muted || result.muted,
    rejected: acc.rejected || result.rejected,
    reason: acc.reason || (result.rejected && result.reason) || (result.muted && result.reason) || null,
    muteSec: Math.max(acc.muteSec, Number(result.muteSec) || 0),
  }), createScopeResult());
}

module.exports = function createSpamService(redis, KEYS, config = {}) {
  if (!redis) {
    throw new Error('redis is required');
  }
  if (!KEYS) {
    throw new Error('KEYS is required');
  }

  const baseConfig = createBaseConfig(config);
  const ipMultiplier = normalizeNumber(config.ipRateMultiplier, IP_RATE_MULTIPLIER_DEFAULT);
  const ipConfig = { ...baseConfig, ...deriveScopeConfig(baseConfig, ipMultiplier) };
  const scopeProfiles = createScopeProfiles(baseConfig, ipConfig, KEYS);
  const spamScript = createRedisLuaScript(redis, LUA_SOURCE);

  async function checkScope(scopeType, scopeId, message) {
    const profile = scopeProfiles[scopeType] || scopeProfiles[SCOPE_CLIENT];
    const scope = buildScope(profile, scopeId);
    if (!scope) {
      return createScopeResult({ muted: true, rejected: true, reason: 'error', scope: scopeType });
    }

    const normalized = normalizeMessage(message);
    const msgHash = normalized ? sha256Hex(normalized) : '';

    const keysValid = [
      scope.lastKey,
      scope.prevDeltaKey,
      scope.repeatKey,
      scope.muteKey,
      scope.muteLevelKey,
      scope.lastMsgHashKey,
      scope.repeatMsgKey,
      scope.shortRateKey,
    ].every(validKey);

    if (!keysValid) {
      return createScopeResult({ muted: true, rejected: true, reason: 'error', scope: scope.keyLabel });
    }

    try {
      const res = await spamScript.eval(
        8,
        scope.lastKey,
        scope.prevDeltaKey,
        scope.repeatKey,
        scope.muteKey,
        scope.muteLevelKey,
        scope.lastMsgHashKey,
        scope.repeatMsgKey,
        scope.shortRateKey,
        String(Date.now()),
        String(profile.config.messageRateLimitMs),
        String(profile.config.intervalJitterMs),
        String(profile.config.intervalWindowSec),
        String(baseConfig.baseMuteSec),
        String(baseConfig.maxMuteSec),
        String(profile.config.repeatLimit),
        String(profile.config.sameMessageLimit),
        msgHash,
        String(profile.config.shortRateWindowSec),
        String(profile.config.shortRateLimit)
      );

      if (!Array.isArray(res) || res.length < 4) {
        throw new Error(`Invalid spam Lua response: ${JSON.stringify(res)}`);
      }

      return createScopeResult({
        muted: res[0] === '1',
        rejected: res[1] === '1',
        reason: res[2] || null,
        muteSec: Number(res[3]) || 0,
        scope: scope.keyLabel,
      });
    } catch (err) {
      console.error('spamLuaError', err);
      return createScopeResult({ muted: true, rejected: true, reason: 'error', scope: scope.keyLabel });
    }
  }

  async function check(clientId, message, ip) {
    const checks = [];

    if (clientId) {
      checks.push(checkScope(SCOPE_CLIENT, clientId, message));
    }

    if (ip) {
      checks.push(checkScope(SCOPE_IP, ip, message));
    }

    return combineResults(await Promise.all(checks));
  }

  return { check };
};
