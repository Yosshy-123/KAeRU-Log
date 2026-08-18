'use strict';

const fs = require('fs');
const path = require('path');
const KEYS = require('./redisKeys');
const createRedisLuaScript = require('./redisLuaScript');
const config = require('../config');
const logger = require('./logger');

const LUA_DIR = path.join(__dirname, '..', 'lua');

const CLAIM_CLIENT_SESSION_LUA = fs.readFileSync(path.join(LUA_DIR, 'claimClientSession.lua'), 'utf8');
const REPLACE_CLIENT_SESSION_LUA = fs.readFileSync(path.join(LUA_DIR, 'replaceClientSession.lua'), 'utf8');
const RELEASE_CLIENT_SESSION_LUA = fs.readFileSync(path.join(LUA_DIR, 'releaseClientSession.lua'), 'utf8');

class ClientSessionStore {
  constructor(redisClient, opts = {}) {
    if (!redisClient) {
      throw new Error('redisClient is required');
    }

    const ttl = Number(opts.ttlSec);
    this.redisClient = redisClient;
    this.ttlSec = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : config.socket.sessionTtlSec;

    this.claimScript = createRedisLuaScript(redisClient, CLAIM_CLIENT_SESSION_LUA);
    this.replaceScript = createRedisLuaScript(redisClient, REPLACE_CLIENT_SESSION_LUA);
    this.releaseScript = createRedisLuaScript(redisClient, RELEASE_CLIENT_SESSION_LUA);
  }

  _keyForClient(clientId) {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!normalizedClientId) {
      throw new Error('clientId is required');
    }

    return KEYS.socketSession(normalizedClientId);
  }

  async getSocketId(clientId) {
    try {
      const key = this._keyForClient(clientId);
      const current = await this.redisClient.get(key);
      return typeof current === 'string' && current.trim() ? current.trim() : null;
    } catch (err) {
      logger.error('socket.session.store_error', { phase: 'getSocketId', errorType: err?.name });
      return null;
    }
  }

  async claim(clientId, socketId) {
    try {
      const normalizedSocketId = typeof socketId === 'string' ? socketId.trim() : '';
      if (!normalizedSocketId) {
        throw new Error('socketId is required');
      }

      const key = this._keyForClient(clientId);
      const res = await this.claimScript.eval(1, key, normalizedSocketId, String(this.ttlSec));
      return Array.isArray(res) ? Number(res[0]) === 1 : Boolean(res);
    } catch (err) {
      logger.error('socket.session.store_error', { phase: 'claim', errorType: err?.name });
      return false;
    }
  }

  async replace(clientId, expectedSocketId, nextSocketId) {
    try {
      const normalizedExpectedSocketId = typeof expectedSocketId === 'string' ? expectedSocketId.trim() : '';
      const normalizedNextSocketId = typeof nextSocketId === 'string' ? nextSocketId.trim() : '';

      if (!normalizedExpectedSocketId) {
        throw new Error('expectedSocketId is required');
      }
      if (!normalizedNextSocketId) {
        throw new Error('nextSocketId is required');
      }

      const key = this._keyForClient(clientId);
      const res = await this.replaceScript.eval(1, key, normalizedExpectedSocketId, normalizedNextSocketId, String(this.ttlSec));
      return Array.isArray(res) ? Number(res[0]) === 1 : Boolean(res);
    } catch (err) {
      logger.error('socket.session.store_error', { phase: 'replace', errorType: err?.name });
      return false;
    }
  }

  async release(clientId, socketId) {
    try {
      const normalizedSocketId = typeof socketId === 'string' ? socketId.trim() : '';
      if (!normalizedSocketId) {
        return false;
      }

      const key = this._keyForClient(clientId);
      const res = await this.releaseScript.eval(1, key, normalizedSocketId);
      return Array.isArray(res) ? Number(res[0]) === 1 : Boolean(res);
    } catch (err) {
      logger.error('socket.session.store_error', { phase: 'release', errorType: err?.name });
      return false;
    }
  }
}

module.exports = ClientSessionStore;
