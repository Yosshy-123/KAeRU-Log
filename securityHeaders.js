'use strict';

const crypto = require('crypto');

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function normalizeFrontendOrigin(frontendUrl) {
  if (typeof frontendUrl !== 'string') return null;

  const trimmed = frontendUrl.trim();
  if (!trimmed) return null;

  if (trimmed === "'self'" || trimmed === 'self') {
    return "'self'";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // ignore
  }

  return null;
}

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function securityHeaders(frontendUrl) {
  const frontendOrigin = normalizeFrontendOrigin(frontendUrl) || "'self'";
  const frameAncestors = frontendOrigin === "'self'" ? "'self'" : frontendOrigin;

  return (req, res, next) => {
    if (res.headersSent) return next();

    const nonce = generateNonce();
    res.locals.nonce = nonce;

    const connectSrc = [`'self'`, 'ws:', 'wss:'];
    if (frontendOrigin !== "'self'") {
      connectSrc.push(frontendOrigin);
    }

    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://cdn.socket.io`,
      `script-src-elem 'self' 'nonce-${nonce}' https://cdn.socket.io`,
      `style-src 'self' 'nonce-${nonce}'`,
      `img-src 'self' data: blob:`,
      `connect-src ${connectSrc.join(' ')}`,
      `frame-ancestors ${frameAncestors}`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ];

    if (isHttps(req)) {
      csp.push(`upgrade-insecure-requests`);
    }

    res.setHeader('Content-Security-Policy', csp.join('; '));

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()'
    );
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    if (isHttps(req)) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }
    next();
  };
}

module.exports = securityHeaders;
