const KEYS = require('../lib/redisKeys');

/**
 * 非同期に username を取得するが、100ms タイムアウトを設けて
 * ログが Redis の遅延で固まらないようにする。
 */
function fetchUsernameWithTimeout(redisClient, clientId, timeoutMs = 100) {
  if (!clientId) return Promise.resolve('-');
  const p = redisClient.get(KEYS.username(clientId)).catch(() => null);
  const t = new Promise((res) => setTimeout(() => res(null), timeoutMs));
  return Promise.race([p, t]).then((v) => v || '-');
}

async function logAction(redisClient, { user, action, extra = {} } = {}) {
  if (!action) throw new Error("logAction: 'action' must be specified");
  const time = new Date().toISOString();
  const clientId = user ?? '-';
  const username = await fetchUsernameWithTimeout(redisClient, clientId).catch(() => '-');
  const extraStr = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  // console.log は同期的だが、username 取得は最大 timeoutMs
  console.log(`[${time}] [User:${clientId}] [Username:${username}] Action: ${action}${extraStr}`);
}

module.exports = logAction;
