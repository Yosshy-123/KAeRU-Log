'use strict';

const crypto = require('crypto');

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function shortSha256Hex(value, length = 16) {
  const parsedLength = Number(length);
  const safeLength = Number.isInteger(parsedLength) && parsedLength > 0 ? parsedLength : 16;
  return sha256Hex(value).slice(0, safeLength);
}

module.exports = {
  sha256Hex,
  shortSha256Hex,
};
