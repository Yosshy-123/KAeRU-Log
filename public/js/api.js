import { SERVER_URL, AUTH_RETRY_COOLDOWN_MS } from './config.js';
import { state } from './state.js';
import { safeSetItem } from './storage.js';

async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timerId);
  }
}

async function readJsonSafely(res) {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}

function buildAuthError(res, fallback) {
  const err = new Error(fallback);
  err.status = res.status;
  return err;
}

export async function obtainToken() {
  if (state.authPromise) return state.authPromise;

  const now = Date.now();
  if (now - state.lastAuthAttempt < AUTH_RETRY_COOLDOWN_MS) {
    throw new Error('authCooldown');
  }
  state.lastAuthAttempt = now;

  state.authPromise = (async () => {
    const reqBody = {};
    if (state.myName) reqBody.username = state.myName;

    const res = await fetchWithTimeout(`${SERVER_URL}/api/auth`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const body = await readJsonSafely(res);
      const message = typeof body?.error === 'string' && body.error.trim()
        ? body.error
        : res.status === 429
          ? '認証要求が多すぎます'
          : '認証に失敗しました';
      throw buildAuthError(res, message);
    }

    const data = await res.json().catch(() => null);

    if (data?.username && (!state.myName || state.myName !== data.username)) {
      state.myName = data.username;
      safeSetItem('chat_username', state.myName);
    }

    return true;
  })();

  try {
    return await state.authPromise;
  } finally {
    state.authPromise = null;
  }
}

export async function fetchWithAuth(url, opts = {}, retry = true) {
  const requestOptions = {
    ...opts,
    credentials: 'include',
    headers: { ...(opts.headers || {}) },
  };

  const res = await fetchWithTimeout(url, requestOptions);

  if ((res.status === 401 || res.status === 403) && retry) {
    let code = null;

    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await res.clone().json().catch(() => null);
        code = body?.code;
      }
    } catch {
      code = null;
    }

    if (code === 'token_expired' || code === 'no_token') {
      const refreshedToken = await obtainToken().catch(() => null);
      if (!refreshedToken) {
        return res;
      }

      return await fetchWithAuth(url, { ...opts }, false);
    }
  }

  return res;
}
