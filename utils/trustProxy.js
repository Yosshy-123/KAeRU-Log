'use strict';

function isTrustProxyEnabled(value = process.env.TRUST_PROXY) {
  return String(value).trim().toLowerCase() === 'true';
}

module.exports = {
  isTrustProxyEnabled,
};
