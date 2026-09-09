const express = require('express');
const { getDb } = require('../db');
const { adminRequired } = require('../middleware/auth');
const { invalidatePhoneCaches, rowToPhone } = require('./phones');
const { warmDealStock } = require('../services/seckillService');
const { cancelStalePendingOrders } = require('../services/orderWorker');
const { isRedisReady } = require('../redis');

const router = express.Router();

router.use(adminRequired);

router.get('/dashboard', (_req, res) => {
  const db = getDb();
  const phones = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN available = 1 THEN 1 ELSE 0 END) AS in_stock
       FROM phones`
    )
    .get();
  const orders = db
    .prepare(
      `SELECT status, COUNT(*) AS c FROM orders GROUP BY status`
    )
    .all();
  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS paid_revenue
       FROM orders WHERE status IN ('paid', 'shipped', 'completed')`
    )
    .get();
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const flash = db
    .prepare(
      `SELECT id, title, stock, sold, price FROM flash_deals WHERE active = 1`
    )
    .all();

  res.json({
    redis: isRedisReady(),
    phones,
    users,
    orders_by_status: Object.fromEntries(orders.map((o) => [o.status, o.c])),
    revenue,
    flash
  });
});

router.get('/orders', (req, res) => {
  const db = getDb();
  const status = req.query.status;
  const rows = status
    ? db
        .prepare(`SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 100`)
        .all(status)
    : db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT 100`).all();
  res.json({ count: rows.length, orders: rows });
});

router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body || {};
  const allowed = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.prepare(
    `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, order.id);

  res.json({ message: 'Updated', order_id: order.id, status });
});

router.post('/orders/timeout-scan', (_req, res) => {
  const n = cancelStalePendingOrders(Number(process.env.ORDER_TIMEOUT_MINUTES) || 15);
  res.json({ cancelled: n });
});

router.patch('/phones/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const phone = db.prepare('SELECT * FROM phones WHERE id = ?').get(id);
  if (!phone) return res.status(404).json({ error: 'Phone not found' });

  const fields = [
    'brand',
    'model',
    'storage',
    'color',
    'condition',
    'battery_health',
    'year',
    'price',
    'rating',
    'available',
    'category',
    'description'
  ];
  const updates = [];
  const params = { id };
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = @${f}`);
      params[f] = f === 'available' ? (req.body[f] ? 1 : 0) : req.body[f];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  db.prepare(`UPDATE phones SET ${updates.join(', ')} WHERE id = @id`).run(params);
  await invalidatePhoneCaches(id);
  const row = db.prepare('SELECT * FROM phones WHERE id = ?').get(id);
  res.json(rowToPhone(row));
});

router.post('/flash', async (req, res) => {
  const { title, subtitle, phone_id, stock, price, original_price, hours = 24 } = req.body || {};
  if (!title || !stock || !price) {
    return res.status(400).json({ error: 'title, stock, price required' });
  }
  const db = getDb();
  const start = new Date();
  const end = new Date(Date.now() + Number(hours) * 3600 * 1000);
  const info = db
    .prepare(
      `INSERT INTO flash_deals (
         title, subtitle, phone_id, stock, sold, price, original_price, start_at, end_at, active
       ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1)`
    )
    .run(
      title,
      subtitle || null,
      phone_id || null,
      Number(stock),
      Number(price),
      Number(original_price || price),
      start.toISOString(),
      end.toISOString()
    );

  const deal = db.prepare('SELECT * FROM flash_deals WHERE id = ?').get(info.lastInsertRowid);
  await warmDealStock(deal);
  res.status(201).json(deal);
});

module.exports = router;
