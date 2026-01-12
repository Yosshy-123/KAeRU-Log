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
const AUTH_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000;

// -------------------- In-Memory Redis --------------------
class MemoryRedis {
    constructor() {
        this.store = new Map();
        this.timers = new Map();
        console.log('MemoryRedis initialized');
    }

    _setExpire(key, ms) {
        if (this.timers.has(key)) clearTimeout(this.timers.get(key));
        this.timers.set(key, setTimeout(() => {
            this.store.delete(key);
            this.timers.delete(key);
        }, ms));
    }

    async get(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    async set(key, value, mode, time) {
        if (mode === 'NX' && this.store.has(key)) return null;
        this.store.set(key, value);
        if (mode === 'EX') this._setExpire(key, time * 1000);
        if (mode === 'PX') this._setExpire(key, time);
        return 'OK';
    }

    async del(key) {
        this.store.delete(key);
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
    }

    async exists(key) {
        return this.store.has(key) ? 1 : 0;
    }

    async lrange(key, start, stop) {
        const list = this.store.get(key) || [];
        return list.slice(start < 0 ? list.length + start : start, stop + 1);
    }

    async rpush(key, value) {
        const list = this.store.get(key) || [];
        list.push(value);
        this.store.set(key, list);
    }

    async ltrim(key, start, stop) {
        const list = this.store.get(key) || [];
        this.store.set(key, list.slice(start < 0 ? list.length + start : start, stop + 1));
    }

    async keys(pattern) {
        const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
        return [...this.store.keys()].filter(k => regex.test(k));
    }

    async flushdb() {
        this.store.clear();
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
    }

    async eval(lua, numKeys, key, value) {
        await this.rpush(key, value);
        await this.ltrim(key, -100, -1);
        return 1;
    }

    on(event, cb) {
        if (event === 'connect') cb();
    }
}

const redisClient = new MemoryRedis();

// -------------------- ヘルパー関数 --------------------
function escapeHTML(str = '') {
    return str
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
        time: new Date().toISOString(),
        clientId: 'system',
        seed: 'system'
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
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [clientId, timestampStr, signature] = parts;
    const timestamp = Number(timestampStr);
    if (!timestamp) return null;
    if (Date.now() - timestamp > AUTH_TOKEN_MAX_AGE) return null;

    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(`${clientId}.${timestamp}`);
    if (hmac.digest('hex') !== signature) return null;

    const storedToken = await redisClient.get(`token:${clientId}`);
    if (storedToken !== token) return null;
    return clientId;
}

// -------------------- Express & Socket.IO --------------------
const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.static('public'));

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

// -------------------- SPA --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req,res) => {
    res.sendFile(`${__dirname}/public/index.html`);
});

// -------------------- サーバー起動 --------------------
(async () => {
    try {
        await (async () => {})();
        cron.schedule('0 0 0 1 * *', async () => {}, { timezone: 'Asia/Tokyo' });
    } finally {
        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
})();
