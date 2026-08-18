'use strict';

require('dotenv').config();

const http = require('http');

const createApp = require('./app');
const createSocketServer = require('./socket');
const { createRedisClient } = require('./redis');
const createCleanupRooms = require('./lib/cleanupRooms');
const config = require('./config');
const logger = require('./lib/logger');

const DEFAULT_PORT = 3000;
const CLEANUP_DAYS = config.cleanup.thresholdDays;
const CLEANUP_INTERVAL_MS = config.cleanup.intervalMs;

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
    logger.error('redis.error', { phase: 'quit', errorType: err?.name });
  }

  try {
    if (typeof client.disconnect === 'function') {
      client.disconnect();
    }
  } catch (err) {
    logger.error('redis.error', { phase: 'disconnect', errorType: err?.name });
  }
}

const PORT = parsePort(process.env.PORT, DEFAULT_PORT);
const REDIS_URL = readRequiredEnv('REDIS_URL');
const ADMIN_PASS = readRequiredEnv('ADMIN_PASS');
const HTTPS_ENABLED = process.env.HTTPS === 'true';

const missing = Object.entries({ ADMIN_PASS, REDIS_URL })
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  logger.error('config.missing_env', { keys: missing });
  process.exit(1);
}

let redisClient;
try {
  redisClient = createRedisClient(REDIS_URL);
} catch (err) {
  logger.error('redis.error', { phase: 'create_client', errorType: err?.name });
  process.exit(1);
}

const httpServer = http.createServer();

const io = createSocketServer({
  httpServer,
  redisClient,
});

const app = createApp({
  redisClient,
  io,
  adminPass: ADMIN_PASS,
  httpsEnabled: HTTPS_ENABLED,
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
  logger.error('cleanup.error', { phase: 'init', errorType: err?.name });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info('server.shutdown', { signal });

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
  logger.info('server.listen', { port: PORT });
});
