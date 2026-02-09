'use strict';

require('dotenv').config();

// -------------------- モジュール --------------------
const http = require('http');
const cron = require('node-cron');

const createApp = require('./app');
const createSocketServer = require('./socket');
const { createRedisClient } = require('./redis');
const { registerMonthlyResetCron, monthlyRedisReset } = require('./cron');

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const FRONTEND_URL = process.env.FRONTEND_URL;

const missing = Object.entries({ ADMIN_PASS, REDIS_URL, FRONTEND_URL })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(1);
}

// -------------------- Redis --------------------
const redisClient = createRedisClient(REDIS_URL);

// -------------------- HTTP server --------------------
const httpServer = http.createServer();

// -------------------- Socket.IO --------------------
const io = createSocketServer({
  httpServer,
  redisClient,
  frontendUrl: FRONTEND_URL,
});

// -------------------- Express --------------------
const app = createApp({
  redisClient,
  io,
  adminPass: ADMIN_PASS,
  frontendUrl: FRONTEND_URL,
});

httpServer.on('request', app);

// -------------------- 起動 --------------------
(async () => {
  try {
    await monthlyRedisReset(redisClient);
    registerMonthlyResetCron(cron, redisClient);
  } catch (err) {
    console.error('Monthly reset check failed', err);
  } finally {
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  }
})();