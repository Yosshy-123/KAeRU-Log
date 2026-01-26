'use strict';

// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');
const cors = require('cors');

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!ADMIN_PASS) {
  console.error('ADMIN_PASS is not set');
  process.exit(1);
}
if (!REDIS_URL) {
  console.error('REDIS_URL is not set');
  process.exit(1);
}
if (!FRONTEND_URL) {
  console.error('FRONTEND_URL is not set');
  process.exit(1);
}

// -------------------- Redis --------------------
const redisClient = new Redis(REDIS_URL);
redisClient.on('connect', () => console.log('Redis connected'));
redisClient.on('error', (err) => console.error('Redis error', err));

// -------------------- 設定値 --------------------
const BASE_MUTE_SEC = 30;
const MAX_MUTE_SEC = 60 * 10; // 10 minutes
const SPAM_CHECK_WINDOW = 60; // 連続送信カウント用 TTL
const MESSAGE_RATE_LIMIT_MS = 1000;
const REPEAT_LIMIT = 3;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

// -------------------- ヘルパー関数 --------------------
function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toJST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatJST(date = new Date(), withSeconds = false) {
  const jst = toJST(date);
  const yyyy = jst.getUTCFullYear();
  const mm = pad(jst.getUTCMonth() + 1);
  const dd = pad(jst.getUTCDate());
  const hh = pad(jst.getUTCHours());
  const mi = pad(jst.getUTCMinutes());
  if (withSeconds) {
    const ss = pad(jst.getUTCSeconds());
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
  }
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function createSystemMessage(htmlMessage) {
  return {
    username: 'システム',
    message: htmlMessage,
    time: formatJST(new Date()),
    clientId: 'system',
    seed: 'system',
  };
}

// -------------------- 汎用ログ --------------------
async function logAction({ user, action, extra = {} } = {}) {
  if (!action) throw new Error("logAction: 'action' must be specified");

  const time = formatJST(new Date(), true);
  const clientId = user ?? '-';

  let username = '-';
  if (user) {
    try {
      username = (await redisClient.get(`username:${user}`)) || '-';
    } catch {
      username = '-';
    }
  }

  const extraStr =
    extra && Object.keys(extra).length > 0
      ? ` ${JSON.stringify(extra)}`
      : '';

  console.log(
    `[${time}] [User:${clientId}] [Username:${username}] Action: ${action}${extraStr}`
  );
}

// -------------------- Redis SCAN helper --------------------
async function scanKeys(pattern) {
  return new Promise((resolve, reject) => {
    const stream = redisClient.scanStream({ match: pattern, count: 100 });
    const keys = [];
    stream.on('data', (resultKeys) => {
      if (resultKeys && resultKeys.length) keys.push(...resultKeys);
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', (err) => reject(err));
  });
}

// -------------------- Rate limit helpers --------------------
async function checkIpRateLimit(key, limit, windowSec) {
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.expire(key, windowSec);
  return count <= limit;
}

// -------------------- Redis TTL / ミュート helpers --------------------
async function getOrResetByTTL(key, defaultValue = 0, expireSec = 0) {
  let value = Number(await redisClient.get(key)) || 0;
  const ttl = await redisClient.ttl(key);

  if (ttl === -2) {
    value = defaultValue;
    if (expireSec > 0) {
      await redisClient.set(key, value, 'EX', expireSec);
    }
  }

  return value;
}

async function applySpamMute(clientId) {
  const muteKey = `msg:mute:${clientId}`;
  const muteLevelKey = `msg:mute_level:${clientId}`;
  const lastMuteKey = `msg:last_mute:${clientId}`;

  let muteLevel = await getOrResetByTTL(muteLevelKey, 0, 10 * 60);

  const muteSeconds = Math.min(BASE_MUTE_SEC * 2 ** muteLevel, MAX_MUTE_SEC);

  await redisClient.set(muteKey, '1', 'EX', muteSeconds);
  await redisClient.set(muteLevelKey, muteLevel + 1, 'EX', 10 * 60);
  await redisClient.set(lastMuteKey, Date.now(), 'EX', 10 * 60);

  return muteSeconds;
}

async function checkRateLimit(key, windowMs) {
  const last = await getOrResetByTTL(key, 0, Math.ceil(windowMs / 1000));
  const now = Date.now();
  if (last && now - Number(last) < windowMs) return false;
  await redisClient.set(key, now, 'PX', windowMs);
  return true;
}

async function checkCountLimit(key, limit, windowSec) {
  const count = await getOrResetByTTL(key, 0, windowSec);
  if (count + 1 > limit) return false;
  await redisClient.incr(key);
  return true;
}

// --- spam-check 共通関数 ---
async function handleSpamCheck(clientId) {
  const lastTimeKey = `msg:last_time:${clientId}`;
  const repeatCountKey = `msg:repeat_interval_count:${clientId}`;
  const lastIntervalKey = `msg:last_interval:${clientId}`;

  const lastTime = Number(await redisClient.get(lastTimeKey)) || 0;
  const lastInterval = Number(await redisClient.get(lastIntervalKey)) || 0;
  let intervalCount = Number(await redisClient.get(repeatCountKey)) || 0;

  const now = Date.now();
  const interval = now - lastTime;

  if (lastTime && Math.abs(interval - lastInterval) < 300) {
    intervalCount++;
  } else {
    intervalCount = 1;
  }

  await redisClient.set(repeatCountKey, intervalCount, 'EX', SPAM_CHECK_WINDOW);
  await redisClient.set(lastIntervalKey, interval, 'EX', SPAM_CHECK_WINDOW);
  await redisClient.set(lastTimeKey, now, 'EX', SPAM_CHECK_WINDOW);

  if (intervalCount >= REPEAT_LIMIT) {
    const muteSeconds = await applySpamMute(clientId);
    logAction({ user: clientId, action: 'messageMutedBySpam', extra: { muteSeconds } });
    return muteSeconds;
  }

  return 0;
}

// -------------------- Safe emit helpers --------------------
function safeEmitSocket(socket, event, payload) {
  if (!socket || typeof socket.emit !== 'function') return false;
  try {
    socket.emit(event, payload);
    return true;
  } catch (e) {
    return false;
  }
}

function emitUserToast(ioInstance, clientId, message) {
  // check if there is at least one socket in user room
  const room = ioInstance.sockets.adapter.rooms.get(`__user:${clientId}`);
  if (!room || room.size === 0) return;
  ioInstance.to(`__user:${clientId}`).emit('toast', {
    scope: 'user',
    message,
    time: Date.now(),
  });
}

function emitRoomToast(ioInstance, roomId, message) {
  if (!roomId) return;
  const room = ioInstance.sockets.adapter.rooms.get(roomId);
  if (!room || room.size === 0) return;
  ioInstance.to(roomId).emit('toast', {
    scope: 'room',
    message,
    time: Date.now(),
  });
}

// -------------------- Auth token helpers --------------------
function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function validateAuthToken(token) {
  if (!token) return null;
  return (await redisClient.get(`token:${token}`)) || null;
}

// -------------------- Express & Socket.IO setup --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

// --- asyncHandler ヘルパー宣言 ---
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

// セキュリティ関連ヘッダー
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${FRONTEND_URL}; frame-ancestors ${FRONTEND_URL};`
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), fullscreen=(self)');
  next();
});

app.set('trust proxy', true);

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
});

// -------------------- Monthly Redis Reset (flushdb retained) --------------------
async function monthlyRedisReset(ioInstance) {
  const now = new Date();
  const jstNow = toJST(now);
  const currentMonth = `${jstNow.getUTCFullYear()}-${pad(jstNow.getUTCMonth() + 1)}`;

  try {
    const savedMonth = await redisClient.get('system:current_month');
    if (savedMonth === currentMonth) return;

    const lockKey = 'system:reset_lock';
    const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 30);
    if (!locked) return;

    console.log('[Redis] Month changed, flushdb start');

    const keys = await scanKeys('messages:*');
    const targetRoomIds = keys.map((k) => k.slice('messages:'.length));

    await redisClient.flushdb();
    await redisClient.set('system:current_month', currentMonth);

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

// -------------------- REST セッション用ミドルウェア --------------------
function createRequireSocketSession() {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      logAction({ user: null, action: 'invalidRestToken' });
      return res.sendStatus(401);
    }

    const clientId = await validateAuthToken(token);
    if (!clientId) {
      logAction({ user: null, action: 'invalidRestToken', extra: { token: token } });
      return res.sendStatus(403);
    }

    req.clientId = clientId;
    next();
  };
}

const requireSocketSession = createRequireSocketSession();

// -------------------- API --------------------
async function getMessagesHandler(req, res) {
  const roomId = req.params.roomId;
  if (!ROOM_ID_PATTERN.test(roomId)) return res.sendStatus(400);

  const rawMessages = await redisClient.lrange(`messages:${roomId}`, 0, -1);
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
}

app.get('/api/messages/:roomId', requireSocketSession, asyncHandler(getMessagesHandler));

async function postMessageHandler(req, res) {
  const { message, seed, roomId } = req.body;
  if (!roomId || !message || !seed) return res.sendStatus(400);
  if (!ROOM_ID_PATTERN.test(roomId)) return res.sendStatus(400);
  if (message.length === 0 || message.length > 800) return res.sendStatus(400);

  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  const username = await redisClient.get(`username:${clientId}`);
  if (!username) return res.status(400).json({ error: 'Username not set' });

  const muteKey = `msg:mute:${clientId}`;
  if (await redisClient.exists(muteKey)) return res.sendStatus(429);

  if (!(await checkRateLimit(`ratelimit:msg:${clientId}`, MESSAGE_RATE_LIMIT_MS))) {
    emitUserToast(io, clientId, '送信間隔が短すぎます');
    return res.sendStatus(429);
  }

  // 連続送信スパムチェック
  const muteSeconds = await handleSpamCheck(clientId);
  if (muteSeconds > 0) {
    emitUserToast(io, clientId, `スパムを検知したため${muteSeconds}秒間ミュートされました`);
    return res.sendStatus(429);
  }

  const storedMessage = {
    username,
    message: escapeHTML(message),
    time: formatJST(new Date()),
    seed,
  };

  const roomKey = `messages:${roomId}`;
  const luaScript = `
    redis.call('RPUSH', KEYS[1], ARGV[1])
    redis.call('LTRIM', KEYS[1], -100, -1)
    return 1
  `;
  await redisClient.eval(luaScript, 1, roomKey, JSON.stringify(storedMessage));

  io.to(roomId).emit('newMessage', storedMessage);
  logAction({ user: clientId, action: 'sendMessage', extra: { roomId, message: storedMessage.message } });

  res.json({ ok: true });
}

app.post('/api/messages', requireSocketSession, asyncHandler(postMessageHandler));

// -------------------- Username API --------------------
async function setUsernameHandler(req, res) {
  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    emitUserToast(io, clientId, 'ユーザー名を入力してください');
    return res.status(400).json({ error: 'Invalid username' });
  }

  if (username.length > 24) {
    emitUserToast(io, clientId, 'ユーザー名は24文字以内にしてください');
    return res.status(400).json({ error: 'Username too long' });
  }

  const sanitized = escapeHTML(username.trim());
  const key = `username:${clientId}`;
  const current = await redisClient.get(key);

  if (current === sanitized) return res.json({ ok: true });

  if (!(await checkRateLimit(`ratelimit:username:${clientId}`, 30000))) {
    emitUserToast(io, clientId, 'ユーザー名の変更は30秒以上間隔をあけてください');
    return res.sendStatus(429);
  }

  await redisClient.set(key, sanitized, 'EX', 60 * 60 * 24);

  if (!current) {
    logAction({ user: clientId, action: 'usernameSet', extra: { newUsername: sanitized } });
    emitUserToast(io, clientId, 'ユーザー名が登録されました');
  } else {
    logAction({ user: clientId, action: 'usernameChanged', extra: { oldUsername: current, newUsername: sanitized } });
    emitUserToast(io, clientId, 'ユーザー名を変更しました');
  }

  res.json({ ok: true });
}

app.post('/api/username', requireSocketSession, asyncHandler(setUsernameHandler));

// -------------------- Auth API --------------------
async function authHandler(req, res) {
  const ip = req.ip;
  const rateKey = `ratelimit:auth:ip:${ip}`;
  const allowed = await checkIpRateLimit(rateKey, 5, 60 * 60);
  if (!allowed) return res.sendStatus(429);

  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.length > 24) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const clientId = crypto.randomUUID();
  const token = createAuthToken();

  await redisClient.set(`token:${token}`, clientId, 'EX', 60 * 60 * 24);
  await redisClient.set(`username:${clientId}`, escapeHTML(username), 'EX', 60 * 60 * 24);

  logAction({ user: clientId, action: 'issueToken' });
  res.json({ token, clientId });
}

app.post('/api/auth', asyncHandler(authHandler));

// -------------------- Admin / Clear API --------------------
async function clearMessagesHandler(req, res) {
  const { password, roomId } = req.body;
  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  if (password !== ADMIN_PASS) {
    logAction({ user: clientId, action: 'InvalidAdminPassword', extra: { roomId } });
    emitUserToast(io, clientId, '管理者パスワードが正しくありません');
    return res.sendStatus(403);
  }

  if (!(await checkRateLimit(`ratelimit:clear:${clientId}`, 30000))) {
    emitUserToast(io, clientId, '削除操作は30秒以上間隔をあけてください');
    return res.sendStatus(429);
  }

  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) return res.sendStatus(400);

  await redisClient.del(`messages:${roomId}`);
  io.to(roomId).emit('clearMessages');
  emitRoomToast(io, roomId, '全メッセージ削除されました');
  logAction({ user: clientId, action: 'clearMessages', extra: { roomId } });

  res.json({ ok: true });
}

app.post('/api/clear', requireSocketSession, asyncHandler(clearMessagesHandler));

// -------------------- Socket.IO middleware & handlers --------------------
io.use(async (socket, next) => {
  try {
    // ensure socket.data exists
    socket.data = socket.data || {};

    const token = socket.handshake.auth?.token;
    if (!token) {
      logAction({ user: null, action: 'invalidSocketToken' });
      return next(new Error('Authentication required'));
    }

    const clientId = await validateAuthToken(token);
    if (!clientId) {
      logAction({ user: null, action: 'invalidSocketToken', extra: { token: token } });
      return next(new Error('Invalid token'));
    }

    socket.data.clientId = clientId;
    socket.data.authenticated = true;

    socket.join(`__user:${clientId}`);

    logAction({ user: clientId, action: 'socketConnected', extra: { socketId: socket.id } });
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const wrap = (fn) => (...args) => {
    if (!socket) {
      console.warn('Invalid socket in handler (socket missing)', args);
      return;
    }
    if (typeof socket.emit !== 'function') {
      console.warn('Invalid socket in handler (emit missing)', args);
      return;
    }
    Promise.resolve(fn(socket, ...args)).catch((err) => {
      console.error('[Socket.IO] Error in handler:', err);
      try {
        socket.emit('error', { message: err.message || 'Internal Server Error' });
      } catch (e) {
        // ignore
      }
    });
  };

  // joinRoom event
  socket.on('joinRoom', wrap(async (socket, data = {}) => {
    const { roomId } = data;
    if (!socket.data?.authenticated || !socket.data?.clientId) {
      safeEmitSocket(socket, 'authRequired', {});
      return;
    }
    if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
      logAction({ user: socket.data.clientId, action: 'joinRoomFailed', extra: { roomId } });
      return;
    }

    if (socket.data.roomId) socket.leave(socket.data.roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;

    const username = await redisClient.get(`username:${socket.data.clientId}`);
    logAction({ user: socket.data.clientId, action: 'joinRoom', extra: { roomId } });

    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', roomSize);
    safeEmitSocket(socket, 'joinedRoom', { roomId });
  }));

  socket.on('disconnect', async (reason) => {
    try {
      const roomId = socket.data?.roomId;
      const clientId = socket.data?.clientId;

      if (roomId) {
        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit('roomUserCount', roomSize);
      }

      if (clientId) {
        logAction({ user: clientId, action: 'disconnect', extra: { roomId, reason } });
      }
    } catch (err) {
      console.error('Error in disconnect handler', err);
    }
  });
});

// -------------------- SPA fallback --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

// -------------------- 共通エラーハンドラ --------------------
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] Error:`, err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
}

app.use(errorHandler);

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
