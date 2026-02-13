local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil or ts == nil then
  tokens = capacity
  ts = now_ms
end

local delta = now_ms - ts
if delta < 0 then
  delta = 0
end

local newTokens = tokens
if refill_per_ms > 0 then
  newTokens = math.min(capacity, newTokens + delta * refill_per_ms)
end

local allowed = 0
if newTokens >= 1 then
  allowed = 1
  newTokens = newTokens - 1
end

redis.call('HSET', key, 'tokens', newTokens, 'ts', now_ms)

local ttlSec = 3600
if refill_per_ms > 0 then
  local msToFull = capacity / refill_per_ms
  ttlSec = math.ceil((msToFull / 1000) * 2)
  if ttlSec < 1 then ttlSec = 1 end
end
redis.call('EXPIRE', key, ttlSec)

return { allowed, newTokens }