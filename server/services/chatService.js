const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getDb } = require('../db');
const { getRedis, isRedisReady } = require('../redis');
const { resolveLlmConfig } = require('./llmConfig');

const FAQ = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'faq.json'), 'utf8')
);

function ensureSession(sessionId, userId) {
  const id = sessionId || randomUUID();
  const db = getDb();
  const existing = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id);
  if (!existing) {
    db.prepare(
      `INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)`
    ).run(id, userId || null);
  } else if (userId) {
    db.prepare(
      `UPDATE chat_sessions SET user_id = COALESCE(user_id, ?), updated_at = datetime('now') WHERE id = ?`
    ).run(userId, id);
  }
  return id;
}

function saveMessage(sessionId, role, content, meta = null) {
  getDb()
    .prepare(
      `INSERT INTO chat_messages (session_id, role, content, meta_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(sessionId, role, content, meta ? JSON.stringify(meta) : null);
  getDb()
    .prepare(`UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`)
    .run(sessionId);
}

async function pushMemory(sessionId, role, content) {
  if (!isRedisReady()) return;
  const key = `chat:mem:${sessionId}`;
  const redis = getRedis();
  await redis.rpush(key, JSON.stringify({ role, content, ts: Date.now() }));
  await redis.ltrim(key, -20, -1);
  await redis.expire(key, 60 * 60 * 24 * 7);
}

async function getMemory(sessionId) {
  if (!isRedisReady()) {
    return getDb()
      .prepare(
        `SELECT role, content FROM chat_messages
         WHERE session_id = ?
         ORDER BY id DESC LIMIT 10`
      )
      .all(sessionId)
      .reverse();
  }
  const raw = await getRedis().lrange(`chat:mem:${sessionId}`, 0, -1);
  return raw.map((s) => JSON.parse(s));
}

function retrieveFaq(query) {
  const q = String(query).toLowerCase();
  const scored = FAQ.map((item) => {
    let score = 0;
    for (const tag of item.tags) {
      if (q.includes(tag.toLowerCase())) score += 2;
    }
    if (item.question.toLowerCase().includes(q.slice(0, 24))) score += 1;
    return { item, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((x) => x.item);
}

/** Tool: search phones (mirrors AI agent tool-calling) */
function toolSearchPhones(query) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, brand, model, price, condition, available, storage
       FROM phones
       WHERE brand LIKE @q OR model LIKE @q OR description LIKE @q
       ORDER BY available DESC, price DESC
       LIMIT 5`
    )
    .all({ q: `%${query}%` });
  return rows;
}

function toolGetOrder(orderNoOrId, userId) {
  const db = getDb();
  let order = null;
  if (/^\d+$/.test(String(orderNoOrId))) {
    order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderNoOrId));
  } else {
    order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(String(orderNoOrId));
  }
  if (!order) return null;
  if (userId && order.user_id && order.user_id !== userId) {
    return { error: 'Order belongs to another account' };
  }
  const items = db
    .prepare(
      `SELECT oi.quantity, oi.unit_price, p.brand, p.model
       FROM order_items oi JOIN phones p ON p.id = oi.phone_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);
  return {
    order_no: order.order_no,
    status: order.status,
    total: order.total,
    source: order.source,
    created_at: order.created_at,
    items
  };
}

function toolListFlashDeals() {
  return getDb()
    .prepare(
      `SELECT id, title, price, stock, sold, end_at
       FROM flash_deals WHERE active = 1`
    )
    .all()
    .map((d) => ({ ...d, remaining: Math.max(0, d.stock - d.sold) }));
}

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/(order|订单|查单)/.test(t) && /(OPS|#|\d{2,})/.test(t)) return 'order_lookup';
  if (/(flash|seckill|秒杀|限时)/.test(t)) return 'flash';
  if (/(search|find|有没有|推荐|iphone|galaxy|pixel|xiaomi)/.test(t)) return 'search';
  if (/(warranty|shipping|return|退|保修|物流|成色|payment|支付)/.test(t)) return 'faq';
  return 'general';
}

async function callLlm(messages) {
  const cfg = resolveLlmConfig();
  if (!cfg.enabled) return null;

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      messages
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM(${cfg.label}) error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

function buildLocalReply(userText, toolsUsed) {
  const parts = [];
  parts.push(
    '我是 OldPhoneStore 智能客服（本地 RAG + Tool 模式；未配置 LLM_API_KEY / OPENAI_API_KEY 时走规则引擎）。'
  );

  if (toolsUsed.faq?.length) {
    parts.push('\n【知识库】');
    for (const f of toolsUsed.faq) {
      parts.push(`• ${f.question}\n  ${f.answer}`);
    }
  }
  if (toolsUsed.phones?.length) {
    parts.push('\n【商品检索】');
    for (const p of toolsUsed.phones) {
      parts.push(
        `• #${p.id} ${p.brand} ${p.model} ${p.storage} — $${p.price} (${p.condition}) ${p.available ? '有货' : '已售'}`
      );
    }
  }
  if (toolsUsed.order) {
    parts.push('\n【订单】');
    if (toolsUsed.order.error) {
      parts.push(toolsUsed.order.error);
    } else {
      parts.push(
        `单号 ${toolsUsed.order.order_no || '(pending)'} · 状态 ${toolsUsed.order.status} · 合计 $${toolsUsed.order.total}`
      );
    }
  }
  if (toolsUsed.flash?.length) {
    parts.push('\n【限时秒杀】');
    for (const d of toolsUsed.flash) {
      parts.push(`• #${d.id} ${d.title} $${d.price} · 剩余 ${d.remaining}`);
    }
  }
  if (parts.length === 1) {
    parts.push(
      `\n你可以问：保修政策、退货、成色说明，或说「推荐 iPhone」「查订单 OPS…」「有哪些秒杀」。\n你刚才说：${userText}`
    );
  }
  return parts.join('\n');
}

async function chat({ sessionId, userId, message }) {
  const sid = ensureSession(sessionId, userId);
  saveMessage(sid, 'user', message);
  await pushMemory(sid, 'user', message);

  const intent = detectIntent(message);
  const toolsUsed = {};

  // Always try FAQ retrieval when keywords match (multi-intent utterances)
  const faqHits = retrieveFaq(message);
  if (faqHits.length) toolsUsed.faq = faqHits;

  if (intent === 'search' || /phone|手机|机/.test(message.toLowerCase())) {
    const q = message.replace(/推荐|找|搜索|search|find/gi, '').trim() || message;
    toolsUsed.phones = toolSearchPhones(q.slice(0, 40));
  }
  if (intent === 'flash' || /flash|seckill|秒杀|限时/.test(message.toLowerCase())) {
    toolsUsed.flash = toolListFlashDeals();
  }
  if (intent === 'order_lookup') {
    const m = message.match(/OPS[A-Z0-9]+|\b\d{1,8}\b/i);
    if (m) toolsUsed.order = toolGetOrder(m[0], userId);
  }

  const memory = await getMemory(sid);
  let reply = null;
  let mode = 'local-rag';
  const llmCfg = resolveLlmConfig();

  try {
    const system = `You are OldPhoneStore customer support for a certified pre-owned phone shop.
Answer concisely in the user's language (Chinese or English).
Use the tool results and FAQ below; do not invent order IDs or stock.
Tool JSON: ${JSON.stringify(toolsUsed)}`;
    reply = await callLlm([
      { role: 'system', content: system },
      ...memory.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: message }
    ]);
    if (reply) mode = `llm:${llmCfg.provider}`;
  } catch (err) {
    console.warn('[chat] LLM fallback:', err.message);
  }

  if (!reply) reply = buildLocalReply(message, toolsUsed);

  saveMessage(sid, 'assistant', reply, {
    intent,
    mode,
    provider: llmCfg.enabled ? llmCfg.provider : null,
    tools: Object.keys(toolsUsed)
  });
  await pushMemory(sid, 'assistant', reply);

  return {
    session_id: sid,
    reply,
    intent,
    mode,
    llm: llmCfg.enabled
      ? { provider: llmCfg.provider, label: llmCfg.label, model: llmCfg.model }
      : null,
    tools_used: Object.keys(toolsUsed),
    citations: (toolsUsed.faq || []).map((f) => f.id)
  };
}

async function streamChat(res, payload) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const result = await chat(payload);
  const chunks = result.reply.match(/.{1,24}/gs) || [result.reply];
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
    await new Promise((r) => setTimeout(r, 18));
  }
  res.write(
    `data: ${JSON.stringify({
      type: 'done',
      session_id: result.session_id,
      intent: result.intent,
      mode: result.mode,
      tools_used: result.tools_used,
      citations: result.citations
    })}\n\n`
  );
  res.end();
}

module.exports = {
  chat,
  streamChat,
  retrieveFaq,
  FAQ,
  resolveLlmConfig
};
