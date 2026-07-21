'use strict';

const KEYS = require('./redisKeys');
const createRedisLuaScript = require('./redisLuaScript');

const CLAIM_CLIENT_SESSION_LUA = `
local key = KEYS[1]
local socketId = ARGV[1]
local ttl = tonumber(ARGV[2])

local current = redis.call('GET', key)
if not current or current == socketId then
  redis.call('SET', key, socketId, 'EX', ttl)
  return 1
end

return 0
`;

const REPLACE_CLIENT_SESSION_LUA = `
local key = KEYS[1]
local expectedSocketId = ARGV[1]
local nextSocketId = ARGV[2]
local ttl = tonumber(ARGV[3])

local current = redis.call('GET', key)
if current and current ~= expectedSocketId then
  return 0
end

redis.call('SET', key, nextSocketId, 'EX', ttl)
return 1
`;

const RELEASE_CLIENT_SESSION_LUA = `
local key = KEYS[1]
local socketId = ARGV[1]

local current = redis.call('GET', key)
if current and current == socketId then
  redis.call('DEL', key)
  return 1
end

return 0
`;

class ClientSessionStore {
  constructor(redisClient, opts = {}) {
    if (!redisClient) {
      throw new Error('redisClient is required');
    }

    const ttl = Number(opts.ttlSec);
    this.redisClient = redisClient;
    this.ttlSec = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 24 * 60 * 60;

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
      console.error('ClientSessionStore.getSocketId error', err);
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
      console.error('ClientSessionStore.claim error', err);
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
      console.error('ClientSessionStore.replace error', err);
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
      console.error('ClientSessionStore.release error', err);
      return false;
    }
  }
}

module.exports = ClientSessionStore;
