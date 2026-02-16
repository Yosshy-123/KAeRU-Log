const onHeaders = require("on-headers");

function securityHeaders(frontendUrl) {
  const fe = frontendUrl || "'self'";

  return (req, res, next) => {
    onHeaders(res, function () {
      const nonce = generateNonce();
      res.locals.nonce = nonce;

      res.setHeader(
        "Content-Security-Policy",
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

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), fullscreen=(self), payment=()"
      );
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
      res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    });

    next();
  };
}
