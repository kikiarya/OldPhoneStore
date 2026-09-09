const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const {
  signToken,
  storeSession,
  revokeSession,
  publicUser,
  authRequired
} = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, name required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(String(password), 10);
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'user')`
    )
    .run(String(email).toLowerCase(), password_hash, String(name).trim());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  await storeSession(token, user);

  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  await storeSession(token, user);
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', authRequired, async (req, res) => {
  await revokeSession(req.user.id, req.token);
  res.json({ message: 'Logged out' });
});

router.get('/me', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = router;
