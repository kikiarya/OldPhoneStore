const express = require('express');
const { authOptional } = require('../middleware/auth');
const { chat, streamChat, FAQ } = require('../services/chatService');

const router = express.Router();

router.get('/faq', (_req, res) => {
  res.json({ count: FAQ.length, faq: FAQ });
});

router.post('/', authOptional, async (req, res) => {
  const { message, session_id, stream } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message required' });
  }

  try {
    if (stream) {
      return streamChat(res, {
        sessionId: session_id,
        userId: req.user?.id,
        message: String(message).trim()
      });
    }
    const result = await chat({
      sessionId: session_id,
      userId: req.user?.id,
      message: String(message).trim()
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

module.exports = router;
