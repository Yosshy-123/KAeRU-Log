'use strict';

const net = require('net');

const DEFAULTS = {
  MAX_HEADER_LENGTH: 200,
  MAX_IP_PART_LENGTH: 50,
};

/**
 * Return true if ip is a syntactically valid IPv4 or IPv6 address.
 * Strips surrounding brackets and rejects obvious injection characters.
 */
function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const cleaned = ip.trim().replace(/^\[|\]$/g, '');
  if (/[\r\n<>;]/.test(cleaned)) return false;
  return net.isIP(cleaned) !== 0;
}

/**
 * Parse X-Forwarded-For header safely and return the first valid IP (left-most).
 * Returns null if header invalid or no valid IP found.
 */
function parseXForwardedFor(header, options = {}) {
  if (!header || typeof header !== 'string') return null;

  const maxHeaderLength = options.maxHeaderLength || DEFAULTS.MAX_HEADER_LENGTH;
  const maxIpPartLength = options.maxIpPartLength || DEFAULTS.MAX_IP_PART_LENGTH;

  if (header.length > maxHeaderLength) return null;
  if (/[\r\n<>;]/.test(header)) return null;

  const parts = header.split(',').map((p) => (p || '').trim()).filter(Boolean);
  if (parts.length === 0) return null;

  for (const part of parts) {
    const candidate = part.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').trim();
    if (!candidate) continue;
    if (candidate.length > maxIpPartLength) continue;
    if (isValidIp(candidate)) return candidate;
  }

  return null;
}

/**
 * Safely get client IP from request.
 *
 * Options:
 *  - proxyMode: boolean to override process.env.PROXY detection
 *  - allowUntrustedProxy: boolean (DANGEROUS) allow XFF even when immediate remote isn't local/private
 *  - maxHeaderLength / maxIpPartLength forwarded to parseXForwardedFor
 *
 * Behavior:
 *  - If proxyMode is true, and immediate remote is loopback or private, will accept X-Forwarded-For (left-most valid IP).
 *  - Otherwise immediate remote (socket) is returned if valid.
 *  - Always returns a sanitized IP string or null.
 */
function getClientIp(req, options = {}) {
  try {
    const proxyModeEnv = String(process.env.PROXY || '').toLowerCase() === 'true';
    const proxyMode = typeof options.proxyMode === 'boolean' ? options.proxyMode : proxyModeEnv;

    const remoteAddress =
      (req && req.socket && req.socket.remoteAddress) ||
      (req && req.connection && req.connection.remoteAddress) ||
      (typeof req.ip === 'string' ? req.ip : null) ||
      null;

    const normalizedRemote = typeof remoteAddress === 'string' ? remoteAddress.replace(/^\[|\]$/g, '') : null;

    if (proxyMode) {
      const xff = (req && req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'])) || null;
      if (xff && typeof xff === 'string') {
        const allowUntrusted = options.allowUntrustedProxy === true;

        // Allow XFF only if immediate remote is loopback or private (conservative),
        // or if explicitly allowed via options (dangerous).
        let allowHeader = false;
        if (normalizedRemote) {
          const r = normalizedRemote;
          if (r === '127.0.0.1' || r === '::1') {
            allowHeader = true;
          } else if (/^10\./.test(r) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(r) || /^192\.168\./.test(r) || /^fd[0-9a-fA-F]:/.test(r)) {
            allowHeader = true;
          }
        }

        if (allowHeader || allowUntrusted) {
          const parsed = parseXForwardedFor(xff, options);
          if (parsed) return parsed;
        }
      }
    }

    if (normalizedRemote && isValidIp(normalizedRemote)) return normalizedRemote;
    if (req && typeof req.ip === 'string' && isValidIp(req.ip)) return req.ip;

    return null;
  } catch (err) {
    // Fail closed
    return null;
  }
}

module.exports = {
  getClientIp,
  parseXForwardedFor,
  isValidIp,
};