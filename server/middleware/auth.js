const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { getRedis, isRedisReady } = require('../redis');

const JWT_SECRET = process.env.JWT_SECRET || 'oldphonestore-dev-secret-change-me';
const TOKEN_TTL_SEC = Number(process.env.JWT_TTL_SEC) || 60 * 60 * 24 * 7;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SEC }
  );
}

async function storeSession(token, user) {
  if (!isRedisReady()) return;
  const redis = getRedis();
  const key = `session:${user.id}`;
  await redis.set(
    key,
    JSON.stringify({ id: user.id, email: user.email, role: user.role, name: user.name }),
    'EX',
    TOKEN_TTL_SEC
  );
  await redis.set(`token:${token.slice(-24)}`, String(user.id), 'EX', TOKEN_TTL_SEC);
}

async function revokeSession(userId, token) {
  if (!isRedisReady()) return;
  const redis = getRedis();
  await redis.del(`session:${userId}`);
  if (token) await redis.del(`token:${token.slice(-24)}`);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at
  };
}

function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name
    };
    req.token = token;
  } catch {
    req.user = null;
  }
  next();
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Login required' });
    }
    next();
  });
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

function loadUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

module.exports = {
  JWT_SECRET,
  TOKEN_TTL_SEC,
  signToken,
  storeSession,
  revokeSession,
  publicUser,
  authOptional,
  authRequired,
  adminRequired,
  loadUserById
};
