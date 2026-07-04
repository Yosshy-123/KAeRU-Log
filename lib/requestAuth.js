'use strict';

const { clearAuthCookie, getAuthTokenFromRequest } = require('./authCookie');

const DEFAULT_AUTH_ERROR = {
  status: 403,
  body: { error: 'Authentication required', code: 'no_token' },
};

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function sendAuthError(res, status = DEFAULT_AUTH_ERROR.status, code = DEFAULT_AUTH_ERROR.body.code) {
  clearAuthCookie(res);

  return res.status(status).json({
    error: DEFAULT_AUTH_ERROR.body.error,
    code,
  });
}
function requireRequestAuthContext(req, res) {
  const clientId = normalizeString(req?.clientId);
  const token = getAuthTokenFromRequest(req);

  if (!clientId || !token) {
    sendAuthError(res);
    return null;
  }

  return { clientId, token };
}

module.exports = {
  requireRequestAuthContext,
  sendAuthError,
};
