// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');

try {
  require('dotenv').config();
} catch {
  console.warn('dotenv not found, using default values');
}

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey1234';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminkey1234';

if (!REDIS_URL) {
  console.error('REDIS_URL is not set');
  process.exit(1);
}

// -------------------- Redis --------------------
const redis = new Redis(REDIS_URL);
redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error', err));

// -------------------- アプリ設定 --------------------
const AUTH_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL_SEC = 60 * 60 * 24; // 24 hours

// -------------------- ヘルパー関数 --------------------
function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatJSTTime(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function formatJSTTimeLog(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

function logUserAction(clientId, action, extra = {}) {
  const time = formatJSTTimeLog(new Date());
  const username = extra.username ? ` [Username:${extra.username}]` : '';
  const info = { ...extra };
  delete info.username;
  const extraStr = Object.keys(info).length ? ` ${JSON.stringify(info)}` : '';
  console.log(`[${time}] [User:${clientId}]${username} Action: ${action}${extraStr}`);
}

function sendNotification(target, message, type = 'info') {
  target.emit('notify', { message, type });
}

function createSystemMessage(htmlMessage) {
  return {
    username: 'システム',
    message: htmlMessage,
    time: formatJSTTime(new Date()),
    clientId: 'system',
    seed: 'system',
  };
}

function createAuthToken(clientId) {
  const timestamp = Date.now();
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(`${clientId}.${timestamp}`);
  return `${clientId}.${timestamp}.${hmac.digest('hex')}`;
}

async function validateAuthToken(token) {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [clientId, timestampStr, signature] = parts;
  const timestamp = Number(timestampStr);
  if (!timestamp) return null;
  if (Date.now() - timestamp > AUTH_TOKEN_MAX_AGE) return null;

  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(`${clientId}.${timestamp}`);
  const expectedSignature = hmac.digest('hex');
  if (expectedSignature !== signature) return null;

  const storedToken = await redis.get(`token:${clientId}`);
  if (storedToken !== token) return null;

  return clientId;
}

function extractTokenFromRequest(req) {
  // Accept token in body or Authorization header (Bearer or raw token)
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth) return null;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return auth;
}

// -------------------- ミドルウェア --------------------
async function requireSocketSession(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'No token' });

  const clientId = await validateAuthToken(token);
  if (!clientId) return res.status(403).json({ error: 'Invalid token' });

  const online = await redis.exists(`session:online:${clientId}`);
  if (!online) {
    return res.status(403).json({ error: 'Socket.IO session required' });
  }

  req.clientId = clientId;
  next();
}

// -------------------- Express & Socket.IO --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

// trust proxy を boolean で設定
app.set('trust proxy', true);

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

// -------------------- Socket.IO 認証（シンプル） --------------------
// -------------------- Express Middleware（シンプル） --------------------
// -------------------- 月次Redisリセット --------------------
async function monthlyRedisReset(ioInstance) {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentMonth = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}`;

  try {
    const savedMonth = await redis.get('system:current_month');
    if (savedMonth === currentMonth) return;

    const lockKey = 'system:reset_lock';
    const locked = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (!locked) return;

    console.log('[Redis] Month changed, flushdb start');

    const keys = await redis.keys('messages:*');
    const targetRoomIds = keys.map((k) => k.replace('messages:', ''));

    await redis.flushdb();
    await redis.set('system:current_month', currentMonth);

    const systemMessage = createSystemMessage('<strong>メンテナンスのためデータベースがリセットされました</strong>');

    for (const roomId of targetRoomIds) {
      ioInstance.to(roomId).emit('newMessage', {
        username: systemMessage.username,
        message: systemMessage.message,
        time: systemMessage.time,
        seed: systemMessage.seed,
      });
    }

    console.log('[Redis] Flushdb completed');
  } catch (err) {
    console.error('[Redis] Monthly reset failed', err);
  }
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId))
      return res.status(400).json({ error: 'invalid roomId' });

    const rawMessages = await redis.lrange(`messages:${roomId}`, 0, -1);
    const messages = rawMessages.map((m) => {
      const parsed = JSON.parse(m);
      return {
        username: parsed.username,
        message: parsed.message,
        time: parsed.time,
        seed: parsed.seed,
      };
    });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Redis error' });
  }
});

app.post('/api/messages', requireSocketSession, async (req, res) => {
  const { username, message, seed, roomId } = req.body;

  if (!roomId || !username || !message || !seed)
    return res.status(400).json({ error: 'Invalid data' });

  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId))
    return res.status(400).json({ error: 'invalid roomId' });

  if (username.length === 0 || username.length > 24)
    return res.status(400).json({ error: 'Username length invalid' });

  if (message.length === 0 || message.length > 800)
    return res.status(400).json({ error: 'Message length invalid' });

  const clientId = req.clientId;
  if (!clientId) return res.status(403).json({ error: 'Invalid token' });

  const MESSAGE_RATE_LIMIT_MS = 1000;
  const MUTE_DURATION_SEC = 30;

  const muteKey = `msg:mute:${clientId}`;
  if (await redis.exists(muteKey))
    return res.status(429).json({ error: 'Muted due to repeated messages' });

  const rateKey = `ratelimit:msg:${clientId}`;
  const lastSent = await redis.get(rateKey);
  const now = Date.now();
  if (lastSent && now - Number(lastSent) < MESSAGE_RATE_LIMIT_MS)
    return res.status(429).json({ error: 'Please wait before sending next message' });
  await redis.set(rateKey, now, 'PX', MESSAGE_RATE_LIMIT_MS);

  // --- スパム・ミュート判定 ---
  const lastMessageKey = `msg:last_message:${clientId}`;
  const lastTimeKey = `msg:last_time:${clientId}`;
  const repeatIntervalKey = `msg:repeat_interval_count:${clientId}`;

  const lastMessage = await redis.get(lastMessageKey);
  const lastTime = await redis.get(lastTimeKey);
  let intervalCount = Number(await redis.get(repeatIntervalKey)) || 0;

  if (lastMessage === message && lastTime) {
    const interval = now - Number(lastTime);
    const lastInterval = Number(await redis.get(`msg:last_interval:${clientId}`)) || 0;

    if (Math.abs(interval - lastInterval) < 250) {
      intervalCount++;
      await redis.set(repeatIntervalKey, intervalCount, 'EX', MUTE_DURATION_SEC);
      if (intervalCount >= 3) {
        await redis.set(`msg:mute:${clientId}`, '1', 'EX', MUTE_DURATION_SEC);
        await redis.del(repeatIntervalKey);
        io.to(clientId).emit('notify', { message: `スパムを検知したため${MUTE_DURATION_SEC}秒間ミュートされました`, type: 'warning' });
        return res.status(429).json({ error: 'Muted' });
      }
    } else {
      intervalCount = 1;
      await redis.set(repeatIntervalKey, intervalCount, 'EX', MUTE_DURATION_SEC);
    }

    await redis.set(`msg:last_interval:${clientId}`, interval, 'EX', MUTE_DURATION_SEC);
  } else {
    await redis.set(repeatIntervalKey, 1, 'EX', MUTE_DURATION_SEC);
  }

  await redis.set(lastMessageKey, message, 'EX', MUTE_DURATION_SEC);
  await redis.set(lastTimeKey, now, 'EX', MUTE_DURATION_SEC);

  const storedMessage = {
    username: escapeHTML(username),
    message: escapeHTML(message),
    time: formatJSTTime(new Date()),
    clientId,
    seed,
  };

  try {
    const roomKey = `messages:${roomId}`;
    const luaScript = `
            redis.call('RPUSH', KEYS[1], ARGV[1])
            redis.call('LTRIM', KEYS[1], -1000, -1)
            return 1
        `;
    await redis.eval(luaScript, 1, roomKey, JSON.stringify(storedMessage));

    io.to(roomId).emit('newMessage', storedMessage);
    logUserAction(clientId, 'sendMessage', { roomId, username: storedMessage.username, message: storedMessage.message });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Redis error' });
  }
});

// -------------------- 管理API --------------------
app.post('/api/clear', requireSocketSession, async (req, res) => {
  const { password, roomId } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: 'Unauthorized' });

  const clientId = req.clientId;
  if (!clientId) return res.status(403).json({ error: 'Invalid token' });

  const now = Date.now();
  const rateKey = `ratelimit:clear:${clientId}`;
  const last = await redis.get(rateKey);
  if (last && now - Number(last) < 30000)
    return res.status(429).json({ error: '削除には30秒以上間隔をあけてください' });
  await redis.set(rateKey, now, 'PX', 60000);

  if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId))
    return res.status(400).json({ error: 'invalid roomId' });

  const username = (await redis.get(`username:${clientId}`)) || 'unknown';
  await redis.del(`messages:${roomId}`);
  io.to(roomId).emit('clearMessages');
  sendNotification(io.to(roomId), '全メッセージ削除されました', 'warning');
  logUserAction(clientId, 'clearMessages', { roomId, username });
  res.json({ message: '全メッセージ削除しました' });
});

// -------------------- Socket.IO --------------------
io.on('connection', (socket) => {
  socket.on('authenticate', async ({ token, username } = {}) => {
    const now = Date.now();
    socket.data = socket.data || {};

    let clientId = token ? await validateAuthToken(token) : null;
    let newToken = null;

    if (!clientId) {
      const reissueKey = `ratelimit:reissue:socket:${socket.id}`;
      const last = await redis.get(reissueKey);
      if (last && now - Number(last) < 30000) {
        socket.emit('authRequired');
        return;
      }

      clientId = crypto.randomUUID();
      newToken = createAuthToken(clientId);
      await redis.set(`token:${clientId}`, newToken, 'EX', 86400);
      await redis.set(reissueKey, now, 'PX', 30000);
      socket.emit('assignToken', newToken);
    }

    socket.data.clientId = clientId;

    const key = `session:online:${clientId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, SESSION_TTL_SEC);
    }

    socket.data.sessionKey = key;

    if (typeof username === 'string' && username.length > 0 && username.length <= 24) {
      await redis.set(`username:${clientId}`, escapeHTML(username), 'EX', SESSION_TTL_SEC);
    }

    socket.emit('authenticated');
    socket.join(clientId);
  });

  socket.on('joinRoom', async ({ roomId } = {}) => {
    if (!socket.data.clientId) return socket.disconnect(true);
    if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return;

    if (socket.data.roomId) socket.leave(socket.data.roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;

    const username = await redis.get(`username:${socket.data.clientId}`);
    logUserAction(socket.data.clientId, 'joinRoom', { roomId, username });

    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', roomSize);
    socket.emit('joinedRoom', { roomId });
  });

  socket.on('disconnecting', async () => {
    const key = socket.data.sessionKey;
    if (!key) return;

    try {
      const count = await redis.decr(key);
      if (count <= 0) {
        await redis.del(key);
      }
    } catch (e) {
      console.error('[session] decr failed', e);
    }

    const roomId = socket.data.roomId;
    if (roomId) {
      const roomSize = (io.sockets.adapter.rooms.get(roomId)?.size || 1) - 1;
      io.to(roomId).emit('roomUserCount', roomSize);
    }

    if (socket.data.clientId) {
      const username = await redis.get(`username:${socket.data.clientId}`);
      logUserAction(socket.data.clientId, 'disconnecting', { roomId, username });
    }
  });
});

// -------------------- SPA対応 --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

// -------------------- サーバー起動 --------------------
(async () => {
  try {
    await monthlyRedisReset(io);

    cron.schedule(
      '0 0 0 1 * *',
      async () => {
        console.log('[Cron] Running monthly Redis reset...');
        await monthlyRedisReset(io);
      },
      { timezone: 'Asia/Tokyo' }
    );
  } catch (err) {
    console.error('Monthly reset check failed', err);
  } finally {
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  }
})();
