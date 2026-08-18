const memoryStore = new Map();

function hasLocalStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function safeGetItem(key, fallback = '') {
  if (typeof key !== 'string' || !key) {
    return fallback;
  }

  try {
    if (hasLocalStorage()) {
      return globalThis.localStorage.getItem(key) ?? fallback;
    }
  } catch {
    // fall through to memory store
  }

  return memoryStore.has(key) ? memoryStore.get(key) : fallback;
}

export function safeSetItem(key, value) {
  if (typeof key !== 'string' || !key) {
    return false;
  }

  const stringValue = String(value ?? '');

  try {
    if (hasLocalStorage()) {
      globalThis.localStorage.setItem(key, stringValue);
      return true;
    }
  } catch {
    // fall through to memory store
  }

  memoryStore.set(key, stringValue);
  return true;
}
