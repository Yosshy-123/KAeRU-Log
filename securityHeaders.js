'use strict';

const crypto = require('crypto');

/**
 * Generate a cryptographically secure random nonce for CSP
 * @returns {string} Random nonce string (32 hex characters)
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Middleware to set security headers
 * Provides comprehensive security hardening:
 * - Content Security Policy with nonce-based inline styles
 * - HSTS for HTTPS enforcement
 * - Protection against MIME sniffing, clickjacking, XSS
 * 
 * @param {string} frontendUrl - Frontend URL for CORS origin
 * @returns {Function} Express middleware function
 */
function securityHeaders(frontendUrl) {
  const fe = frontendUrl || "'self'";

  return (req, res, next) => {
    if (res.headersSent) return next();

    // Generate a unique nonce for this response
    const nonce = generateNonce();
    
    // Store nonce in response locals for template usage
    res.locals.nonce = nonce;

    // Strict Content Security Policy
    // Prevents inline script execution, eval(), and external untrusted resources
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; ` +
      `script-src 'self'; ` +
      `style-src 'self' 'nonce-${nonce}'; ` +
      `img-src 'self' data: blob:; ` +
      `connect-src 'self' ws: wss: ${fe}; ` +
      `frame-ancestors ${fe}; ` +
      `base-uri 'self'; ` +
      `form-action 'self'; ` +
      `upgrade-insecure-requests`
    );

    // Prevent browsers from MIME sniffing (e.g., executing CSS as JS)
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking attacks
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Enable XSS filter in older browsers and block page if attack detected
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Prevent browsers from sending Referer header to less secure origins
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Restrict access to sensitive APIs
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()'
    );

    // HSTS: Force HTTPS for 1 year, including subdomains and preload to browser lists
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // Additional security headers
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    next();
  };
}

module.exports = securityHeaders;