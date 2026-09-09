const express = require('express');
const { getDb, nextOrderNo } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { getRedis, isRedisReady } = require('../redis');
const { cacheDel } = require('../services/cacheService');

const router = express.Router();

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];

async function acquireIdempotency(key, userId) {
  if (!key) return { ok: true };
  if (isRedisReady()) {
    const redis = getRedis();
    const redisKey = `idem:order:${userId || 'anon'}:${key}`;
    const set = await redis.set(redisKey, '1', 'EX', 60 * 10, 'NX');
    if (!set) {
      return { ok: false, reason: 'duplicate' };
    }
  }
  return { ok: true };
}

/**
 * POST /api/orders
 * Headers: Idempotency-Key (recommended)
 * Body: { customer_name?, customer_email?, items: [{ phone_id, quantity }] }
 */
router.post('/', authOptional, async (req, res) => {
  const db = getDb();
  const { customer_name, customer_email, items } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key || null;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  if (idempotencyKey) {
    const existing = db
      .prepare('SELECT id, order_no, total, status FROM orders WHERE idempotency_key = ?')
      .get(String(idempotencyKey));
    if (existing) {
      return res.status(200).json({
        message: 'Idempotent replay',
        order_id: existing.id,
        order_no: existing.order_no,
        total: existing.total,
        status: existing.status,
        idempotent: true
      });
    }
  }

  const gate = await acquireIdempotency(idempotencyKey, req.user?.id);
  if (!gate.ok) {
    return res.status(409).json({ error: 'Duplicate checkout in progress — retry with same Idempotency-Key' });
  }

  try {
    const result = db.transaction(() => {
      let total = 0;
      const resolved = [];

      for (const item of items) {
        const phoneId = Number(item.phone_id);
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const phone = db.prepare('SELECT * FROM phones WHERE id = ?').get(phoneId);

        if (!phone) {
          const err = new Error(`Phone #${phoneId} not found`);
          err.status = 404;
          throw err;
        }
        if (!phone.available) {
          const err = new Error(`${phone.brand} ${phone.model} is sold out`);
          err.status = 409;
          throw err;
        }

        total += phone.price * quantity;
        resolved.push({ phone, quantity });
      }

      const orderNo = nextOrderNo(db);
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (
             customer_name, customer_email, total, status, user_id, order_no, idempotency_key, source, updated_at
           ) VALUES (?, ?, ?, 'pending', ?, ?, ?, 'cart', datetime('now'))`
        )
        .run(
          customer_name || req.user?.name || null,
          customer_email || req.user?.email || null,
          total,
          req.user?.id || null,
          orderNo,
          idempotencyKey ? String(idempotencyKey) : null
        );

      const orderId = orderInfo.lastInsertRowid;
      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, phone_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`
      );
      const markSold = db.prepare(
        `UPDATE phones SET available = 0 WHERE id = ? AND available = 1`
      );

      for (const { phone, quantity } of resolved) {
        const sold = markSold.run(phone.id);
        if (sold.changes === 0) {
          const err = new Error(`${phone.brand} ${phone.model} is sold out`);
          err.status = 409;
          throw err;
        }
        insertItem.run(orderId, phone.id, quantity, phone.price);
      }

      return { orderId, orderNo, total, itemCount: resolved.length };
    })();

    for (const item of items) {
      await cacheDel(`phone:${item.phone_id}`, 'phones:meta');
    }

    res.status(201).json({
      message: 'Order placed',
      order_id: result.orderId,
      order_no: result.orderNo,
      total: result.total,
      item_count: result.itemCount,
      status: 'pending'
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Checkout failed' });
  }
});

/** GET /api/orders/mine — current user's orders */
router.get('/mine', authRequired, (req, res) => {
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT id, order_no, total, status, source, created_at, updated_at
       FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50`
    )
    .all(req.user.id);
  res.json({ count: orders.length, orders });
});

/** POST /api/orders/:id/pay — demo pay (pending → paid) */
router.post('/:id/pay', authOptional, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user && order.user_id && order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (order.status !== 'pending') {
    return res.status(409).json({ error: `Cannot pay order in status ${order.status}` });
  }

  // Conditional update — payment callback idempotency
  const r = db
    .prepare(
      `UPDATE orders SET status = 'paid', updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    )
    .run(order.id);

  if (r.changes === 0) {
    return res.status(409).json({ error: 'Order already processed' });
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json({ message: 'Payment recorded', order: updated });
});

/** POST /api/orders/:id/cancel */
router.post('/:id/cancel', authOptional, async (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user && order.user_id && order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!['pending', 'paid'].includes(order.status)) {
    return res.status(409).json({ error: `Cannot cancel order in status ${order.status}` });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND status IN ('pending', 'paid')`
    ).run(order.id);

    if (order.source === 'cart') {
      db.prepare(
        `UPDATE phones SET available = 1
         WHERE id IN (SELECT phone_id FROM order_items WHERE order_id = ?)`
      ).run(order.id);
    }
  })();

  const items = db.prepare('SELECT phone_id FROM order_items WHERE order_id = ?').all(order.id);
  for (const it of items) await cacheDel(`phone:${it.phone_id}`);

  res.json({ message: 'Order cancelled', order_id: order.id });
});

/** GET /api/orders/:id */
router.get('/:id', authOptional, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (req.user && order.user_id && order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const items = db
    .prepare(
      `SELECT oi.*, p.brand, p.model, p.img, p.storage, p.condition
       FROM order_items oi
       JOIN phones p ON p.id = oi.phone_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);

  res.json({ ...order, items, status_flow: ORDER_STATUSES });
});

module.exports = router;
