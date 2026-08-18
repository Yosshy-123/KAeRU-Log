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
