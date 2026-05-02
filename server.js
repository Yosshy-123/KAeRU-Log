'use strict';

require('dotenv').config();

const http = require('http');

const createApp = require('./app');
const createSocketServer = require('./socket');
const { createRedisClient } = require('./redis');
const createCleanupRooms = require('./lib/cleanupRooms');

const DEFAULT_PORT = 3000;
const CLEANUP_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return fallback;
}

function closeHttpServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

async function closeRedisClient(client) {
  if (!client) {
    return;
  }

  try {
    if (typeof client.quit === 'function') {
      await client.quit();
      return;
    }
  } catch (err) {
    console.error('Redis quit failed', err);
  }

  try {
    if (typeof client.disconnect === 'function') {
      client.disconnect();
    }
  } catch (err) {
    console.error('Redis disconnect failed', err);
  }
}

const PORT = parsePort(process.env.PORT, DEFAULT_PORT);
const REDIS_URL = readRequiredEnv('REDIS_URL');
const ADMIN_PASS = readRequiredEnv('ADMIN_PASS');
const FRONTEND_URL = readRequiredEnv('FRONTEND_URL');

const missing = Object.entries({ ADMIN_PASS, REDIS_URL, FRONTEND_URL })
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(1);
}

let redisClient;
try {
  redisClient = createRedisClient(REDIS_URL);
} catch (err) {
  console.error('Failed to create Redis client', err);
  process.exit(1);
}

const httpServer = http.createServer();

const io = createSocketServer({
  httpServer,
  redisClient,
  frontendUrl: FRONTEND_URL,
});

const app = createApp({
  redisClient,
  io,
  adminPass: ADMIN_PASS,
  frontendUrl: FRONTEND_URL,
});

httpServer.on('request', app);

let cleanupInterval = null;
try {
  const cleanup = createCleanupRooms({
    redisClient,
    io,
    thresholdDays: CLEANUP_DAYS,
  });
  cleanupInterval = cleanup.schedule(CLEANUP_INTERVAL_MS);
} catch (err) {
  console.error('Failed to initialize cleanup service', err);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`Received ${signal}, shutting down...`);

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  await Promise.allSettled([
    closeHttpServer(httpServer),
    new Promise((resolve) => io.close(() => resolve())),
    io.closeRedisConnections ? io.closeRedisConnections() : Promise.resolve(),
    closeRedisClient(redisClient),
  ]);

  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
