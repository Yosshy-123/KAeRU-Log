// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cron = require('node-cron');

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminpass';

// -------------------- InMemoryRedis --------------------
class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  _setExpire(key, ms) {
    if (this.timers.has(key)) clearTimeout(this.timers.get(key));
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, ms);
    this.timers.set(key, timer);
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value, mode, ttl) {
    this.store.set(key, value);

    if (mode === 'EX' && typeof ttl === 'number') {
      this._setExpire(key, ttl * 1000);
    } else if (mode === 'PX' && typeof ttl === 'number') {
      this._setExpire(key, ttl);
    }
    return 'OK';
  }

  async del(key) {
    this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return 1;
  }

  async exists(key) {
    return this.store.has(key) ? 1 : 0;
  }

  async rpush(key, value) {
    const list = this.store.get(key) || [];
    list.push(value);
    this.store.set(key, list);
    return list.length;
  }

  async lrange(key, start, stop) {
    const list = this.store.get(key) || [];
    const len = list.length;

    const s = start < 0 ? Math.max(len + start, 0) : start;
    const e = stop < 0 ? len + stop + 1 : Math.min(stop + 1, len);

    if (s >= e) return [];
    return list.slice(s, e);
  }

  async ltrim(key, start, stop) {
    const list = this.store.get(key) || [];
    const len = list.length;

    const s = start < 0 ? Math.max(len + start, 0) : start;
    const e = stop < 0 ? len + stop + 1 : Math.min(stop + 1, len);

    this.store.set(key, list.slice(s, e));
    return 'OK';
  }

  async keys(pattern) {
    if (pattern === '*') return [...this.store.keys()];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...this.store.keys()].filter((k) => regex.test(k));
  }

  async flushdb() {
    this.store.clear();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    return 'OK';
  }
}

const redis = new InMemoryRedis();

// -------------------- 定数 --------------------
const AUTH_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = 60 * 60 * 24;
const MESSAGE_RATE_LIMIT_MS = 1000;

// -------------------- Utility --------------------
function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatJST(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

function validRoomId(roomId) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(roomId);
}

// -------------------- Token --------------------
function createAuthToken(clientId) {
  const ts = Date.now();
  const sig = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${clientId}.${ts}`)
    .digest('hex');
  return `${clientId}.${ts}.${sig}`;
}

async function validateAuthToken(token) {
  if (!token) return null;
  const [id, ts, sig] = token.split('.');
  if (!id || !ts || !sig) return null;
  if (Date.now() - Number(ts) > AUTH_TOKEN_MAX_AGE) return null;

  const expected = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${id}.${ts}`)
    .digest('hex');

  if (expected !== sig) return null;
  return (await redis.get(`token:${id}`)) === token ? id : null;
}

// -------------------- Express --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// -------------------- Middleware --------------------
async function requireSession(req, res, next) {
  const token = req.body.token || req.headers.authorization;
  const clientId = await validateAuthToken(token);
  if (!clientId) return res.status(403).json({ error: 'Invalid token' });
  req.clientId = clientId;
  next();
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  if (!validRoomId(roomId))
    return res.status(400).json({ error: 'invalid roomId' });

  const list = await redis.lrange(`messages:${roomId}`, 0, -1);
  res.json(list.map(JSON.parse));
});

const lastSendMap = new Map();

app.post('/api/messages', requireSession, async (req, res) => {
  const { roomId, username, message, seed } = req.body;

  if (!validRoomId(roomId))
    return res.status(400).json({ error: 'invalid roomId' });

  if (!username || !message || !seed)
    return res.status(400).json({ error: 'Invalid data' });

  const last = lastSendMap.get(req.clientId) || 0;
  if (Date.now() - last < MESSAGE_RATE_LIMIT_MS)
    return res.status(429).json({ error: 'Too fast' });

  lastSendMap.set(req.clientId, Date.now());

  const msg = {
    username: escapeHTML(username),
    message: escapeHTML(message),
    time: formatJST(),
    clientId: req.clientId,
    seed,
  };

  await redis.rpush(`messages:${roomId}`, JSON.stringify(msg));
  await redis.ltrim(`messages:${roomId}`, -1000, -1);

  io.to(roomId).emit('newMessage', msg);
  res.json({ ok: true });
});

app.post('/api/clear', requireSession, async (req, res) => {
  if (req.body.password !== ADMIN_PASS)
    return res.status(403).json({ error: 'Unauthorized' });

  if (!validRoomId(req.body.roomId))
    return res.status(400).json({ error: 'invalid roomId' });

  await redis.del(`messages:${req.body.roomId}`);
  io.to(req.body.roomId).emit('clearMessages');
  res.json({ ok: true });
});

// -------------------- Socket.IO --------------------
io.on('connection', (socket) => {
  socket.on('authenticate', async ({ token, username }) => {
    let clientId = await validateAuthToken(token);

    if (!clientId) {
      clientId = crypto.randomUUID();
      const newToken = createAuthToken(clientId);
      await redis.set(`token:${clientId}`, newToken, 'EX', 86400);
      socket.emit('assignToken', newToken);
    }

    socket.data.clientId = clientId;

    if (typeof username === 'string' && username.length <= 24) {
      await redis.set(
        `username:${clientId}`,
        escapeHTML(username),
        'EX',
        SESSION_TTL_SEC
      );
    }

    socket.join(clientId);
    socket.emit('authenticated');
  });

  socket.on('joinRoom', ({ roomId }) => {
    if (!validRoomId(roomId)) return;
    socket.join(roomId);
    socket.data.roomId = roomId;

    const size = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', size);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const size = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', size);
  });
});

// -------------------- Monthly Reset --------------------
async function monthlyReset() {
  await redis.flushdb();
  lastSendMap.clear();
  console.log('[MemoryDB] Monthly flushdb');
}

cron.schedule('0 0 0 1 * *', monthlyReset, {
  timezone: 'Asia/Tokyo',
});

// -------------------- Start --------------------
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
