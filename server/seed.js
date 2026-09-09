require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getDb, closeDb, DB_PATH } = require('./db');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed-phones.json');

function seed({ force = false } = {}) {
  const phones = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM phones').get().c;

  if (count > 0 && !force) {
    console.log(`Database already has ${count} phones (${DB_PATH}). Skipping seed.`);
    console.log('Run `npm run db:reset` to wipe and re-seed.');
    return count;
  }

  if (force) {
    db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM phones;');
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
  console.log(`Seeded ${phones.length} phones into ${DB_PATH}`);
  return phones.length;
}

if (require.main === module) {
  try {
    seed({ force: process.argv.includes('--force') });
  } finally {
    closeDb();
  }
}

module.exports = { seed };
