const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'phones.db');

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function tableHasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrate(db) {
  if (!tableHasColumn(db, 'orders', 'user_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER');
  }
  if (!tableHasColumn(db, 'orders', 'order_no')) {
    db.exec('ALTER TABLE orders ADD COLUMN order_no TEXT');
  }
  if (!tableHasColumn(db, 'orders', 'idempotency_key')) {
    db.exec('ALTER TABLE orders ADD COLUMN idempotency_key TEXT');
  }
  if (!tableHasColumn(db, 'orders', 'updated_at')) {
    db.exec(`ALTER TABLE orders ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`);
  }
  if (!tableHasColumn(db, 'orders', 'source')) {
    db.exec(`ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'cart'`);
  }
  if (!tableHasColumn(db, 'orders', 'flash_deal_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN flash_deal_id INTEGER');
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency
      ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
  `);
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      storage TEXT NOT NULL,
      color TEXT NOT NULL,
      condition TEXT NOT NULL,
      battery_health INTEGER NOT NULL,
      year INTEGER NOT NULL,
      price REAL NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      available INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL,
      imei_masked TEXT,
      description TEXT,
      img TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_phones_category ON phones(category);
    CREATE INDEX IF NOT EXISTS idx_phones_brand ON phones(brand);
    CREATE INDEX IF NOT EXISTS idx_phones_available ON phones(available);
    CREATE INDEX IF NOT EXISTS idx_phones_price ON phones(price);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      customer_email TEXT,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      phone_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (phone_id) REFERENCES phones(id)
    );

    CREATE TABLE IF NOT EXISTS flash_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      phone_id INTEGER,
      stock INTEGER NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL,
      original_price REAL NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (phone_id) REFERENCES phones(id)
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
  `);

  migrate(db);
}

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  ensureDataDir();
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  createSchema(dbInstance);
  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** Order number for portfolio demos (Redis INCR when available) */
function nextOrderNo(_db) {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');
  return `OPS${now}${rand}`;
}

module.exports = { getDb, closeDb, DB_PATH, nextOrderNo };
