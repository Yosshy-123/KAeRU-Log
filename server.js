'use strict';

// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');
const cors = require('cors');

const KEYS = require('./lib/redisKeys');
const { pushAndTrimList } = require('./lib/redisHelpers');
const createSpamService = require('./services/spamService');
const { checkRateLimitMs } = require('./utils/redisUtils');
const tokenBucket = require('./utils/tokenBucket');
const rawLogAction = require('./utils/logger');
const createWrapperFactory = require('./utils/socketWrapper');

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

// -------------------- ログ／Emit のラッパー --------------------
async function safeLogAction(payload) {
  try {
    await rawLogAction(redisClient, payload);
  } catch (err) {
    console.error('[safeLogAction] log failed', err);
  }
}

function safeEmitSocket(socket, event, payload) {
  if (!socket || typeof socket.emit !== 'function') return false;
  try {
    socket.emit(event, payload);
    return true;
  } catch (e) {
    console.error('safeEmitSocket failed', e);
    return false;
  }
}

function emitUserToast(ioInstance, clientId, message) {
  const roomName = KEYS.userRoom(clientId);
  const room = ioInstance.sockets.adapter.rooms.get(roomName);
  if (!room || room.size === 0) return;
  ioInstance.to(roomName).emit('toast', { scope: 'user', message, time: Date.now() });
}

function emitRoomToast(ioInstance, roomId, message) {
  if (!roomId) return;
  const room = ioInstance.sockets.adapter.rooms.get(roomId);
  if (!room || room.size === 0) return;
  ioInstance.to(roomId).emit('toast', { scope: 'room', message, time: Date.now() });
}

// -------------------- Auth token helpers --------------------
function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function validateAuthToken(token) {
  if (!token) return null;
  return (await redisClient.get(KEYS.token(token))) || null;
}

// -------------------- Express / Socket.IO 初期化 --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
});

// CORS
app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

// セキュリティヘッダ
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

// async handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// -------------------- サービス初期化 --------------------
const spamService = createSpamService(redisClient, safeLogAction, KEYS);

const wrapperFactory = createWrapperFactory({ redisClient, io, log: safeLogAction, safeEmitSocket });

// -------------------- 月次リセット（flushdb） --------------------
async function monthlyRedisReset(ioInstance) {
  const now = new Date();
  const jstNow = toJST(now);
  const currentMonth = `${jstNow.getUTCFullYear()}-${pad(jstNow.getUTCMonth() + 1)}`;

  try {
    const savedMonth = await redisClient.get(KEYS.systemCurrentMonth());
    if (savedMonth === currentMonth) return;

    const lockKey = KEYS.resetLock();
    const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 30);
    if (!locked) return;

    console.log('[Redis] Month changed, running FLUSHDB');

    await redisClient.flushdb();
    await redisClient.set(KEYS.systemCurrentMonth(), currentMonth);

    const systemMessage = createSystemMessage('<strong>メンテナンスのためデータベースがリセットされました</strong>');
    ioInstance.emit('newMessage', {
      username: systemMessage.username,
      message: systemMessage.message,
      time: systemMessage.time,
      seed: systemMessage.seed,
    });

    console.log('[Redis] FLUSHDB completed');
  } catch (err) {
    console.error('[Redis] Monthly reset failed', err);
  }
}

// -------------------- REST セッション用ミドルウェア --------------------
function createRequireSocketSession() {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (!token) {
      await safeLogAction({ user: null, action: 'invalidRestToken' });
      return res.sendStatus(401);
    }
    const clientId = await validateAuthToken(token);
    if (!clientId) {
      await safeLogAction({ user: null, action: 'invalidRestToken', extra: { token } });
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
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

  const rawMessages = await redisClient.lrange(KEYS.messages(roomId), 0, -1);
  const messages = rawMessages.map((m) => {
    try { return JSON.parse(m); } catch { return null; }
  }).filter(Boolean);

  res.json(messages.map(({ username, message, time, seed }) => ({ username, message, time, seed })));
}
app.get('/^[a-zA-Z0-9_-]{1,32}$//:roomId', requireSocketSession, asyncHandler(getMessagesHandler));

async function postMessageHandler(req, res) {
  const { message, seed, roomId } = req.body;
  if (!roomId || !message || !seed) return res.sendStatus(400);
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);
  if (typeof message !== 'string' || message.length === 0 || message.length > 800) return res.sendStatus(400);

  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  const username = await redisClient.get(KEYS.username(clientId));
  if (!username) return res.status(400).json({ error: 'Username not set' });

  const spamResult = await spamService.check(clientId);
  if (spamResult.muted) {
    emitUserToast(io, clientId, spamResult.muteSec ? `スパムを検知したため${spamResult.muteSec}秒間ミュートされました` : '送信が制限されています');
    await safeLogAction({ user: clientId, action: 'sendMessageBlocked', extra: { reason: spamResult.reason || 'spam' } });
    return res.sendStatus(429);
  }

  const storedMessage = {
    username,
    message: escapeHTML(message),
    time: formatJST(new Date()),
    seed,
  };

  await pushAndTrimList(redisClient, KEYS.messages(roomId), JSON.stringify(storedMessage), 100);

  io.to(roomId).emit('newMessage', storedMessage);
  await safeLogAction({ user: clientId, action: 'sendMessage', extra: { roomId, message: storedMessage.message } });

  res.json({ ok: true });
}
app.post('/api/messages', requireSocketSession, asyncHandler(postMessageHandler));

// POST /api/username
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
  const key = KEYS.username(clientId);
  const current = await redisClient.get(key);
  if (current === sanitized) return res.json({ ok: true });

  const rateKey = KEYS.rateUsername(clientId);
  if (!(await checkRateLimitMs(redisClient, rateKey, 30000))) {
    emitUserToast(io, clientId, 'ユーザー名の変更は30秒以上間隔をあけてください');
    return res.sendStatus(429);
  }

  await redisClient.set(key, sanitized, 'EX', 60 * 60 * 24);
  if (!current) {
    await safeLogAction({ user: clientId, action: 'usernameSet', extra: { newUsername: sanitized } });
    emitUserToast(io, clientId, 'ユーザー名が登録されました');
  } else {
    await safeLogAction({ user: clientId, action: 'usernameChanged', extra: { oldUsername: current, newUsername: sanitized } });
    emitUserToast(io, clientId, 'ユーザー名を変更しました');
  }

  res.json({ ok: true });
}
app.post('/api/username', requireSocketSession, asyncHandler(setUsernameHandler));

// POST /api/auth
async function authHandler(req, res) {
  const ip = req.ip;

  // token bucket を利用（実装は ./utils/tokenBucket）
  const allowed = await tokenBucket(redisClient, KEYS.tokenBucketAuthIp(ip), {
    capacity: 5,
    refillPerSec: 5 / 3600, // 1時間で5回分
  });

  if (!allowed) {
    await safeLogAction({ user: null, action: 'authRateLimited', extra: { ip } });
    return res.sendStatus(429);
  }

  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.length > 24) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const clientId = crypto.randomUUID();
  const token = createAuthToken();

  await redisClient.set(KEYS.token(token), clientId, 'EX', 60 * 60 * 24);
  await redisClient.set(KEYS.username(clientId), escapeHTML(username), 'EX', 60 * 60 * 24);

  await safeLogAction({ user: clientId, action: 'issueToken' });
  res.json({ token, clientId });
}
app.post('/api/auth', asyncHandler(authHandler));

// POST /api/clear (admin)
async function clearMessagesHandler(req, res) {
  const { password, roomId } = req.body;
  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  if (password !== ADMIN_PASS) {
    await safeLogAction({ user: clientId, action: 'InvalidAdminPassword', extra: { roomId } });
    emitUserToast(io, clientId, '管理者パスワードが正しくありません');
    return res.sendStatus(403);
  }

  if (!(await checkRateLimitMs(redisClient, KEYS.rateClear(clientId), 30000))) {
    emitUserToast(io, clientId, '削除操作は30秒以上間隔をあけてください');
    return res.sendStatus(429);
  }

  if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

  await redisClient.del(KEYS.messages(roomId));
  io.to(roomId).emit('clearMessages');
  emitRoomToast(io, roomId, '全メッセージ削除されました');
  await safeLogAction({ user: clientId, action: 'clearMessages', extra: { roomId } });

  res.json({ ok: true });
}
app.post('/api/clear', requireSocketSession, asyncHandler(clearMessagesHandler));

// -------------------- Socket.IO middleware / handlers --------------------

// Socket auth middleware: handshake.auth.token を検証して __user:... ルームへ入れる
io.use(async (socket, next) => {
  try {
    socket.data = socket.data || {};
    const token = socket.handshake.auth?.token;
    if (!token) {
      await safeLogAction({ user: null, action: 'invalidSocketToken' });
      return next(new Error('Authentication required'));
    }

    const clientId = await validateAuthToken(token);
    if (!clientId) {
      await safeLogAction({ user: null, action: 'invalidSocketToken', extra: { token } });
      return next(new Error('Invalid token'));
    }

    socket.data.clientId = clientId;
    socket.data.authenticated = true;

    const userRoom = KEYS.userRoom(clientId);
    socket.join(userRoom);

    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// connection handlers
io.on('connection', (socket) => {
  const wrap = wrapperFactory(socket);

  socket.on('joinRoom', wrap(async (socket, data = {}) => {
    const { roomId } = data;

    if (!socket.data?.authenticated || !socket.data?.clientId) {
      if (!safeEmitSocket(socket, 'authRequired', {})) {
        await safeLogAction({ user: null, action: 'emitFailed', extra: { event: 'authRequired' } });
      }
      return;
    }

    if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
      await safeLogAction({ user: socket.data.clientId, action: 'joinRoomFailed', extra: { roomId } });
      return;
    }

    if (socket.data.roomId) socket.leave(socket.data.roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;

    await safeLogAction({ user: socket.data.clientId, action: 'joinRoom', extra: { roomId } });

    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', roomSize);

    if (!safeEmitSocket(socket, 'joinedRoom', { roomId })) {
      await safeLogAction({ user: socket.data.clientId, action: 'emitFailed', extra: { event: 'joinedRoom' } });
    }
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
        await safeLogAction({ user: clientId, action: 'disconnect', extra: { roomId, reason } });
      }
    } catch (err) {
      console.error('Error in disconnect handler', err);
    }
  });
});

// -------------------- SPA fallback / static --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

// -------------------- 共通エラーハンドラ --------------------
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] Error:`, err);
  if (res.headersSent) return next(err);
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
