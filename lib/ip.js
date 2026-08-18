'use strict';

const { shortSha256Hex } = require('./hash');

function normalizeIp(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashIp(value, length = 16) {
  const normalized = normalizeIp(value);
  if (!normalized) {
    return '';
  }

  return shortSha256Hex(normalized, length);
}

module.exports = {
  hashIp,
};
