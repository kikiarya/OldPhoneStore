const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

/**
 * POST /api/orders
 * Body: { customer_name?, customer_email?, items: [{ phone_id, quantity }] }
 * Creates a pending order and decrements stock for unique devices (qty usually 1).
 */
router.post('/', (req, res) => {
  const db = getDb();
  const { customer_name, customer_email, items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
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

      const orderInfo = db
        .prepare(
          `INSERT INTO orders (customer_name, customer_email, total, status)
           VALUES (?, ?, ?, 'pending')`
        )
        .run(customer_name || null, customer_email || null, total);

      const orderId = orderInfo.lastInsertRowid;
      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, phone_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`
      );
      const markSold = db.prepare('UPDATE phones SET available = 0 WHERE id = ?');

      for (const { phone, quantity } of resolved) {
        insertItem.run(orderId, phone.id, quantity, phone.price);
        // Each listing is a unique device — mark unavailable after purchase
        markSold.run(phone.id);
      }

      return { orderId, total, itemCount: resolved.length };
    })();

    res.status(201).json({
      message: 'Order placed',
      order_id: result.orderId,
      total: result.total,
      item_count: result.itemCount
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Checkout failed' });
  }
});

/** GET /api/orders/:id */
router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const items = db
    .prepare(
      `SELECT oi.*, p.brand, p.model, p.img, p.storage, p.condition
       FROM order_items oi
       JOIN phones p ON p.id = oi.phone_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);

  res.json({ ...order, items });
});

module.exports = router;
