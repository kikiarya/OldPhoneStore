const fs = require('fs');
const path = require('path');
const { getDb, nextOrderNo } = require('../db');
const { getRedis, isRedisReady } = require('../redis');

const LUA = fs.readFileSync(path.join(__dirname, '..', 'lua', 'seckill.lua'), 'utf8');
const STREAM_KEY = 'stream:flash:orders';
const GROUP = 'flash-workers';

function stockKey(dealId) {
  return `flash:stock:${dealId}`;
}

function buyersKey(dealId) {
  return `flash:buyers:${dealId}`;
}

async function warmDealStock(deal) {
  if (!isRedisReady()) return false;
  const redis = getRedis();
  const remaining = Math.max(0, deal.stock - deal.sold);
  await redis.set(stockKey(deal.id), String(remaining));
  // Do not clear buyers set — preserves one-per-user across restarts within TTL window
  await redis.expire(buyersKey(deal.id), 60 * 60 * 24 * 3);
  return true;
}

async function warmAllActiveDeals() {
  const db = getDb();
  const deals = db
    .prepare(
      `SELECT * FROM flash_deals
       WHERE active = 1 AND datetime(end_at) > datetime('now')`
    )
    .all();
  for (const deal of deals) {
    await warmDealStock(deal);
  }
  return deals.length;
}

function getDeal(dealId) {
  return getDb().prepare('SELECT * FROM flash_deals WHERE id = ?').get(dealId);
}

function listActiveDeals() {
  const db = getDb();
  return db
    .prepare(
      `SELECT fd.*, p.brand, p.model, p.img, p.condition
       FROM flash_deals fd
       LEFT JOIN phones p ON p.id = fd.phone_id
       WHERE fd.active = 1
       ORDER BY fd.id`
    )
    .all()
    .map((d) => ({
      ...d,
      remaining: Math.max(0, d.stock - d.sold),
      active_window:
        new Date(d.start_at).getTime() <= Date.now() &&
        new Date(d.end_at).getTime() >= Date.now()
    }));
}

async function trySeckill(dealId, userId) {
  const deal = getDeal(dealId);
  if (!deal || !deal.active) {
    const err = new Error('Flash deal not found');
    err.status = 404;
    throw err;
  }

  const now = Date.now();
  if (new Date(deal.start_at).getTime() > now) {
    const err = new Error('Flash deal has not started');
    err.status = 400;
    throw err;
  }
  if (new Date(deal.end_at).getTime() < now) {
    const err = new Error('Flash deal has ended');
    err.status = 400;
    throw err;
  }

  const orderNo = nextOrderNo(getDb());

  if (!isRedisReady()) {
    // Fallback: SQLite optimistic lock (portfolio demo without Redis)
    return syncSeckillSqlite(deal, userId, orderNo);
  }

  const redis = getRedis();
  // Ensure stock key exists
  const exists = await redis.exists(stockKey(deal.id));
  if (!exists) await warmDealStock(deal);

  const code = await redis.eval(
    LUA,
    3,
    stockKey(deal.id),
    buyersKey(deal.id),
    STREAM_KEY,
    String(userId),
    String(deal.id),
    orderNo
  );

  if (code === 0) {
    const err = new Error('Sold out');
    err.status = 409;
    throw err;
  }
  if (code === 2) {
    const err = new Error('One deal per user — already claimed');
    err.status = 409;
    throw err;
  }

  return {
    accepted: true,
    async: true,
    order_no: orderNo,
    deal_id: deal.id,
    message: 'Seckill accepted — order is being written asynchronously'
  };
}

function syncSeckillSqlite(deal, userId, orderNo) {
  const db = getDb();
  const result = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM flash_deals WHERE id = ?').get(deal.id);
    if (!fresh || fresh.sold >= fresh.stock) {
      const err = new Error('Sold out');
      err.status = 409;
      throw err;
    }

    const already = db
      .prepare(
        `SELECT id FROM orders
         WHERE user_id = ? AND flash_deal_id = ? AND status != 'cancelled'`
      )
      .get(userId, deal.id);
    if (already) {
      const err = new Error('One deal per user — already claimed');
      err.status = 409;
      throw err;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const info = db
      .prepare(
        `INSERT INTO orders (
           customer_name, customer_email, total, status, user_id, order_no, source, flash_deal_id, updated_at
         ) VALUES (?, ?, ?, 'paid', ?, ?, 'flash', ?, datetime('now'))`
      )
      .run(
        user?.name || null,
        user?.email || null,
        fresh.price,
        userId,
        orderNo,
        fresh.id
      );

    const orderId = info.lastInsertRowid;
    if (fresh.phone_id) {
      db.prepare(
        `INSERT INTO order_items (order_id, phone_id, quantity, unit_price)
         VALUES (?, ?, 1, ?)`
      ).run(orderId, fresh.phone_id, fresh.price);
    }

    const updated = db
      .prepare(
        `UPDATE flash_deals SET sold = sold + 1
         WHERE id = ? AND sold < stock`
      )
      .run(fresh.id);
    if (updated.changes === 0) {
      const err = new Error('Sold out');
      err.status = 409;
      throw err;
    }

    return { orderId, orderNo, total: fresh.price };
  })();

  return {
    accepted: true,
    async: false,
    order_id: result.orderId,
    order_no: result.orderNo,
    total: result.total,
    message: 'Order created (SQLite fallback — Redis unavailable)'
  };
}

async function ensureConsumerGroup() {
  if (!isRedisReady()) return;
  const redis = getRedis();
  try {
    await redis.xgroup('CREATE', STREAM_KEY, GROUP, '0', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err;
  }
}

/**
 * Persist one flash order from Redis Stream payload.
 */
function persistFlashOrder({ userId, dealId, orderNo }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo);
  if (existing) return { duplicate: true, order_id: existing.id };

  return db.transaction(() => {
    const deal = db.prepare('SELECT * FROM flash_deals WHERE id = ?').get(Number(dealId));
    if (!deal) throw new Error(`Deal ${dealId} missing`);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
    const info = db
      .prepare(
        `INSERT INTO orders (
           customer_name, customer_email, total, status, user_id, order_no, source, flash_deal_id, updated_at
         ) VALUES (?, ?, ?, 'paid', ?, ?, 'flash', ?, datetime('now'))`
      )
      .run(
        user?.name || null,
        user?.email || null,
        deal.price,
        Number(userId),
        orderNo,
        deal.id
      );

    const orderId = info.lastInsertRowid;
    if (deal.phone_id) {
      db.prepare(
        `INSERT INTO order_items (order_id, phone_id, quantity, unit_price)
         VALUES (?, ?, 1, ?)`
      ).run(orderId, deal.phone_id, deal.price);
    }

    db.prepare(
      `UPDATE flash_deals SET sold = CASE WHEN sold < stock THEN sold + 1 ELSE sold END
       WHERE id = ?`
    ).run(deal.id);

    return { duplicate: false, order_id: orderId };
  })();
}

module.exports = {
  STREAM_KEY,
  GROUP,
  listActiveDeals,
  trySeckill,
  warmAllActiveDeals,
  warmDealStock,
  ensureConsumerGroup,
  persistFlashOrder,
  stockKey,
  buyersKey
};
