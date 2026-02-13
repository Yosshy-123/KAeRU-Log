import { SERVER_URL, AUTH_RETRY_COOLDOWN_MS } from './config.js';
import { state } from './state.js';

async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, { ...opts, signal: controller.signal });
  clearTimeout(id);
  return response;
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      state.authPromise = null;
      throw new Error(`auth failed: ${res.status} ${text}`);
    }

    const data = await res.json();

    if (data?.token) {
      state.myToken = data.token;
      localStorage.setItem('chatToken', state.myToken);

      if (data.username && (!state.myName || state.myName !== data.username)) {
        state.myName = data.username;
        localStorage.setItem('chat_username', state.myName);
      }

      state.authPromise = null;
      return state.myToken;
    }

    state.authPromise = null;
    throw new Error('invalid auth response');
  })();

  return state.authPromise;
}

export async function fetchWithAuth(url, opts = {}, retry = true) {
  opts.headers = opts.headers || {};

  if (state.myToken) {
    opts.headers['Authorization'] = `Bearer ${state.myToken}`;
  }

  const res = await fetchWithTimeout(url, opts);

  if ((res.status === 401 || res.status === 403) && retry) {
    let code = null;

    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await res.clone().json().catch(() => null);
        code = body?.code;
      }
    } catch (e) {}

    if (code === 'token_expired') {
      try {
        await obtainToken();
      } catch (e) {
        return res;
      }

      opts.headers['Authorization'] = `Bearer ${state.myToken}`;
      return await fetchWithAuth(url, opts, false);
    }
  }

  return res;
}