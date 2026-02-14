'use strict';

require('dotenv').config();

// -------------------- モジュール --------------------
const http = require('http');

const createApp = require('./app');
const createSocketServer = require('./socket');
const { createRedisClient } = require('./redis');

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Validate required environment variables
const missing = Object.entries({ ADMIN_PASS, REDIS_URL, FRONTEND_URL })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(1);
}

// -------------------- Redis --------------------
let redisClient;
try {
  redisClient = createRedisClient(REDIS_URL);
} catch (err) {
  console.error('Redis client creation error:', err);
  process.exit(1);
}

// Handle Redis connection errors
redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('disconnect', () => {
  console.warn('Disconnected from Redis');
});

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

// Attach express app to http server
httpServer.on('request', (req, res) => {
  try {
    app(req, res);
  } catch (err) {
    console.error('Uncaught error in request handler:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal Server Error',
        code: 'server_error'
      }));
    }
  }
});

// Handle HTTP server errors
httpServer.on('error', (err) => {
  console.error('HTTP server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// -------------------- 起動 --------------------
const server = httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle client errors
httpServer.on('clientError', (err, socket) => {
  console.error('Client error:', err);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

// -------------------- Graceful Shutdown --------------------
/**
 * Handle graceful shutdown
 */
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Disconnect Socket.IO
  if (io) {
    io.disconnectSockets();
  }

  // Close Redis connection
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (err) {
      console.error('Error closing Redis connection:', err);
    }
  }

  // Force exit after timeout
  const timeout = setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);

  timeout.unref();

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});