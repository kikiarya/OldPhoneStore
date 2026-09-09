-- Atomic flash-sale: stock check, one-per-user, enqueue order
-- KEYS[1] = stock key
-- KEYS[2] = buyers set key
-- KEYS[3] = stream key
-- ARGV[1] = userId
-- ARGV[2] = dealId
-- ARGV[3] = orderNo
-- Returns: 1 ok | 0 sold out | 2 already bought

local stock = tonumber(redis.call('GET', KEYS[1]) or '0')
if stock <= 0 then
  return 0
end

if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return 2
end

redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('XADD', KEYS[3], '*',
  'userId', ARGV[1],
  'dealId', ARGV[2],
  'orderNo', ARGV[3]
)
return 1
