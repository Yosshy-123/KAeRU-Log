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
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminkey1234';
const FRONTEND_URL = process.env.FRONTEND_URL;

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

// -------------------- アプリ設定 --------------------
const BASE_MUTE_SEC = 30;
const MAX_MUTE_SEC = 60 * 10; // 最大ミュート時間（10分）
const MESSAGE_RATE_LIMIT_MS = 1000;
const REPEAT_LIMIT = 3;

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

async function scanKeys(pattern) {
  let cursor = '0';
  const keys = [];

  do {
    const [nextCursor, batch] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  return keys;
}

// -------------------- IPレート制限 --------------------
async function checkIpRateLimit(key, limit, windowSec) {
  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, windowSec);
  }

  return count <= limit;
}

// -------------------- Toast通知 --------------------
function emitUserToast(io, clientId, message, type = 'info') {
  io.to(`__user:${clientId}`).emit('toast', {
    scope: 'user',
    message,
    type,
    time: Date.now(),
  });
}

function emitRoomToast(io, roomId, message, type = 'info') {
  if (!roomId) return;
  io.to(roomId).emit('toast', {
    scope: 'room',
    message,
    type,
    time: Date.now(),
  });
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

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function validateAuthToken(token) {
  if (!token) return null;
  const clientId = await redisClient.get(`token:${token}`);
  return clientId || null;
}

// -------------------- Session管理 --------------------
function createRequireSocketSession() {
  return async function requireSocketSession(req, res, next) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (typeof token !== 'string') {
      logUserAction('unknown', 'invalidRestToken', { token });
      return res.sendStatus(401);
    }

    const clientId = await validateAuthToken(token);
    if (!clientId) {
      logUserAction('unknown', 'invalidRestToken', { token });
      return res.sendStatus(403);
    }

    req.clientId = clientId;
    next();
  };
}

// -------------------- Express & Socket.IO --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

// -------------------- セキュリティヘッダー --------------------
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${FRONTEND_URL}; frame-ancestors ${FRONTEND_URL};`
  );

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), fullscreen=(self)'
  );
  next();
});

app.set('trust proxy', true); // Render 用

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
});

const requireSocketSession = createRequireSocketSession();

// -------------------- 月次Redisリセット --------------------
async function monthlyRedisReset(ioInstance) {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentMonth = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}`;

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

// -------------------- API --------------------
app.get('/api/messages/:roomId', requireSocketSession, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/messages', requireSocketSession, async (req, res) => {
  const { username, message, seed, roomId } = req.body;

  if (!roomId || !username || !message || !seed) return res.sendStatus(400);
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);
  if (username.length === 0 || username.length > 24) return res.sendStatus(400);
  if (message.length === 0 || message.length > 800) return res.sendStatus(400);

  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  const muteKey = `msg:mute:${clientId}`;
  if (await redisClient.exists(muteKey)) return res.sendStatus(429);

  // --- 送信間隔レートリミット ---
  const rateKey = `ratelimit:msg:${clientId}`;
  const lastSent = await redisClient.get(rateKey);
  const now = Date.now();
  if (lastSent && now - Number(lastSent) < MESSAGE_RATE_LIMIT_MS) {
    emitUserToast(io, clientId, '送信間隔が短すぎます', 'warning');
    return res.sendStatus(429);
  }
  await redisClient.set(rateKey, now, 'PX', MESSAGE_RATE_LIMIT_MS);

  // --- スパム判定・ミュート処理 ---
  const lastTimeKey = `msg:last_time:${clientId}`;
  const repeatCountKey = `msg:repeat_interval_count:${clientId}`;
  const lastIntervalKey = `msg:last_interval:${clientId}`;

  const lastTime = Number(await redisClient.get(lastTimeKey)) || 0;
  const lastInterval = Number(await redisClient.get(lastIntervalKey)) || 0;
  let intervalCount = Number(await redisClient.get(repeatCountKey)) || 0;

  const interval = now - lastTime;

  if (lastTime && Math.abs(interval - lastInterval) < 300) {
    // 短時間で同じ間隔のメッセージ -> スパム判定
    intervalCount++;
  } else {
    // 間隔が違う場合はリセット
    intervalCount = 1;
  }

  // 値を保存
  await redisClient.set(repeatCountKey, intervalCount, 'EX', BASE_MUTE_SEC);
  await redisClient.set(lastIntervalKey, interval, 'EX', BASE_MUTE_SEC);
  await redisClient.set(lastTimeKey, now, 'EX', BASE_MUTE_SEC);

  if (intervalCount >= REPEAT_LIMIT) {
    // --- ミュート処理 ---
    const muteLevelKey = `msg:mute_level:${clientId}`;
    const lastMuteKey = `msg:last_mute:${clientId}`;

    const ttl = await redisClient.ttl(muteKey) || 0;
    let muteLevel = Number(await redisClient.get(muteLevelKey)) || 0;
    const lastMuteTime = Number(await redisClient.get(lastMuteKey)) || 0;

    if (ttl === -2 || now - lastMuteTime > 10 * 60 * 1000) {
      muteLevel = 0; // 10分以上経過でレベルリセット
    }

    muteLevel++;
    const muteSeconds = Math.min(BASE_MUTE_SEC * 2 ** muteLevel, MAX_MUTE_SEC);

    if (muteSeconds > ttl) {
      await redisClient.set(muteKey, '1', 'EX', muteSeconds);
      await redisClient.set(muteLevelKey, muteLevel);
      await redisClient.set(lastMuteKey, now);
    }

    logUserAction(clientId, 'messageMutedBySpam', { muteSeconds, muteLevel });
    emitUserToast(io, clientId, `スパムを検知したため${muteSeconds}秒間ミュートされました`, 'warning');

    // スパムカウントリセット
    await redisClient.del(repeatCountKey);
    return res.sendStatus(429);
  }

  // --- メッセージ保存 ---
  const storedMessage = {
    username: escapeHTML(username),
    message: escapeHTML(message),
    time: formatJSTTime(new Date()),
    seed,
  };

  try {
    const roomKey = `messages:${roomId}`;
    const luaScript = `
      redis.call('RPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], -100, -1)
      return 1
    `;
    await redisClient.eval(luaScript, 1, roomKey, JSON.stringify(storedMessage));

    io.to(roomId).emit('newMessage', storedMessage);
    logUserAction(clientId, 'sendMessage', {
      roomId,
      username: storedMessage.username,
      message: storedMessage.message,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- トークン発行 API --------------------
app.post('/api/auth', async (req, res) => {
  try {
    // ---- IP レート制限 ----
    const ip = req.ip;

    const rateKey = `ratelimit:auth:ip:${ip}`;
    const allowed = await checkIpRateLimit(rateKey, 3, 60);

    if (!allowed) {
      return res.sendStatus(429);
    }

    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.length > 24) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const clientId = crypto.randomUUID();
    const token = createAuthToken();

    await redisClient.set(`token:${token}`, clientId, 'EX', 60 * 60 * 24);
    await redisClient.set(`username:${clientId}`, escapeHTML(username), 'EX', 60 * 60 * 24);

    res.json({ token, clientId });
    logUserAction(clientId, 'issueToken', { username });
    console.log(`[Auth] Token issued for clientId ${clientId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- 管理API --------------------
app.post('/api/clear', requireSocketSession, async (req, res) => {
  const { password, roomId } = req.body;

  const clientId = req.clientId;
  if (!clientId) return res.sendStatus(403);

  const username = await redisClient.get(`username:${clientId}`);
  if (password !== ADMIN_PASS) {
    logUserAction(clientId, 'InvalidAdminPassword', { roomId, username });

    emitUserToast(io, clientId, '管理者パスワードが正しくありません', 'error');
    return res.sendStatus(403);
  }

  const now = Date.now();
  const rateKey = `ratelimit:clear:${clientId}`;
  const last = await redisClient.get(rateKey);

  if (last && now - Number(last) < 30000) {
    logUserAction(clientId, 'clearMessagesRateLimited', { roomId, username });
    emitUserToast(io, clientId, '削除操作は30秒以上間隔をあけてください', 'warning');
    return res.sendStatus(429);
  }

  await redisClient.set(rateKey, now, 'PX', 60000);

  if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.sendStatus(400);

  await redisClient.del(`messages:${roomId}`);
  io.to(roomId).emit('clearMessages');
  emitRoomToast(io, roomId, '全メッセージ削除されました', 'info');
  logUserAction(clientId, 'clearMessages', { roomId, username });
});

// -------------------- Socket.IO --------------------
io.use(async (socket, next) => {
  try {
    // ---- Token チェック ----
    const token = socket.handshake.auth?.token;
    if (!token) {
      logUserAction('unknown', 'invalidSocketToken');
      return next(new Error('Authentication required'));
    }

    const clientId = await validateAuthToken(token);
    if (!clientId) {
      logUserAction('unknown', 'invalidSocketToken', { token });
      return next(new Error('Invalid token'));
    }

    socket.data.clientId = clientId;
    socket.data.authenticated = true;

    socket.join(`__user:${clientId}`);

    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  socket.on('joinRoom', async ({ roomId }) => {
    if (!socket.data.authenticated || !socket.data.clientId) {
      socket.emit('authRequired');
      return;
    }
    if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
      logUserAction(socket.data.clientId, 'joinRoomFailed', { roomId });
      return;
    }

    if (socket.data.roomId) socket.leave(socket.data.roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;

    const username = await redisClient.get(`username:${socket.data.clientId}`);
    logUserAction(socket.data.clientId, 'joinRoom', { roomId, username });

    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('roomUserCount', roomSize);
    socket.emit('joinedRoom', { roomId });
  });

  socket.on('disconnect', async () => {
    const roomId = socket.data.roomId;
    socket.data.authenticated = false;
    if (roomId) {
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit('roomUserCount', roomSize);
    }

    if (socket.data.clientId) {
      const username = await redisClient.get(`username:${socket.data.clientId}`);
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
