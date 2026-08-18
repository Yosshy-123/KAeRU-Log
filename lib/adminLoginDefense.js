'use strict';

const fs = require('fs');
const path = require('path');
const createRedisLuaScript = require('./redisLuaScript');
const logger = require('./logger');

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeScope(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createScopeKeys(KEYS, scope) {
  const normalized = normalizeScope(scope);
  if (!normalized) {
    return null;
  }

  return {
    fail: KEYS.rateAdminLoginFailures(normalized),
    lock: KEYS.rateAdminLoginLock(normalized),
  };
}

function parseInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createAdminLoginDefense(redisClient, KEYS, options = {}) {
  if (!redisClient) {
    throw new Error('redisClient is required');
  }
  if (!KEYS) {
    throw new Error('KEYS is required');
  }

  const failureWindowMs = toPositiveInteger(options.failureWindowMs, 15 * 60 * 1000);
  const lockoutMs = toPositiveInteger(options.lockoutMs, 10 * 60 * 1000);
  const threshold = toPositiveInteger(options.threshold, 5);
  const maxLockoutMs = toPositiveInteger(options.maxLockoutMs, 60 * 60 * 1000);

  const luaPath = path.join(__dirname, '..', 'lua', 'adminLoginDefense.lua');
  const luaSource = fs.readFileSync(luaPath, 'utf8');
  const script = createRedisLuaScript(redisClient, luaSource);

  async function getLockRemainingMs(scope) {
    const keys = createScopeKeys(KEYS, scope);
    if (!keys) {
      return 0;
    }

    try {
      const ttl = await script.eval(2, keys.fail, keys.lock, 'ttl');
      return Math.max(0, parseInteger(ttl, 0));
    } catch (err) {
      logger.error('admin.auth.failure', { phase: 'ttl', errorType: err?.name });
      return 0;
    }
  }

  async function recordFailure(scope) {
    const keys = createScopeKeys(KEYS, scope);
    if (!keys) {
      return { locked: false, remainingMs: 0, failures: 0 };
    }

    try {
      const response = await script.eval(
        2,
        keys.fail,
        keys.lock,
        'fail',
        String(threshold),
        String(failureWindowMs),
        String(lockoutMs),
        String(maxLockoutMs)
      );

      if (!Array.isArray(response) || response.length < 3) {
        throw new Error(`Invalid admin login defense response: ${JSON.stringify(response)}`);
      }

      return {
        locked: response[0] === '1',
        remainingMs: Math.max(0, parseInteger(response[1], 0)),
        failures: Math.max(0, parseInteger(response[2], 0)),
      };
    } catch (err) {
      logger.error('admin.auth.failure', { phase: 'record_failure', errorType: err?.name });
      return { locked: true, remainingMs: lockoutMs, failures: 0 };
    }
  }

  async function reset(scope) {
    const keys = createScopeKeys(KEYS, scope);
    if (!keys) {
      return false;
    }

    try {
      const result = await script.eval(2, keys.fail, keys.lock, 'reset');
      return result === '1';
    } catch (err) {
      logger.error('admin.auth.failure', { phase: 'reset', errorType: err?.name });
      return false;
    }
  }

  return {
    getLockRemainingMs,
    recordFailure,
    reset,
  };
}

module.exports = createAdminLoginDefense;
