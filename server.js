// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');

try { require('dotenv').config(); } catch { console.warn('dotenv not found, using default values'); }

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const TOKEN_KEY = process.env.TOKEN_KEY || 'supersecretkey1234';
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

// -------------------- ヘルパー関数 --------------------
function escapeHTML(str = '') {
    return str.replace(/&/g,'&amp;')
              .replace(/</g,'&lt;')
              .replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;')
              .replace(/'/g,'&#039;');
}

function formatJSTTime(date) {
    const jst = new Date(date.getTime() + 9*60*60*1000);
    const yyyy = jst.getUTCFullYear();
    const mm = String(jst.getUTCMonth()+1).padStart(2,'0');
    const dd = String(jst.getUTCDate()).padStart(2,'0');
    const hh = String(jst.getUTCHours()).padStart(2,'0');
    const min = String(jst.getUTCMinutes()).padStart(2,'0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function formatJSTTimeLog(date) {
    const jst = new Date(date.getTime() + 9*60*60*1000);
    const yyyy = jst.getUTCFullYear();
    const mm = String(jst.getUTCMonth()+1).padStart(2,'0');
    const dd = String(jst.getUTCDate()).padStart(2,'0');
    const hh = String(jst.getUTCHours()).padStart(2,'0');
    const min = String(jst.getUTCMinutes()).padStart(2,'0');
    const ss = String(jst.getUTCSeconds()).padStart(2,'0');
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

function notifyClient(io, clientId, message, type = 'info') {
    if (!clientId) return;
    io.to(clientId).emit('notify', { message, type });
}

function createSystemMessage(htmlMessage) {
    return { username:'システム', message:htmlMessage, time:new Date().toISOString(), clientId:'system', seed:'system' };
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

    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(`${clientId}.${timestamp}`);
    const expectedSignature = hmac.digest('hex');
    if (expectedSignature !== signature) return null;

    const storedToken = await redisClient.get(`token:${clientId}`);
    if (storedToken !== token) return null;

    return clientId;
}

// -------------------- Express & Socket.IO --------------------
const app = express();
app.use(express.json({ limit:'100kb' }));

app.set('trust proxy', () => true);

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors:{ origin:'*' } });

// -------------------- Socket.IO 認証 --------------------
io.use((socket, next) => {
    const headers = socket.handshake.headers;
    if (headers['token-key'] !== TOKEN_KEY) return next(new Error('Forbidden'));
    next();
});

// -------------------- Express Middleware --------------------
app.use((req, res, next) => {
    if (req.headers['token-key'] !== TOKEN_KEY) return res.status(403).send('Forbidden');
    next();
});

// -------------------- 月次Redisリセット --------------------
async function monthlyRedisReset(io) {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9*60*60*1000);
    const currentMonth = `${jstNow.getFullYear()}-${String(jstNow.getMonth()+1).padStart(2,'0')}`;

    try {
        const savedMonth = await redisClient.get('system:current_month');
        if (savedMonth === currentMonth) return;

        const lockKey = 'system:reset_lock';
        const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 30);
        if (!locked) return;

        console.log('[Redis] Month changed, flushdb start');

        const keys = await redisClient.keys('messages:*');
        const targetRoomIds = keys.map(k => k.replace('messages:',''));

        await redisClient.flushdb();
        await redisClient.set('system:current_month', currentMonth);

        const systemMessage = createSystemMessage('<strong>メンテナンスのためデータベースがリセットされました</strong>');

        for (const roomId of targetRoomIds) {
            io.to(roomId).emit('newMessage', {
                username: systemMessage.username,
                message: systemMessage.message,
                time: systemMessage.time,
                seed: systemMessage.seed
            });
        }

        console.log('[Redis] Flushdb completed');
    } catch (err) {
        console.error('[Redis] Monthly reset failed', err);
    }
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', async (req,res) => {
    try {
        const roomId = req.params.roomId;
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.status(400).json({ error:'invalid roomId' });

        const rawMessages = await redisClient.lrange(`messages:${roomId}`, 0, -1);
        const messages = rawMessages.map(m => {
            const parsed = JSON.parse(m);
            return { username:parsed.username, message:parsed.message, time:parsed.time, seed:parsed.seed };
        });

        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error:'Redis error' });
    }
});

app.post('/api/messages', async (req,res) => {
    const { username, message, token, seed, roomId } = req.body;

    if (!roomId || !username || !message || !token || !seed) return res.status(400).json({ error:'Invalid data' });
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.status(400).json({ error:'invalid roomId' });
    if (username.length === 0 || username.length > 24) return res.status(400).json({ error:'Username length invalid' });
    if (message.length === 0 || message.length > 800) return res.status(400).json({ error:'Message length invalid' });

    const clientId = await validateAuthToken(token);
    if (!clientId) {
        const possibleClientId = token?.split('.')?.[0];
        notifyClient(io, possibleClientId, '認証が無効です', 'error');
        return res.status(403).json({ error:'Invalid token' });
    }

    const MESSAGE_RATE_LIMIT_MS = 1000;
    const REPEAT_LIMIT = 3;
    const MUTE_DURATION_SEC = 30;

    const muteKey = `msg:mute:${clientId}`;
    if (await redisClient.exists(muteKey)) return res.status(429).json({ error:'Muted due to repeated messages' });

    const rateKey = `ratelimit:msg:${clientId}`;
    const lastSent = await redisClient.get(rateKey);
    const now = Date.now();
    if (lastSent && now - Number(lastSent) < MESSAGE_RATE_LIMIT_MS) {
      notifyClient(io, clientId, '送信間隔が短すぎます', 'warning');
      return res.status(429).json({ error:'Rate limited' });
    }
    await redisClient.set(rateKey, now, 'PX', MESSAGE_RATE_LIMIT_MS);

    // --- スパム・ミュート判定 ---
    const lastMessageKey = `msg:last_message:${clientId}`;
    const lastTimeKey = `msg:last_time:${clientId}`;
    const repeatIntervalKey = `msg:repeat_interval_count:${clientId}`;

    const lastMessage = await redisClient.get(lastMessageKey);
    const lastTime = await redisClient.get(lastTimeKey);
    let intervalCount = Number(await redisClient.get(repeatIntervalKey)) || 0;

    if (lastMessage === message && lastTime) {
        const interval = now - Number(lastTime);
        const lastInterval = Number(await redisClient.get(`msg:last_interval:${clientId}`)) || 0;

        if (Math.abs(interval - lastInterval) < 250) {
            intervalCount++;
            await redisClient.set(repeatIntervalKey, intervalCount, 'EX', MUTE_DURATION_SEC);
            if (intervalCount >= 3) {
                await redisClient.set(`msg:mute:${clientId}`, '1', 'EX', MUTE_DURATION_SEC);
                await redisClient.del(repeatIntervalKey);
                notifyClient(
                    io,
                    clientId,
                    `スパムを検知したため${MUTE_DURATION_SEC}秒間ミュートされました`,
                    'warning'
                );

                return res.status(429).json({ error:'Muted' });
            }
        } else {
            intervalCount = 1;
            await redisClient.set(repeatIntervalKey, intervalCount, 'EX', MUTE_DURATION_SEC);
        }

        await redisClient.set(`msg:last_interval:${clientId}`, interval, 'EX', MUTE_DURATION_SEC);
    } else {
        await redisClient.set(repeatIntervalKey, 1, 'EX', MUTE_DURATION_SEC);
    }

    await redisClient.set(lastMessageKey, message, 'EX', MUTE_DURATION_SEC);
    await redisClient.set(lastTimeKey, now, 'EX', MUTE_DURATION_SEC);

    const storedMessage = { username: escapeHTML(username), message: escapeHTML(message), time: formatJSTTime(new Date()), clientId, seed };

    try {
        const roomKey = `messages:${roomId}`;
        const luaScript = `
            redis.call('RPUSH', KEYS[1], ARGV[1])
            redis.call('LTRIM', KEYS[1], -100, -1)
            return 1
        `;
        await redisClient.eval(luaScript, 1, roomKey, JSON.stringify(storedMessage));

        io.to(roomId).emit('newMessage', storedMessage);
        logUserAction(clientId, 'sendMessage', { roomId, username: storedMessage.username, message: storedMessage.message });

        res.json({ ok:true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error:'Redis error' });
    }
});

// -------------------- 管理API --------------------
app.post('/api/clear', async (req,res) => {
    const { password, roomId, token } = req.body;

    const clientId = await validateAuthToken(token);
    if (!clientId) {
        const possibleClientId = token?.split('.')?.[0];
        notifyClient(io, possibleClientId, '認証が無効です', 'error');
        return res.status(403).json({ error:'Invalid token' });
    }

    if (password !== ADMIN_PASS) {
        notifyClient(io, clientId, '管理者パスワードが正しくありません', 'error');
        return res.status(403).json({ error:'Unauthorized' });
}

    const now = Date.now();
    const rateKey = `ratelimit:clear:${clientId}`;
    const last = await redisClient.get(rateKey);
    if (last && now - Number(last) < 30000) {
        notifyClient(io, clientId, '削除操作は30秒以上間隔をあけてください', 'warning');
        return res.status(429).json({ error:'Rate limited' });
    }
    await redisClient.set(rateKey, now, 'PX', 60000);

    if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.status(400).json({ error:'invalid roomId' });

    const username = (await redisClient.get(`username:${clientId}`)) || 'unknown';
    await redisClient.del(`messages:${roomId}`);
    io.to(roomId).emit('clearMessages');
    io.to(roomId).emit('notify', {
        message: '全メッセージ削除されました',
        type: 'warning'
    });
    logUserAction(clientId, 'clearMessages', { roomId, username });
    res.json({ message:'全メッセージ削除しました' });
});

// -------------------- Socket.IO --------------------
io.on('connection', socket => {
    socket.on('authenticate', async ({ token, username }) => {
        const now = Date.now();
        const ip = socket.handshake.headers['cf-connecting-ip'];

        let clientId = token ? await validateAuthToken(token) : null;
        let newToken = null;
        socket.data = socket.data || {};

        if (!clientId) {
            const reissueKey = `ratelimit:reissue:${ip}`;
            const last = await redisClient.get(reissueKey);
            if (last && now - Number(last) < 30000) { socket.emit('authRequired'); return; }

            clientId = crypto.randomUUID();
            newToken = createAuthToken(clientId);
            await redisClient.set(`token:${clientId}`, newToken, 'EX', 86400);
            await redisClient.set(reissueKey, now, 'PX', 30000);
            socket.emit('assignToken', newToken);
        }

        socket.data.clientId = clientId;
        socket.data.username = username ? escapeHTML(username) : '';
        await redisClient.set(`username:${clientId}`, socket.data.username, 'EX', 86400);
        socket.emit('authenticated');
        socket.join(clientId);
    });

    socket.on('joinRoom', ({ roomId }) => {
        if (!socket.data.clientId) return socket.disconnect(true);
        if (!roomId || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return;

        if (socket.data.roomId) socket.leave(socket.data.roomId);
        socket.join(roomId);
        socket.data.roomId = roomId;

        logUserAction(socket.data.clientId,'joinRoom',{ roomId, username: socket.data.username });

        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit('roomUserCount', roomSize);
        socket.emit('joinedRoom', { roomId });
    });

    socket.on('disconnecting', () => {
        const roomId = socket.data.roomId;
        if (roomId) {
            const roomSize = (io.sockets.adapter.rooms.get(roomId)?.size || 1) - 1;
            io.to(roomId).emit('roomUserCount', roomSize);
        }
        if (socket.data.clientId) logUserAction(socket.data.clientId,'disconnecting',{ roomId, username: socket.data.username });
    });
});

// -------------------- SPA対応 --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req,res) => {
    res.sendFile(`${__dirname}/public/index.html`);
});

// -------------------- サーバー起動 --------------------
(async () => {
    try {
        cron.schedule('0 0 0 1 * *', async () => {
            console.log('[Cron] Running monthly Redis reset...');
            await monthlyRedisReset(io);
        }, { timezone:'Asia/Tokyo' });
    } catch (err) {
        console.error('Monthly reset check failed', err);
    } finally {
        httpServer.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
    }
})();
