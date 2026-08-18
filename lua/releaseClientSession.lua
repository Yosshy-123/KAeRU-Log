local key = KEYS[1]
local socketId = ARGV[1]

local current = redis.call('GET', key)
if current and current == socketId then
  redis.call('DEL', key)
  return 1
end

return 0
