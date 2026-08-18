'use strict';

/**
 * Structured logger with secret redaction.
 * Never throws; never logs raw secrets even if callers pass them.
 */

const REDACT_KEYS = new Set([
  'password',
  'passwd',
  'pass',
  'token',
  'accesstoken',
  'authtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'setcookie',
  'secret',
  'apikey',
  'api_key',
  'redisurl',
  'redis_url',
  'connectionstring',
  'connection_string',
  'adminpass',
  'admin_pass',
]);

/** Mask userinfo in URLs: scheme://user:pass@host → scheme://[REDACTED]@host */
const URL_CREDENTIAL_RE = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/g;

function maskCredentialsInString(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }
  return value.replace(URL_CREDENTIAL_RE, '$1[REDACTED]@');
}

function isRedactKey(key) {
  if (typeof key !== 'string') {
    return false;
  }
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  if (REDACT_KEYS.has(normalized)) {
    return true;
  }
  return normalized.endsWith('password') || normalized.endsWith('token') || normalized.endsWith('secret');
}

function redactValue(value, depth = 0, seen = null) {
  const visited = seen || new WeakSet();

  if (depth > 8) {
    return '[MaxDepth]';
  }
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return maskCredentialsInString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }

  if (visited.has(value)) {
    return '[Circular]';
  }
  visited.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message:
        typeof value.message === 'string'
          ? maskCredentialsInString(value.message).slice(0, 200)
          : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, visited));
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (isRedactKey(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactValue(val, depth + 1, visited);
    }
  }
  return out;
}

function safeSerialize(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    });
  } catch {
    return '"[unserializable]"';
  }
}

function log(level, event, fields = {}) {
  try {
    const safeFields = redactValue(fields && typeof fields === 'object' ? fields : {});
    const payload = {
      level,
      event: typeof event === 'string' ? event : 'unknown',
      ts: new Date().toISOString(),
      ...safeFields,
    };
    const line = safeSerialize(payload);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  } catch {
    try {
      console.error('{"level":"error","event":"logger.failure"}');
    } catch {
      // ignore
    }
  }
}

module.exports = {
  info: (event, fields) => log('info', event, fields),
  warn: (event, fields) => log('warn', event, fields),
  error: (event, fields) => log('error', event, fields),
  _redactValue: redactValue,
  _maskCredentialsInString: maskCredentialsInString,
};
