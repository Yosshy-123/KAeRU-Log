'use strict';

const crypto = require('crypto');

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeFrontendOrigin(frontendUrl) {
  if (typeof frontendUrl !== 'string') {
    return null;
  }

  const trimmed = frontendUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "'self'" || trimmed === 'self') {
    return "'self'";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch (err) {
    // ignore invalid origin
  }

  return null;
}

function securityHeaders(frontendUrl) {
  const frontendOrigin = normalizeFrontendOrigin(frontendUrl) || "'self'";
  const frameAncestors = frontendOrigin === "'self'" ? "'self'" : frontendOrigin;

  return (req, res, next) => {
    if (res.headersSent) {
      return next();
    }

    const nonce = generateNonce();
    res.locals.nonce = nonce;

    const connectSrc = [`'self'`, 'ws:', 'wss:'];
    if (frontendOrigin !== "'self'") {
      connectSrc.push(frontendOrigin);
    }

    const cdnOrigins = ['https://cdn.socket.io'];

    const scriptSrcList = [`'self'`, `'nonce-${nonce}'`, ...cdnOrigins];
    const scriptSrcElemList = [`'self'`, `'nonce-${nonce}'`, ...cdnOrigins];

    res.setHeader(
      'Content-Security-Policy',
      [
        `default-src 'self'`,
        `script-src ${scriptSrcList.join(' ')}`,
        `script-src-elem ${scriptSrcElemList.join(' ')}`,
        `style-src 'self' 'nonce-${nonce}'`,
        `img-src 'self' data: blob:`,
        `connect-src ${connectSrc.join(' ')}`,
        `frame-ancestors ${frameAncestors}`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `upgrade-insecure-requests`,
      ].join('; ')
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()'
    );
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    next();
  };
}

module.exports = securityHeaders;
