'use strict';

const crypto = require('crypto');

function generateNonce() {
  return crypto.randomBytes(32).toString('base64');
}

function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
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

function normalizeWsOrigin(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed === "'self'" || trimmed === 'self') {
    return "'self'";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      return parsed.origin;
    }
  } catch {
    // ignore
  }

  return null;
}

function getForwardedProto(req) {
  const value = req?.headers?.['x-forwarded-proto'];

  if (Array.isArray(value)) {
    return String(value[0] || '').trim().toLowerCase();
  }

  if (typeof value === 'string') {
    return value.split(',')[0].trim().toLowerCase();
  }

  return '';
}

function isHttps(req) {
  const forwardedProto = getForwardedProto(req);
  const forwardedSsl = String(req?.headers?.['x-forwarded-ssl'] || '').toLowerCase();

  return Boolean(req?.secure || forwardedProto === 'https' || forwardedSsl === 'on');
}

function securityHeaders({ frontendUrl, websocketUrl } = {}) {
  const frontendOrigin = normalizeOrigin(frontendUrl) || "'self'";
  const websocketOrigin = normalizeWsOrigin(websocketUrl);
  const frameAncestors = frontendOrigin === "'self'" ? "'self'" : frontendOrigin;

  return (req, res, next) => {
    if (res.headersSent) return next();

    const nonce = generateNonce();
    res.locals = res.locals || {};
    res.locals.nonce = nonce;

    const connectSrc = ["'self'"];
    if (frontendOrigin !== "'self'") connectSrc.push(frontendOrigin);
    if (websocketOrigin && websocketOrigin !== "'self'") connectSrc.push(websocketOrigin);

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://cdn.socket.io`,
      `script-src-elem 'self' 'nonce-${nonce}' https://cdn.socket.io`,
      "style-src 'self' 'nonce-${nonce}'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(' ')}`,
      `frame-ancestors ${frameAncestors}`,
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "manifest-src 'self'",
    ];

    if (isHttps(req)) {
      csp.push('upgrade-insecure-requests');
    }

    res.setHeader('Content-Security-Policy', csp.join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()'
    );
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');

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
