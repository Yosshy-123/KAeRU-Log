// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');

require('dotenv').config();

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
const redisClient = new Redis(REDIS_URL);
redisClient.on('connect', () => console.log('Redis connected'));
redisClient.on('error', (err) => console.error('Redis error', err));

// -------------------- 設定 --------------------
const AUTH_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = 60 * 60 * 24;

// -------------------- ユーティリティ --------------------
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
  return jst.toISOString().slice(0, 16).replace('T', ' ');
}

function formatJSTTimeLog(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('T', ' ').slice(0, 19);
}

function logUserAction(clientId, action, extra = {}) {
  const time = formatJSTTimeLog(new Date());
  console.log(`[${time}] [User:${clientId}] ${action}`, extra);
}

function createSystemMessage(html) {
  return {
    username: 'システム',
    message: html,
    time: formatJSTTime(new Date()),
    clientId: 'system',
    seed: 'system',
  };
}

// -------------------- 認証トークン --------------------
function createAuthToken(clientId) {
  const timestamp = Date.now();
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(`${clientId}.${timestamp}`);
  return `${clientId}.${timestamp}.${hmac.digest('hex')}`;
}

async function validateAuthToken(token) {
  if (!token) return null;
  const [clientId, ts, sig] = token.split('.');
  if (!clientId || !ts || !sig) return null;

  if (Date.now() - Number(ts) > AUTH_TOKEN_MAX_AGE) return null;

  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(`${clientId}.${ts}`);
  if (hmac.digest('hex') !== sig) return null;

  const stored = await redisClient.get(`token:${clientId}`);
  return stored === token ? clientId : null;
}

// -------------------- Express --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

// -------------------- セッション必須 --------------------
async function requireSocketSession(req, res, next) {
  const token = req.body.token || req.headers.authorization;
  const clientId = await validateAuthToken(token);
  if (!clientId) return res.status(403).json({ error: 'Invalid token' });
  req.clientId = clientId;
  next();
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  if (!/^[\w-]{1,32}$/.test(roomId)) return res.status(400).json({ error: 'invalid roomId' });

  const list = await redisClient.lrange(`messages:${roomId}`, 0, -1);
  res.json(list.map(JSON.parse));
});

app.post('/api/messages', requireSocketSession, async (req, res) => {
  const { username, message, roomId, seed } = req.body;
  if (!roomId || !username || !message || !seed)
    return res.status(400).json({ error: 'Invalid data' });

  const stored = {
    username: escapeHTML(username),
    message: escapeHTML(message),
    time: formatJSTTime(new Date()),
    clientId: req.clientId,
    seed,
  };

  await redisClient.rpush(`messages:${roomId}`, JSON.stringify(stored));
  await redisClient.ltrim(`messages:${roomId}`, -1000, -1);

  io.to(roomId).emit('newMessage', stored);
  logUserAction(req.clientId, 'sendMessage', { roomId });

  res.json({ ok: true });
});

// -------------------- 管理 API --------------------
app.post('/api/clear', requireSocketSession, async (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ error: 'Unauthorized' });

  const { roomId } = req.body;
  await redisClient.del(`messages:${roomId}`);
  io.to(roomId).emit('clearMessages');

  res.json({ ok: true });
});

// -------------------- Socket.IO --------------------
io.on('connection', (socket) => {
  socket.on('authenticate', async ({ token, username }) => {
    let clientId = await validateAuthToken(token);

    if (!clientId) {
      clientId = crypto.randomUUID();
      const newToken = createAuthToken(clientId);
      await redisClient.set(`token:${clientId}`, newToken, 'EX', 86400);
      socket.emit('assignToken', newToken);
    }

    socket.data.clientId = clientId;

    if (username) {
      await redisClient.set(`username:${clientId}`, escapeHTML(username), 'EX', SESSION_TTL_SEC);
    }

    socket.emit('authenticated');
    socket.join(clientId);
  });

  socket.on('joinRoom', async ({ roomId }) => {
    if (!/^[\w-]{1,32}$/.test(roomId)) return;
    socket.join(roomId);
    socket.data.roomId = roomId;

    const size = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', size);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      const size = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit('roomUserCount', size);
    }
  });
});

// -------------------- 月次 Redis リセット --------------------
async function monthlyRedisReset() {
  const now = new Date();
  const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const saved = await redisClient.get('system:current_month');
  if (saved === month) return;

  await redisClient.flushdb();
  await redisClient.set('system:current_month', month);
  console.log('[Redis] Monthly reset completed');
}

// -------------------- 起動 --------------------
(async () => {
  await monthlyRedisReset();

  cron.schedule('0 0 0 1 * *', monthlyRedisReset, {
    timezone: 'Asia/Tokyo',
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
