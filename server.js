'use strict';

require('dotenv').config();

// -------------------- モジュール --------------------
const http = require('http');

const createApp = require('./app');
const createSocketServer = require('./socket');
const { createRedisClient } = require('./redis');
const createCleanupRooms = require('./lib/cleanupRooms');

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const FRONTEND_URL = process.env.FRONTEND_URL;

const CLEANUP_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

// Initialize and schedule cleanup of inactive rooms
try {
  const cleanup = createCleanupRooms({ redisClient, io, thresholdDays: CLEANUP_DAYS });
  cleanup.schedule(CLEANUP_INTERVAL_MS);
} catch (err) {
  console.error('Failed to initialize cleanup service', err);
}

// Attach express app to http server
httpServer.on('request', (req, res) => app(req, res));

// -------------------- 起動 --------------------
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
