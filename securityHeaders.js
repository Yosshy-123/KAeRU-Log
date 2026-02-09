'use strict';

function securityHeaders(frontendUrl) {
  return (req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${frontendUrl}; frame-ancestors ${frontendUrl};`
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), fullscreen=(self)');
    next();
  };
}

module.exports = securityHeaders;