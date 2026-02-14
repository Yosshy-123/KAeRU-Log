module.exports = async function (redisClient, { user, action, extra = {} } = {}) {
  if (!action) throw new Error("rawLogAction: 'action' must be specified");

  // timestamp in JST for readability
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const time = jst.toISOString().replace('T', ' ').slice(0, 19);

  const clientId = user ?? '-';

  // try to fetch username with a small timeout to avoid blocking
  async function fetchUsername(timeoutMs = 100) {
    if (!user) return '-';
    try {
      const getPromise = redisClient.get(`username:${user}`);
      const timeout = new Promise((res) => setTimeout(() => res(null), timeoutMs));
      const val = await Promise.race([getPromise, timeout]);
      return val || '-';
    } catch (err) {
      return '-';
    }
  }

  let username = '-';
  try {
    username = await fetchUsername(100);
  } catch (e) {
    username = '-';
  }

  const extraStr = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';

  // console.log used for simplicity; replace with proper logger if available
  try {
    console.log(`[${time}] [User:${clientId}] [Username:${username}] Action: ${action}${extraStr}`);
  } catch (e) {
    // don't throw from logger
    try { console.error('Logger output failed', e); } catch {}
  }
};