/**
 * Portfolio cache layer — mirrors 黑马点评 "商户查询缓存" patterns:
 * - Cache Aside
 * - Empty-value cache against penetration
 * - Mutex lock against hot-key stampede (击穿)
 * - Jittered TTL against avalanche (雪崩)
 */
const { getRedis, isRedisReady } = require('../redis');

const NULL_MARKER = '__NULL__';

function jitterTtl(baseSec) {
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseSec * 0.2)));
  return baseSec + jitter;
}

async function cacheGet(key) {
  if (!isRedisReady()) return { hit: false, value: undefined };
  const raw = await getRedis().get(key);
  if (raw === null) return { hit: false, value: undefined };
  if (raw === NULL_MARKER) return { hit: true, value: null };
  try {
    return { hit: true, value: JSON.parse(raw) };
  } catch {
    return { hit: false, value: undefined };
  }
}

async function cacheSet(key, value, ttlSec = 300) {
  if (!isRedisReady()) return;
  const redis = getRedis();
  const ttl = jitterTtl(ttlSec);
  if (value === null || value === undefined) {
    await redis.set(key, NULL_MARKER, 'EX', Math.min(ttl, 120));
    return;
  }
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}

async function cacheDel(...keys) {
  if (!isRedisReady() || keys.length === 0) return;
  await getRedis().del(...keys);
}

/**
 * Query with mutex rebuild — classic stampede protection.
 * loader() returns the value to cache (or null).
 */
async function cacheAside(key, loader, { ttlSec = 300, lockTtlSec = 10 } = {}) {
  const cached = await cacheGet(key);
  if (cached.hit) {
    return { data: cached.value, source: 'redis' };
  }

  if (!isRedisReady()) {
    const data = await loader();
    return { data, source: 'db' };
  }

  const redis = getRedis();
  const lockKey = `lock:${key}`;
  const gotLock = await redis.set(lockKey, '1', 'EX', lockTtlSec, 'NX');

  if (!gotLock) {
    // Another worker is rebuilding — brief wait then re-read
    await new Promise((r) => setTimeout(r, 80));
    const again = await cacheGet(key);
    if (again.hit) return { data: again.value, source: 'redis' };
    const data = await loader();
    return { data, source: 'db' };
  }

  try {
    const data = await loader();
    await cacheSet(key, data, ttlSec);
    return { data, source: 'db-cached' };
  } finally {
    await redis.del(lockKey);
  }
}

module.exports = {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheAside,
  NULL_MARKER
};
