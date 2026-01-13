// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const cron = require('node-cron');

try {
  require('dotenv').config();
} catch {
  console.warn('dotenv not found, using default values');
}

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey1234';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminkey1234';

// -------------------- アプリ設定 --------------------
const AUTH_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL_SEC = 60 * 60 * 24; // 24 hours

// -------------------- インメモリストア --------------------
const tokenStore = new Map();
const sessionCounts = new Map();
const sessionExpiryTimers = new Map();
const usernameStore = new Map();
const messagesStore = new Map();
const simpleKV = new Map();

let systemCurrentMonth = null;
let resetLock = false;

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

// -------------------- simpleKV --------------------
function kvSet(key, value, ttlSec) {
  if (simpleKV.has(key)) clearTimeout(simpleKV.get(key).timeout);
  const timeout = ttlSec ? setTimeout(() => simpleKV.delete(key), ttlSec * 1000) : null;
  simpleKV.set(key, { value, timeout });
}

function kvGet(key) {
  const v = simpleKV.get(key);
  return v ? v.value : null;
}

function kvDel(key) {
  if (simpleKV.has(key)) clearTimeout(simpleKV.get(key).timeout);
  simpleKV.delete(key);
}

// -------------------- 認証 --------------------
async function validateAuthToken(token) {
  if (!token) return null;
  const [clientId, ts, sig] = token.split('.');
  if (!clientId || !ts || !sig) return null;
  if (Date.now() - Number(ts) > AUTH_TOKEN_MAX_AGE) return null;

  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(`${clientId}.${ts}`);
  if (hmac.digest('hex') !== sig) return null;

  return tokenStore.get(clientId) === token ? clientId : null;
}

function extractTokenFromRequest(req) {
  return req.body?.token || req.headers.authorization || null;
}

async function requireSocketSession(req, res, next) {
  const token = extractTokenFromRequest(req);
  const clientId = await validateAuthToken(token);
  if (!clientId || !sessionCounts.has(clientId)) return res.status(403).json({ error: 'Invalid session' });
  req.clientId = clientId;
  next();
}

// -------------------- Express & Socket.IO --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));
app.set('trust proxy', true);

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

// -------------------- 月次リセット --------------------
async function monthlyMemoryReset(ioInstance) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentMonth = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}`;

  if (systemCurrentMonth === currentMonth || resetLock) return;
  resetLock = true;
  setTimeout(() => (resetLock = false), 30000);

  const rooms = [...messagesStore.keys()];
  messagesStore.clear();
  systemCurrentMonth = currentMonth;

  const msg = createSystemMessage('<strong>メンテナンスのためデータがリセットされました</strong>');
  rooms.forEach((r) => ioInstance.to(r).emit('newMessage', msg));
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (!/^[\w-]{1,32}$/.test(roomId)) return res.status(400).json({ error: 'invalid roomId' });
  res.json((messagesStore.get(roomId) || []).map(({ username, message, time, seed }) => ({ username, message, time, seed })));
});

app.post('/api/messages', requireSocketSession, (req, res) => {
  const { username, message, seed, roomId } = req.body;
  if (!roomId || !username || !message || !seed) return res.status(400).json({ error: 'Invalid data' });

  const clientId = req.clientId;
  const now = Date.now();

  if (kvGet(`msg:mute:${clientId}`)) return res.status(429).json({ error: 'Muted' });

  const last = kvGet(`ratelimit:${clientId}`);
  if (last && now - last < 1000) return res.status(429).json({ error: 'Rate limit' });
  kvSet(`ratelimit:${clientId}`, now, 1);

  const msg = { username: escapeHTML(username), message: escapeHTML(message), time: formatJSTTime(new Date()), clientId, seed };
  const list = messagesStore.get(roomId) || [];
  list.push(msg);
  if (list.length > 1000) list.splice(0, list.length - 1000);
  messagesStore.set(roomId, list);

  io.to(roomId).emit('newMessage', msg);
  logUserAction(clientId, 'sendMessage', { roomId, username: msg.username });
  res.json({ ok: true });
});

// -------------------- 管理API --------------------
app.post('/api/clear', requireSocketSession, (req, res) => {
  const { password, roomId } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: 'Unauthorized' });
  messagesStore.delete(roomId);
  io.to(roomId).emit('clearMessages');
  sendNotification(io.to(roomId), '全メッセージ削除されました', 'warning');
  res.json({ ok: true });
});

// -------------------- Socket.IO --------------------
io.on('connection', (socket) => {
  socket.on('authenticate', ({ token, username } = {}) => {
    let clientId = token && tokenStore.get(token) ? token : null;
    if (!clientId) {
      clientId = crypto.randomUUID();
      const t = createAuthToken(clientId);
      tokenStore.set(clientId, t);
      socket.emit('assignToken', t);
    }

    sessionCounts.set(clientId, (sessionCounts.get(clientId) || 0) + 1);
    socket.data.clientId = clientId;

    if (username) usernameStore.set(clientId, escapeHTML(username));

    socket.join(clientId);
    socket.emit('authenticated');
  });

  socket.on('joinRoom', ({ roomId }) => {
    if (!socket.data.clientId || !/^[\w-]{1,32}$/.test(roomId)) return;
    socket.join(roomId);
    socket.data.roomId = roomId;
    io.to(roomId).emit('roomUserCount', io.sockets.adapter.rooms.get(roomId)?.size || 0);
  });

  socket.on('disconnecting', () => {
    const id = socket.data.clientId;
    if (!id) return;
    const c = (sessionCounts.get(id) || 1) - 1;
    c <= 0 ? sessionCounts.delete(id) : sessionCounts.set(id, c);
  });
});

// -------------------- SPA対応 --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (_, res) => res.sendFile(`${__dirname}/public/index.html`));

// -------------------- サーバー起動 --------------------
(async () => {
  await monthlyMemoryReset(io);
  cron.schedule('0 0 0 1 * *', () => monthlyMemoryReset(io), { timezone: 'Asia/Tokyo' });
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
