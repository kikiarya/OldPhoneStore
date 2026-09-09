const { getRedis, isRedisReady } = require('../redis');
const {
  STREAM_KEY,
  GROUP,
  ensureConsumerGroup,
  persistFlashOrder
} = require('./seckillService');

const CONSUMER = `worker-${process.pid}`;
let timer = null;
let running = false;

async function processOnce() {
  if (!isRedisReady()) return;
  const redis = getRedis();

  const res = await redis.xreadgroup(
    'GROUP',
    GROUP,
    CONSUMER,
    'COUNT',
    10,
    'BLOCK',
    200,
    'STREAMS',
    STREAM_KEY,
    '>'
  );

  if (!res) return;

  for (const [, messages] of res) {
    for (const [id, fields] of messages) {
      const payload = {};
      for (let i = 0; i < fields.length; i += 2) {
        payload[fields[i]] = fields[i + 1];
      }
      try {
        persistFlashOrder({
          userId: payload.userId,
          dealId: payload.dealId,
          orderNo: payload.orderNo
        });
        await redis.xack(STREAM_KEY, GROUP, id);
      } catch (err) {
        console.error('[order-worker] persist failed', id, err.message);
      }
    }
  }
}

async function startOrderWorker() {
  if (running) return;
  running = true;
  await ensureConsumerGroup();

  const loop = async () => {
    if (!running) return;
    try {
      await processOnce();
    } catch (err) {
      if (isRedisReady()) {
        console.warn('[order-worker]', err.message);
      }
    }
    timer = setTimeout(loop, isRedisReady() ? 50 : 2000);
  };

  loop();
  console.log('[order-worker] flash-order consumer started');
}

function stopOrderWorker() {
  running = false;
  if (timer) clearTimeout(timer);
}

/**
 * Cancel unpaid cart orders older than N minutes (苍穹外卖超时关单).
 */
function cancelStalePendingOrders(minutes = 15) {
  const { getDb } = require('../db');
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM orders
       WHERE status = 'pending'
         AND source = 'cart'
         AND datetime(created_at) <= datetime('now', ?) `
    )
    .all(`-${minutes} minutes`);

  const restore = db.prepare(
    `UPDATE phones SET available = 1
     WHERE id IN (SELECT phone_id FROM order_items WHERE order_id = ?)
       AND available = 0`
  );
  const cancel = db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'`
  );

  const tx = db.transaction((ids) => {
    let n = 0;
    for (const { id } of ids) {
      restore.run(id);
      const r = cancel.run(id);
      n += r.changes;
    }
    return n;
  });

  return tx(rows);
}

function startTimeoutScanner() {
  const minutes = Number(process.env.ORDER_TIMEOUT_MINUTES) || 15;
  setInterval(() => {
    try {
      const n = cancelStalePendingOrders(minutes);
      if (n > 0) console.log(`[timeout] cancelled ${n} stale pending orders`);
    } catch (err) {
      console.warn('[timeout]', err.message);
    }
  }, 60 * 1000).unref?.();
}

module.exports = {
  startOrderWorker,
  stopOrderWorker,
  cancelStalePendingOrders,
  startTimeoutScanner
};
