// ==============================
// SAMURAI SELFIE SERVER  (V2)
// ==============================

const express = require('express');
const cors = require('cors');
// crypto ما محتاجينوش دابا، نخليه إلا بغيتي توقعات أخرى مستقبلاً
// const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// الدومين اللي غادي تستعملو ف رابط /selfie
const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || 'https://samurai-selfi.onrender.com';

// رابط SDK ديال Oz (مابقيناش نستعملوه هنا ف HTML، غير ف /v/up لو بغيتي)
const OZ_SDK_URL =
  process.env.OZ_SDK_URL ||
  'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';

// رابط POST النهائي ديال livenessrequest فموقعك الأصلي
const LIVENESS_URL =
  process.env.LIVENESS_URL ||
  'https://www.blsspainmorocco.net/MAR/appointment/livenessrequest';

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
//
// الإضافة ديال صفحة Appointment كترسل:
// {
//   role: "appointment",
//   url: "https://...",
//   clientId: "xxxx",
//   ts: 123456789,
//   meta: { userId, transactionId, awsWafToken, visitorId, ... }
// }
//
// وحنا نرجعو ليها:
// {
//   success: true,
//   i: "<ip>",
//   p: "<base64 payload>",   // هادي هي c
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
      s: OZ_SDK_URL,     // SDK link (للاستعمال من طرف الإضافة إذا بغيتي)
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
// ==============================
//
// هاد الصفحة دابا **ما كتحمّـل حتى SDK**.
// غير كتخزن c و payload ف window.*
// باش الإضافة ديال الكلاينت/الكروم هي اللي تتحكم ف:
//  - طلب favicon
//  - تحميل plugin_liveness.php
//  - نداء OzLiveness.open
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

      window.SAMURAI_C = cParam;  // نخليها متاحة للإضافة

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

      // ملاحظة مهمة:
      // هنا ما كاين حتى تحميل ديال plugin_liveness.php.
      // الإضافة ديال الكلاينت (Chrome extension) هي اللي غادي:
      //  1) تطلب favicon من BLS بالطريقة اللي بغيتي
      //  2) من بعد تحمل SDK
      //  3) من بعد تنادي OzLiveness.open باستعمال userId/transactionId المخزنين هنا.
    })();
  </script>
</body>
</html>`;

  res.send(html);
});

// ==============================
// Start server
// ==============================
app.listen(PORT, () => {
  console.log('SAMURAI selfie server running on port', PORT);
});
