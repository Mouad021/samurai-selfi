// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// من الأفضل تضبطها فـ Render:
// SAMURAI_SELFIE_BASE_URL = https://samurai-selfi.onrender.com
const SELFIE_BASE_URL =
  process.env.SAMURAI_SELFIE_BASE_URL || 'https://samurai-selfi.onrender.com';

const API_KEY = process.env.SAMURAI_API_KEY || ''; // اختيارية، خليه فارغ إلا ما بغيتش حماية بسيطة

app.use(cors());
app.use(express.json());

// تخزين التوكنات فـ الذاكرة (للتجارب)
// للإنتاج استعمل DB حقيقي (Redis / Postgres...)
const tokens = new Map();

/**
 * POST /api/samurai/selfie-link
 * body: { user_id, transaction_id }
 * يرجع: { ok, selfie_url }
 */
app.post('/api/samurai/selfie-link', (req, res) => {
  // حماية بسيطة بمفتاح API اختياري
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

  // توكن عشوائي
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 دقيقة صلاحية

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
 * GET /samurai-selfie?c=TOKEN
 * صفحة واجهة السيلفي (كاميرا + Capture)
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

  const { user_id, transaction_id } = entry;

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Samurai Selfie</title>
  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #050816;
      color: #f5f5f5;
      margin: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100vh;
    }
    .card {
      background: rgba(15,23,42,0.95);
      border-radius: 14px;
      padding: 20px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 18px 45px rgba(0,0,0,0.45);
      border: 1px solid rgba(148,163,184,0.35);
    }
    h1 {
      font-size: 20px;
      margin-bottom: 6px;
    }
    .meta {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 14px;
      word-break: break-all;
    }
    video, canvas {
      width: 100%;
      max-height: 320px;
      border-radius: 10px;
      background: #000;
    }
    .btn-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    button {
      flex: 1;
      padding: 8px 10px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    #btnStart {
      background: linear-gradient(135deg,#22c55e,#4ade80);
      color: #022c22;
    }
    #btnCapture {
      background: #0f172a;
      color: #e5e7eb;
      border: 1px solid #4b5563;
    }
    #status {
      margin-top: 10px;
      font-size: 12px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Samurai Selfie</h1>
    <div class="meta">
      user: <code>${user_id}</code><br/>
      tx: <code>${transaction_id}</code>
    </div>

    <video id="video" autoplay playsinline></video>
    <canvas id="canvas" style="display:none;"></canvas>

    <div class="btn-row">
      <button id="btnStart">Allow camera</button>
      <button id="btnCapture">Capture</button>
    </div>

    <div id="status">اضغط على "Allow camera" للسماح بالوصول للكاميرا.</div>
  </div>

  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const btnStart = document.getElementById('btnStart');
    const btnCapture = document.getElementById('btnCapture');
    const statusEl = document.getElementById('status');

    let stream = null;

    btnStart.onclick = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        statusEl.textContent = 'الكاميرا شغّالة، تأكد من وجهك في الإطار ثم اضغط Capture.';
      } catch (e) {
        console.error(e);
        statusEl.textContent = 'فشل الوصول للكاميرا: ' + e.name;
      }
    };

    btnCapture.onclick = () => {
      if (!stream) {
        statusEl.textContent = 'شغّل الكاميرا أولاً.';
        return;
      }
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const w = settings.width || 640;
      const h = settings.height || 480;

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      console.log('[SAMURAI] captured selfie length:', dataUrl.length);

      statusEl.textContent = 'تم التقاط صورة سيلفي (حالياً غير مرسلة للسيرفر).';
      // مستقبلاً يمكنك إرسال dataUrl لـ /api/samurai/upload-selfie
    };
  </script>
</body>
</html>`);
});

// مسار بسيط للفحص
app.get('/', (req, res) => {
  res.send('Samurai Liveness server is running.');
});

app.listen(PORT, () => {
  console.log(`[SAMURAI][SERVER] Listening on port ${PORT}`);
});
