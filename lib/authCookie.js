'use strict';

const AUTH_COOKIE_NAME = 'kaeru_token';

function normalizeCookieName(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : AUTH_COOKIE_NAME;
}

function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim() === '') {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) {
      return acc;
    }

    const eqIndex = trimmed.indexOf('=');
    const rawName = eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed;
    const rawValue = eqIndex >= 0 ? trimmed.slice(eqIndex + 1) : '';

    if (!rawName) {
      return acc;
    }

    const name = rawName.trim();
    if (!name) {
      return acc;
    }

    try {
      acc[name] = decodeURIComponent(rawValue);
    } catch {
      acc[name] = rawValue;
    }

    return acc;
  }, {});
}

function getRequestCookieHeader(req) {
  const header = req?.headers?.cookie;
  return Array.isArray(header) ? header[0] : header;
}

function getAuthTokenFromCookieHeader(cookieHeader, cookieName = AUTH_COOKIE_NAME) {
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[normalizeCookieName(cookieName)];
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function getAuthTokenFromRequest(req, cookieName = AUTH_COOKIE_NAME) {
  return getAuthTokenFromCookieHeader(getRequestCookieHeader(req), cookieName);
}

function appendSetCookie(res, cookieValue) {
  if (!res || typeof res.getHeader !== 'function' || typeof res.setHeader !== 'function') {
    return false;
  }

  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue);
    return true;
  }

  const next = Array.isArray(current) ? current.concat(cookieValue) : [current, cookieValue];
  res.setHeader('Set-Cookie', next);
  return true;
}

function serializeCookie(name, value, options = {}) {
  const cookieName = normalizeCookieName(name);
  const segments = [`${cookieName}=${encodeURIComponent(String(value ?? ''))}`];

  if (options.maxAge !== undefined) {
    const maxAge = Number(options.maxAge);
    if (Number.isFinite(maxAge) && maxAge >= 0) {
      segments.push(`Max-Age=${Math.floor(maxAge)}`);
    }
  }

  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  segments.push(`Path=${typeof options.path === 'string' && options.path ? options.path : '/'}`);

  const sameSite = typeof options.sameSite === 'string' ? options.sameSite.trim().toLowerCase() : 'lax';
  if (sameSite === 'none' || sameSite === 'strict' || sameSite === 'lax') {
    segments.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`);
  } else {
    segments.push('SameSite=Lax');
  }

  if (options.secure) {
    segments.push('Secure');
  }

  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }

  return segments.join('; ');
}

function setAuthCookie(res, token, options = {}) {
  if (!token) {
    return false;
  }

  const cookie = serializeCookie(AUTH_COOKIE_NAME, token, {
    maxAge: options.maxAge,
    expires: options.expires,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    httpOnly: true,
  });

  return appendSetCookie(res, cookie);
}

function clearAuthCookie(res, options = {}) {
  const cookie = serializeCookie(AUTH_COOKIE_NAME, '', {
    maxAge: 0,
    expires: new Date(0),
    path: options.path,
    sameSite: options.sameSite || 'lax',
    secure: options.secure,
    httpOnly: true,
  });

  return appendSetCookie(res, cookie);
}

module.exports = {
  getAuthTokenFromRequest,
  clearAuthCookie,
  setAuthCookie,
};
