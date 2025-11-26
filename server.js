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
app.get('/selfie', (req, res) => {
  const c = req.query.c || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SAMURAI Selfie</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #081a3a 0, #020410 55%, #000 100%);
      color: #f4fbff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: rgba(3, 10, 30, 0.96);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: 0 18px 45px rgba(0,0,0,0.65);
      border: 1px solid rgba(0, 200, 255, 0.3);
      max-width: 420px;
      width: 100%;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .sub {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 12px;
    }
    .status {
      font-size: 12px;
      margin-top: 10px;
      opacity: 0.9;
    }
    button {
      margin-top: 6px;
      width: 100%;
      padding: 8px 10px;
      border-radius: 999px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      background: linear-gradient(90deg,#00f2ff,#00ff7c);
      color: #001018;
    }
    code {
      font-size: 11px;
      background: rgba(0,0,0,0.4);
      padding: 2px 4px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">SAMURAI Selfie</div>
    <div class="sub">
      رابط تم إنشاؤه من صفحة الموعد.<br/>
      سيتم فتح السيلفي لهذا الموعد على هذا الجهاز.
    </div>
    <div id="info" class="sub" style="font-size:11px;"></div>
    <button id="btnStart">🚀 Start Selfie</button>
    <div id="status" class="status">Loading...</div>
  </div>

  <script>
    (function () {
      const statusEl = document.getElementById('status');
      const infoEl = document.getElementById('info');
      const btn = document.getElementById('btnStart');

      const cParam = ${JSON.stringify(c)};
      if (!cParam) {
        statusEl.textContent = "❌ Missing c in URL";
        statusEl.style.color = "#ff4444";
        return;
      }

      let payload = null;

      function safeLog() {
        try { console.log.apply(console, arguments); } catch (e) {}
      }

      function decodePayload() {
        try {
          const json = atob(cParam);
          payload = JSON.parse(json);
          safeLog('[SELFIE] payload:', payload);

          var userId = payload.userId || payload.UserId || payload.u;
          var transactionId = payload.transactionId || payload.TransactionId || payload.t;

          infoEl.innerHTML =
            "user_id: <code>" + (userId || "?") + "</code><br/>" +
            "transaction_id: <code>" + (transactionId || "?") + "</code>";

          statusEl.textContent = "Ready. Click Start.";
        } catch (e) {
          statusEl.textContent = "❌ Invalid c payload";
          statusEl.style.color = "#ff4444";
          safeLog('[SELFIE] decode error', e);
        }
      }

      function loadSdk(cb) {
        var script = document.createElement('script');
        script.src = ${JSON.stringify(OZ_SDK_URL)};
        script.async = true;
        script.onload = function () {
          safeLog('[SELFIE] SDK loaded');
          cb();
        };
        script.onerror = function (e) {
          statusEl.textContent = "❌ SDK load error";
          statusEl.style.color = "#ff4444";
          safeLog('[SELFIE] SDK error', e);
        };
        document.documentElement.appendChild(script);
      }

      function startLiveness() {
        if (!payload) {
          statusEl.textContent = "❌ No payload";
          return;
        }
        var userId = payload.userId || payload.UserId || payload.u;
        var transactionId = payload.transactionId || payload.TransactionId || payload.t;

        if (!userId || !transactionId) {
          statusEl.textContent = "❌ Missing user_id / transaction_id";
          statusEl.style.color = "#ff4444";
          return;
        }

        if (typeof window.OzLiveness !== "object") {
          statusEl.textContent = "❌ OzLiveness not found";
          statusEl.style.color = "#ff4444";
          return;
        }

        statusEl.textContent = "Starting liveness...";
        statusEl.style.color = "#c8f3ff";

        window.OzLiveness.open({
          lang: "en",
          meta: {
            user_id: userId,
            transaction_id: transactionId
          },
          overlay_options: false,
          action: ["video_selfie_blank"],
          events: {
            on_ready: function () {
              safeLog("[SELFIE] on_ready");
            },
            on_capture: function () {
              safeLog("[SELFIE] on_capture");
            },
            on_complete: function (result) {
              safeLog("[SELFIE] on_complete", result);
              statusEl.textContent = "✅ Selfie complete. Server will continue flow.";
            },
            on_error: function (err) {
              safeLog("[SELFIE] on_error", err);
              statusEl.textContent = "❌ Error: " + (err && err.message || err);
              statusEl.style.color = "#ff4444";
            }
          }
        });
      }

      btn.addEventListener('click', function () {
        if (typeof window.OzLiveness === "object") {
          startLiveness();
        } else {
          statusEl.textContent = "Loading SDK...";
          loadSdk(startLiveness);
        }
      });

      decodePayload();
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
