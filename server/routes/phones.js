const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

function rowToPhone(row) {
  if (!row) return null;
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    title: `${row.brand} ${row.model}`,
    storage: row.storage,
    color: row.color,
    condition: row.condition,
    battery_health: row.battery_health,
    year: row.year,
    price: row.price,
    rating: row.rating,
    available: Boolean(row.available),
    category: row.category,
    imei_masked: row.imei_masked,
    description: row.description,
    img: row.img,
    created_at: row.created_at
  };
}

/** GET /api/phones?q=&category=&condition=&available= */
router.get('/', (req, res) => {
  const db = getDb();
  const { q, category, condition, available, brand, minPrice, maxPrice } = req.query;

  const clauses = [];
  const params = {};

  if (q && String(q).trim()) {
    clauses.push(`(
      brand LIKE @q OR model LIKE @q OR color LIKE @q OR description LIKE @q
    )`);
    params.q = `%${String(q).trim()}%`;
  }

  if (category && category !== 'All') {
    if (category === 'unavailable') {
      clauses.push('available = 0');
    } else {
      clauses.push('category = @category');
      params.category = category;
    }
  }

  if (condition && condition !== 'All') {
    clauses.push('condition = @condition');
    params.condition = condition;
  }

  if (brand && brand !== 'All') {
    clauses.push('brand = @brand');
    params.brand = brand;
  }

  if (available === '1' || available === 'true') {
    clauses.push('available = 1');
  } else if (available === '0' || available === 'false') {
    clauses.push('available = 0');
  }

  if (minPrice !== undefined && minPrice !== '') {
    clauses.push('price >= @minPrice');
    params.minPrice = Number(minPrice);
  }

  if (maxPrice !== undefined && maxPrice !== '') {
    clauses.push('price <= @maxPrice');
    params.maxPrice = Number(maxPrice);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM phones ${where} ORDER BY available DESC, price DESC`)
    .all(params);

  res.json({ count: rows.length, phones: rows.map(rowToPhone) });
});

/** GET /api/phones/meta — filter options */
router.get('/meta', (_req, res) => {
  const db = getDb();
  const categories = db
    .prepare('SELECT DISTINCT category FROM phones ORDER BY category')
    .all()
    .map((r) => r.category);
  const brands = db
    .prepare('SELECT DISTINCT brand FROM phones ORDER BY brand')
    .all()
    .map((r) => r.brand);
  const conditions = db
    .prepare('SELECT DISTINCT condition FROM phones ORDER BY condition')
    .all()
    .map((r) => r.condition);
  const stats = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN available = 1 THEN 1 ELSE 0 END) AS in_stock,
        MIN(price) AS min_price,
        MAX(price) AS max_price
       FROM phones`
    )
    .get();

  res.json({ categories, brands, conditions, stats });
});

/** GET /api/phones/:id */
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM phones WHERE id = ?').get(Number(req.params.id));
  if (!row) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  res.json(rowToPhone(row));
});

module.exports = router;
