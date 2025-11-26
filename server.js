// ==============================
// SAMURAI SELFIE SERVER
// ==============================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// الدومين اللي غادي تستعملو ف رابط /selfie
const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || 'https://samurai-selfi.onrender.com';

// رابط SDK ديال Oz
const OZ_SDK_URL =
  process.env.OZ_SDK_URL ||
  'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';

// رابط POST النهائي ديال livenessrequest فموقعك الأصلي
const LIVENESS_URL =
  process.env.LIVENESS_URL ||
  'https://www.blsspainmorocco.net/MAR/appointment/livenessrequest';

app.use(express.json());

// CORS + preflight
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
// 1) /v/up  —  نفس ستايل Cameleon
// ==============================
//
// الإضافة ديال الصفحة الأصلية (Appointment) كترسل:
// {
//   role: "appointment",
//   url: "https://...",
//   clientId: "xxxx",
//   ts: 123456789,
//   meta: { userId, transactionId, ... }
// }
//
// حنا نرجعو ليها:
// {
//   success: true,
//   i: "<ip>",
//   p: "<base64 payload>",
//   s: "<OZ SDK URL>",
//   t: "<transactionId>",
//   u: "<userId>",
//   v: "<livenessrequest url>"
// }
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

    // payload لي غادي يبقى ف c (فينشفروه base64)
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
      s: OZ_SDK_URL,     // SDK link
      t: transactionId,  // transaction_id
      u: userId,         // user_id
      v: LIVENESS_URL    // رابط livenessrequest
    };

    console.log('[v/up]', { role, clientId, pageUrl, ip, userId, transactionId });

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
// 2) GET /selfie  — صفحة السيلفي
// ==============================
//
// هاد الصفحة هي اللي كاتفتح ف متصفح العميل:
//   https://samurai-selfi.onrender.com/selfie?c=....
//
// الإضافة الأولى كتأخذ p من /v/up وكتدير link:
//   SELFIE_DOMAIN + '/selfie?c=' + encodeURIComponent(p)
//
// هنا كنفك c وكنطلق OzLiveness مباشرة.
// ==============================
// ==============================
// 2) GET /selfie  — صفحة السيلفي البسيطة
// ==============================
app.get('/selfie', (req, res) => {
  const c = req.query.c || '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SAMURAI Selfie</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0; font-family: system-ui, sans-serif; background:#000; color:#fff;">
  <div id="debug" style="position:fixed;top:8px;left:8px;font-size:11px;background:rgba(0,0,0,0.6);padding:4px 6px;border-radius:4px;z-index:999999;">
    SAMURAI SELFIE: loading...
  </div>

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
        return;
      }

      var payload = null;
      try {
        var json = atob(cParam);
        payload = JSON.parse(json);
        dbg('payload decoded');
      } catch (e) {
        dbg('❌ invalid c (base64/json)');
        return;
      }

      var userId = payload.userId || payload.UserId || payload.u;
      var transactionId = payload.transactionId || payload.TransactionId || payload.t;

      if (!userId || !transactionId) {
        dbg('❌ no userId / transactionId in payload');
        return;
      }

      dbg('userId=' + userId + ' | tx=' + transactionId + ' | loading SDK...');

      // حمّل plugin_liveness.php
      var s = document.createElement('script');
      s.src = 'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';
      s.async = true;
      s.onload = function () {
        dbg('SDK loaded, calling OzLiveness.open');

        if (typeof window.OzLiveness !== 'object') {
          dbg('❌ OzLiveness not found');
          return;
        }

        try {
          window.OzLiveness.open({
            lang: 'en',
            meta: {
              user_id: userId,
              transaction_id: transactionId
            }
            // ما نزيدو حتى option أخرى باش ما نخرّب والو
          });
          dbg('OzLiveness.open called');
        } catch (e) {
          dbg('❌ error in OzLiveness.open: ' + (e && e.message || e));
        }
      };
      s.onerror = function (e) {
        dbg('❌ SDK load error');
      };
      document.head.appendChild(s);
    })();
  </script>
</body>
</html>`;

  res.send(html);
});


// ==============================
app.listen(PORT, () => {
  console.log('SAMURAI selfie server running on port', PORT);
});
