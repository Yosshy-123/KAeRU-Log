local lastKey = KEYS[1]
local prevDeltaKey = KEYS[2]
local repeatKey = KEYS[3]
local muteKey = KEYS[4]
local muteLevelKey = KEYS[5]

local now = tonumber(ARGV[1])
local messageRateLimitMs = tonumber(ARGV[2])
local intervalJitterMs = tonumber(ARGV[3])
local intervalWindowSec = tonumber(ARGV[4])
local baseMuteSec = tonumber(ARGV[5])
local maxMuteSec = tonumber(ARGV[6])
local repeatLimit = tonumber(ARGV[7])

local function to_resp(muted, rejected, reason, muteSec)
  return { tostring(muted and 1 or 0), tostring(rejected and 1 or 0), reason or '', tostring(muteSec or 0) }
end

if redis.call('exists', muteKey) == 1 then
  local ttl = redis.call('ttl', muteKey)
  if type(ttl) ~= 'number' or ttl < 0 then ttl = 0 end
  return to_resp(true, true, 'already-muted', ttl)
end

local lastRaw = redis.call('get', lastKey)
if not lastRaw then
  redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)
  return to_resp(false, false, '', 0)
end

local last = tonumber(lastRaw)
local delta = now - last

if delta < messageRateLimitMs then
  redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)
  return to_resp(false, true, 'rate-limit', 0)
end

local prevDeltaRaw = redis.call('get', prevDeltaKey)
local prevDelta = nil
if prevDeltaRaw then prevDelta = tonumber(prevDeltaRaw) end

if prevDelta then
  if math.abs(delta - prevDelta) <= intervalJitterMs then
    local rep = redis.call('incr', repeatKey)
    if rep == 1 then
      redis.call('expire', repeatKey, intervalWindowSec)
    end

    if rep >= repeatLimit then
      local levelRaw = redis.call('get', muteLevelKey)
      local level = 0
      if levelRaw then level = tonumber(levelRaw) end
      local muteSec = baseMuteSec * (2 ^ level)
      if muteSec > maxMuteSec then muteSec = maxMuteSec end

      redis.call('set', muteKey, '1', 'EX', math.floor(muteSec))

      -- compute level TTL: lastKey TTL + 600 (10min)
      local lastTTL = redis.call('ttl', lastKey)
      if type(lastTTL) ~= 'number' or lastTTL < 0 then lastTTL = intervalWindowSec end
      local levelTTL = lastTTL + 600
      redis.call('set', muteLevelKey, tostring(level + 1), 'EX', levelTTL)

      redis.call('del', prevDeltaKey)
      redis.call('del', repeatKey)
      redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)

      return to_resp(true, true, 'stable-delta', math.floor(muteSec))
    end
  else
    redis.call('del', repeatKey)
  end
end

redis.call('set', prevDeltaKey, tostring(delta), 'EX', intervalWindowSec)
redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)

return to_resp(false, false, '', 0)
