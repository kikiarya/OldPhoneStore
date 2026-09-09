require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { getDb, DB_PATH } = require('./db');
const phonesRouter = require('./routes/phones');
const ordersRouter = require('./routes/orders');
const { seed } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(cors());
app.use(express.json());

seed();

app.get('/api/health', (_req, res) => {
  const db = getDb();
  const phones = db.prepare('SELECT COUNT(*) AS c FROM phones').get().c;
  res.json({
    status: 'ok',
    service: 'OldPhoneStore',
    database: path.resolve(DB_PATH),
    phones
  });
});

app.use('/api/phones', phonesRouter);
app.use('/api/orders', ordersRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA-style fallback for root paths
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`OldPhoneStore running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${path.resolve(DB_PATH)}`);
});
