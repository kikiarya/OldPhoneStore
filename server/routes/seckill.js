const express = require('express');
const { authRequired } = require('../middleware/auth');
const { listActiveDeals, trySeckill, warmAllActiveDeals } = require('../services/seckillService');
const { isRedisReady } = require('../redis');

const router = express.Router();

/** GET /api/flash — active deals */
router.get('/', (_req, res) => {
  const deals = listActiveDeals();
  res.json({
    count: deals.length,
    redis: isRedisReady(),
    deals
  });
});

/** POST /api/flash/:id/buy — seckill (login required) */
router.post('/:id/buy', authRequired, async (req, res) => {
  try {
    const result = await trySeckill(Number(req.params.id), req.user.id);
    res.status(202).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Seckill failed' });
  }
});

/** POST /api/flash/warm — reload Redis stock from SQLite (admin-ish demo) */
router.post('/warm', authRequired, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const n = await warmAllActiveDeals();
  res.json({ warmed: n, redis: isRedisReady() });
});

module.exports = router;
