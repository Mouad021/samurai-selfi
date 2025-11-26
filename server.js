// ==============================
// SAMURAI SELFIE SERVER  (V3 + favicon proxy)
// ==============================

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// الدومين اللي غادي تستعملو ف رابط /selfie
const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || 'https://samurai-selfi.onrender.com';

// رابط SDK ديال Oz (مفيد غير كـ info / لو بغيت تستعمله من الإضافة)
const OZ_SDK_URL =
  process.env.OZ_SDK_URL ||
  'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';

// رابط POST النهائي ديال livenessrequest فموقعك الأصلي
const LIVENESS_URL =
  process.env.LIVENESS_URL ||
  'https://www.blsspainmorocco.net/MAR/appointment/livenessrequest';

// رابط الفافيكُن الأصلي ديال BLS
const BLS_FAVICON_URL =
  'https://www.blsspainmorocco.net/assets/images/favicon.png';

app.use(express.json());

// ==============================
// CORS + preflight
// ==============================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper باش نجيب IP
function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    ''
  );
}

// ==============================
// 1) POST /v/up  —  نفس ستايل Cameleon
// ==============================
app.post('/v/up', (req, res) => {
  try {
    const { role, url, clientId, ts, meta = {} } = req.body || {};

    const userId =
      meta.userId ||
      meta.UserId ||
      meta.u ||
      null;

    const transactionId =
      meta.transactionId ||
      meta.TransactionId ||
      meta.t ||
      null;

    const awsWafToken =
      meta.awsWafToken || meta.aws || null;

    const visitorId =
      meta.visitorId || meta.visitor || null;

    const pageUrl = url || null;

    // payload لي غادي ينشفر ويتخزن ف ?c=
    const payload = {
      userId,
      transactionId,
      awsWafToken,
      visitorId,
      pageUrl,
      createdAt: Date.now()
    };

    const json = JSON.stringify(payload);
    const c = Buffer.from(json, 'utf8').toString('base64');

    const ip = getIp(req);

    const response = {
      success: true,
      i: ip,             // ip
      p: c,              // payload base64 (هاد هو c ف /selfie?c=...)
      s: OZ_SDK_URL,     // SDK link (لو حبيتي تستعمله من الكلاينت)
      t: transactionId,  // transaction_id
      u: userId,         // user_id
      v: LIVENESS_URL    // رابط livenessrequest
    };

    console.log('[v/up]', {
      role,
      clientId,
      pageUrl,
      ip,
      userId,
      transactionId
    });

    return res.json(response);
  } catch (e) {
    console.error('[v/up] error:', e);
    return res.status(500).json({
      success: false,
      error: e.message || 'internal error'
    });
  }
});

// ==============================
// 2) GET /selfie  — صفحة السيلفي البسيطة
//    بلا SDK، غير كتجهز payload للإضافة
// ==============================
app.get('/selfie', (req, res) => {
  const c = req.query.c || '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SAMURAI Selfie</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #000;
      color: #fff;
    }
    #debug {
      position: fixed;
      top: 8px;
      left: 8px;
      font-size: 11px;
      background: rgba(0,0,0,0.6);
      padding: 4px 6px;
      border-radius: 4px;
      z-index: 999999;
    }
  </style>
</head>
<body>
  <div id="debug">SAMURAI SELFIE: waiting extension…</div>

  <script>
    (function () {
      var debugEl = document.getElementById('debug');
      function dbg(msg) {
        try { console.log('[SELFIE]', msg); } catch (e) {}
        if (debugEl) debugEl.textContent = 'SAMURAI: ' + msg;
      }

      var cParam = ${JSON.stringify(c)};
      if (!cParam) {
        dbg('❌ missing c param');
        window.SAMURAI_C = null;
        return;
      }

      window.SAMURAI_C = cParam;  // متاحة للإضافة

      var payload = null;
      try {
        var json = atob(cParam);
        payload = JSON.parse(json);
        dbg('payload decoded');
      } catch (e) {
        dbg('❌ invalid c (base64/json)');
        window.SAMURAI_PAYLOAD_ERROR = true;
        return;
      }

      window.SAMURAI_PAYLOAD = payload;

      var userId = payload.userId || payload.UserId || payload.u || null;
      var transactionId = payload.transactionId || payload.TransactionId || payload.t || null;

      window.SAMURAI_USER_ID = userId;
      window.SAMURAI_TRANSACTION_ID = transactionId;

      if (!userId || !transactionId) {
        dbg('⚠ payload ok لكن مافيهش userId/transactionId');
      } else {
        dbg('READY: userId=' + userId + ' | tx=' + transactionId + ' — extension can start now');
      }
    })();
  </script>
</body>
</html>`;

  res.send(html);
});

// ==============================
// 3) GET /bls-favicon  — بروكسي للفافيكُن
// ==============================
//
// المتصفح يطلب:
//   https://samurai-selfi.onrender.com/bls-favicon
//
// السيرفر كيدير GET حقيقي لـ BLS
//   → ياخد الصورة كما هي (حتى لو جا status 202)
//   → ويرجعها للمتصفح بـ 200 OK و image/png
// ==============================
app.get('/bls-favicon', (req, res) => {
  console.log('[bls-favicon] proxy request');

  const options = {
    method: 'GET',
    headers: {
      // نحاولو نقلدو متصفح عادي
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept':
        'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  };

  https.get(BLS_FAVICON_URL, options, (upstream) => {
    const chunks = [];
    upstream.on('data', (chunk) => chunks.push(chunk));
    upstream.on('end', () => {
      const buf = Buffer.concat(chunks);

      // حتى لو BLS رجعت 202، حنا نرجعو 200 للبراوزر
      res.status(200);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', buf.length);
      res.send(buf);

      console.log(
        '[bls-favicon] upstream status=',
        upstream.statusCode,
        ' → sent 200 to client, bytes=',
        buf.length
      );
    });
  }).on('error', (err) => {
    console.error('[bls-favicon] error:', err);
    res.status(500).send('proxy error');
  });
});

// ==============================
// Start server
// ==============================
app.listen(PORT, () => {
  console.log('SAMURAI selfie server running on port', PORT);
});
