require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, closeDb, DB_PATH } = require('./db');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed-phones.json');

const DEMO_USERS = [
  {
    email: 'admin@oldphonestore.demo',
    password: 'admin123',
    name: 'Store Admin',
    role: 'admin'
  },
  {
    email: 'buyer@oldphonestore.demo',
    password: 'buyer123',
    name: 'Demo Buyer',
    role: 'user'
  }
];

function seedUsers(db, { force = false } = {}) {
  const insert = db.prepare(
    `INSERT INTO users (email, password_hash, name, role) VALUES (@email, @password_hash, @name, @role)`
  );
  const find = db.prepare('SELECT id FROM users WHERE email = ?');

  for (const u of DEMO_USERS) {
    const existing = find.get(u.email);
    if (existing && !force) continue;
    if (existing && force) {
      db.prepare('DELETE FROM users WHERE email = ?').run(u.email);
    }
    const password_hash = bcrypt.hashSync(u.password, 10);
    insert.run({
      email: u.email,
      password_hash,
      name: u.name,
      role: u.role
    });
  }
}

function seedFlashDeals(db, { force = false } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM flash_deals').get().c;
  if (count > 0 && !force) return;

  if (force) db.exec('DELETE FROM flash_deals;');

  const phone = db.prepare('SELECT id, price FROM phones ORDER BY price DESC LIMIT 1').get();
  const start = new Date(Date.now() - 60 * 1000).toISOString();
  const end = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  db.prepare(
    `INSERT INTO flash_deals (
       title, subtitle, phone_id, stock, sold, price, original_price, start_at, end_at, active
     ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1)`
  ).run(
    'Midnight Flash — Flagship Drop',
    'Redis Lua 原子扣库存 · 一人一单 · Stream 异步落单',
    phone?.id || null,
    50,
    Math.max(99, Math.round((phone?.price || 499) * 0.55)),
    phone?.price || 749,
    start,
    end
  );

  db.prepare(
    `INSERT INTO flash_deals (
       title, subtitle, phone_id, stock, sold, price, original_price, start_at, end_at, active
     ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1)`
  ).run(
    'Student Deal — Daily Driver',
    '限量库存演示高并发扣减',
    db.prepare('SELECT id, price FROM phones ORDER BY price ASC LIMIT 1').get()?.id || null,
    100,
    149,
    299,
    start,
    end
  );
}

function seed({ force = false } = {}) {
  const phones = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM phones').get().c;

  if (count > 0 && !force) {
    seedUsers(db);
    seedFlashDeals(db);
    console.log(`Database already has ${count} phones (${DB_PATH}). Skipping phone seed.`);
    console.log('Run `npm run db:reset` to wipe and re-seed.');
    return count;
  }

  if (force) {
    db.exec(`
      DELETE FROM chat_messages;
      DELETE FROM chat_sessions;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM flash_deals;
      DELETE FROM phones;
      DELETE FROM users;
      DELETE FROM sqlite_sequence WHERE name IN (
        'phones', 'orders', 'order_items', 'users', 'flash_deals', 'chat_messages'
      );
    `);
  }

  const insert = db.prepare(`
    INSERT INTO phones (
      brand, model, storage, color, condition, battery_health,
      year, price, rating, available, category, imei_masked, description, img
    ) VALUES (
      @brand, @model, @storage, @color, @condition, @battery_health,
      @year, @price, @rating, @available, @category, @imei_masked, @description, @img
    )
  `);

  const tx = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });

  tx(phones);
  seedUsers(db, { force: true });
  seedFlashDeals(db, { force: true });
  console.log(`Seeded ${phones.length} phones + demo users + flash deals into ${DB_PATH}`);
  return phones.length;
}

if (require.main === module) {
  try {
    seed({ force: process.argv.includes('--force') });
  } finally {
    closeDb();
  }
}

module.exports = { seed, DEMO_USERS };
