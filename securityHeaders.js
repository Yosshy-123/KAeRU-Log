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
  if (!trimmed || trimmed === 'self' || trimmed === "'self'") {
    return "'self'";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

function securityHeaders(frontendUrl) {
  const frontendOrigin = normalizeFrontendOrigin(frontendUrl) || "'self'";

  return (req, res, next) => {
    if (res.headersSent) {
      return next();
    }

    const nonce = generateNonce();
    res.locals.nonce = nonce;

    const connectSrc = ["'self'", 'ws:', 'wss:'];
    if (frontendOrigin !== "'self'") {
      connectSrc.push(frontendOrigin);
    }

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        `script-src 'self' https://cdn.socket.io`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' data: blob:",
        `connect-src ${connectSrc.join(' ')}`,
        "form-action 'self'",
      ].join('; ')
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}

module.exports = securityHeaders;
