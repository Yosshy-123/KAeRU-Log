local max = tonumber(ARGV[2])
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -max, -1)
return 1
