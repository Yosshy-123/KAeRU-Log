local key = KEYS[1]
local socketId = ARGV[1]
local ttl = tonumber(ARGV[2])

local current = redis.call('GET', key)
if not current or current == socketId then
  redis.call('SET', key, socketId, 'EX', ttl)
  return 1
end

return 0
