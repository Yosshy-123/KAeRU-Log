local failKey = KEYS[1]
local lockKey = KEYS[2]

local action = ARGV[1] or ''

local function to_number(value, fallback)
  local n = tonumber(value)
  if n == nil then
    return fallback
  end
  return n
end

local function to_response(locked, remainingMs, failures)
  return { tostring(locked and 1 or 0), tostring(remainingMs or 0), tostring(failures or 0) }
end

if action == 'ttl' then
  local ttl = redis.call('pttl', lockKey)
  if type(ttl) ~= 'number' or ttl <= 0 then
    ttl = 0
  end
  return tostring(ttl)
end

if action == 'reset' then
  redis.call('del', failKey, lockKey)
  return '1'
end

if action ~= 'fail' then
  error('unsupported admin login defense action: ' .. action)
end

local threshold = to_number(ARGV[2], 5)
local failureWindowMs = to_number(ARGV[3], 15 * 60 * 1000)
local lockoutMs = to_number(ARGV[4], 10 * 60 * 1000)
local maxLockoutMs = to_number(ARGV[5], 60 * 60 * 1000)

local existingLockMs = redis.call('pttl', lockKey)
if type(existingLockMs) ~= 'number' then
  existingLockMs = 0
end
if existingLockMs > 0 then
  return to_response(true, existingLockMs, 0)
end

local count = redis.call('incr', failKey)
if count == 1 then
  redis.call('pexpire', failKey, failureWindowMs)
end

if count >= threshold then
  local nextLockMs = lockoutMs
  if nextLockMs > maxLockoutMs then
    nextLockMs = maxLockoutMs
  end
  redis.call('psetex', lockKey, nextLockMs, tostring(count))
  redis.call('del', failKey)
  return to_response(true, nextLockMs, count)
end

return to_response(false, 0, count)
