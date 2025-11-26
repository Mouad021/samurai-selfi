// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// إعدادات من env
const SELFIE_BASE_URL =
  process.env.SAMURAI_SELFIE_BASE_URL || 'https://your-samurai-server.com'; // بدّلها من env
const API_KEY = process.env.SAMURAI_API_KEY || ''; // اختيارية

app.use(cors());
app.use(express.json());

// تخزين مؤقت في الذاكرة (للتجارب)
// في الإنتاج = استعمل DB (Redis / Postgres / ...)
const tokens = new Map();

/**
 * POST /api/samurai/selfie-link
 * body: { user_id, transaction_id }
 * يرجع: { selfie_url }
 */
app.post('/api/samurai/selfie-link', (req, res) => {
  // حماية بسيطة بمفتاح
  if (API_KEY) {
    const clientKey = req.headers['x-samurai-key'];
    if (!clientKey || clientKey !== API_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { user_id, transaction_id } = req.body || {};
  if (!user_id || !transaction_id) {
    return res.status(400).json({ error: 'missing_user_or_transaction' });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 دقيقة

  tokens.set(token, {
    user_id,
    transaction_id,
    createdAt: now,
    expiresAt
  });

  const selfieUrl = `${SELFIE_BASE_URL}/samurai-selfie?c=${encodeURIComponent(
    token
  )}`;

  console.log('[SAMURAI][SERVER] New selfie token:', {
    token,
    user_id,
    transaction_id
  });

  return res.json({
    ok: true,
    selfie_url: selfieUrl
  });
});

/**
 * مثال: صفحة بسيطة للسيلفي (GET /samurai-selfie?c=TOKEN)
 * هنا فقط نرجع JSON، انت تقدر تبدلها بصفحة HTML فيها الكاميرا واللوجيك ديالك.
 */
app.get('/samurai-selfie', (req, res) => {
  const token = req.query.c;
  if (!token || !tokens.has(token)) {
    return res.status(400).send('Invalid or expired Samurai token');
  }

  const entry = tokens.get(token);
  if (Date.now() > entry.expiresAt) {
    tokens.delete(token);
    return res.status(400).send('Samurai token expired');
  }

  // هنا تقدر ترجع HTML ديال واجهة السيلفي
  // دابا غير نرجع info باش تشوف أنها خدامة
  return res.json({
    ok: true,
    message: 'Samurai selfie endpoint – هنا دير واجهة الكاميرا ديالك',
    user_id: entry.user_id,
    transaction_id: entry.transaction_id
  });
});

app.get('/', (req, res) => {
  res.send('Samurai Liveness server is running.');
});

app.listen(PORT, () => {
  console.log(`[SAMURAI][SERVER] Listening on port ${PORT}`);
});
