const Redis = require('ioredis');

let client = null;
let available = false;

function createRedis() {
  if (client) return client;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy(times) {
      // Stop hammering when Redis is intentionally down (local without docker)
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    }
  });

  client.on('ready', () => {
    available = true;
    console.log(`[redis] connected (${url})`);
  });

  client.on('error', (err) => {
    available = false;
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[redis] ${err.message}`);
    }
  });

  client.on('end', () => {
    available = false;
  });

  return client;
}

async function connectRedis() {
  const redis = createRedis();
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.ping();
    available = true;
  } catch (err) {
    available = false;
    console.warn(`[redis] unavailable — cache/seckill/chat memory degrade gracefully: ${err.message}`);
  }
  return redis;
}

function getRedis() {
  return createRedis();
}

function isRedisReady() {
  return available && client && client.status === 'ready';
}

async function closeRedis() {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
    available = false;
  }
}

module.exports = {
  connectRedis,
  getRedis,
  isRedisReady,
  closeRedis
};
