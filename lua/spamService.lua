local lastKey = KEYS[1]
local prevDeltaKey = KEYS[2]
local repeatKey = KEYS[3]
local muteKey = KEYS[4]
local muteLevelKey = KEYS[5]
local lastMsgHashKey = KEYS[6]
local repeatMsgKey = KEYS[7]
local shortRateKey = KEYS[8]

local now = tonumber(ARGV[1])
local messageRateLimitMs = tonumber(ARGV[2])
local intervalJitterMs = tonumber(ARGV[3])
local intervalWindowSec = tonumber(ARGV[4])
local baseMuteSec = tonumber(ARGV[5])
local maxMuteSec = tonumber(ARGV[6])
local repeatLimit = tonumber(ARGV[7])
local sameMessageLimit = tonumber(ARGV[8])
local msgHash = ARGV[9]
local shortRateWindowSec = tonumber(ARGV[10]) or 15
local shortRateLimit = tonumber(ARGV[11]) or 6

local function to_resp(muted, rejected, reason, muteSec)
  return { tostring(muted and 1 or 0), tostring(rejected and 1 or 0), reason or '', tostring(muteSec or 0) }
end

local function apply_mute(reason)
  local levelRaw = redis.call('get', muteLevelKey)
  local level = 0
  if levelRaw then level = tonumber(levelRaw) end
  local muteSec = baseMuteSec * (2 ^ level)
  if muteSec > maxMuteSec then muteSec = maxMuteSec end
  muteSec = math.floor(muteSec)
  redis.call('set', muteKey, '1', 'EX', muteSec)
  local lastTTL = redis.call('ttl', lastKey)
  if type(lastTTL) ~= 'number' or lastTTL < 0 then lastTTL = intervalWindowSec end
  local levelTTL = lastTTL + 600
  redis.call('set', muteLevelKey, tostring(level + 1), 'EX', levelTTL)
  redis.call('del', prevDeltaKey)
  redis.call('del', repeatKey)
  redis.call('del', repeatMsgKey)
  if shortRateKey and shortRateKey ~= '' then
    redis.call('del', shortRateKey)
  end
  redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)
  return to_resp(true, true, reason, muteSec)
end

if redis.call('exists', muteKey) == 1 then
  local ttl = redis.call('ttl', muteKey)
  if type(ttl) ~= 'number' or ttl < 0 then ttl = 0 end
  return to_resp(true, true, 'already-muted', ttl)
end

if shortRateKey and shortRateKey ~= '' then
  local srCount = redis.call('incr', shortRateKey)
  if srCount == 1 then
    redis.call('expire', shortRateKey, shortRateWindowSec)
  end
  if srCount > shortRateLimit then
    return apply_mute('short-rate')
  end
end

if msgHash and msgHash ~= '' then
  local lastHash = redis.call('get', lastMsgHashKey)
  if lastHash and lastHash == msgHash then
    local repMsg = redis.call('incr', repeatMsgKey)
    if repMsg == 1 then
      redis.call('expire', repeatMsgKey, intervalWindowSec)
    end
    if repMsg >= sameMessageLimit then
      return apply_mute('repeat-message')
    end
  else
    redis.call('set', lastMsgHashKey, msgHash, 'EX', intervalWindowSec)
    redis.call('del', repeatMsgKey)
  end
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
      return apply_mute('stable-delta')
    end
  else
    redis.call('del', repeatKey)
  end
end

redis.call('set', prevDeltaKey, tostring(delta), 'EX', intervalWindowSec)
redis.call('set', lastKey, tostring(now), 'EX', intervalWindowSec)

return to_resp(false, false, '', 0)
