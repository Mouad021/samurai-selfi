// server.js
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// اسم الدومين ديالك (استعمله فـ SELFIE_URL)
const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || 'https://samurai-selfi.onrender.com';

app.use(cors());
app.use(express.json());

// تخزين بسيط فالميموري (اختياري)
const tickets = new Map();

function makeId(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

// =====================================
// 1) API: الإضافة ترسل ليه البيانات
// =====================================
// الإضافة ترسل:
//  {
//    userId: "...",
//    transactionId: "...",
//    awsWafToken: "...",   (اختياري)
//    visitorId: "...",     (اختياري)
//    pageUrl: "..."
//  }
//
// السيرفر يرجع:
//  {
//    success: true,
//    selfieUrl: "https://samurai-selfi.onrender.com/selfie?c=...",
//    u, t, i, v, p  (زيادة على ستايل Cameleon)
//  }
app.post('/api/selfie-link', (req, res) => {
  try {
    const { userId, transactionId, awsWafToken, visitorId, pageUrl } =
      req.body || {};

    if (!userId || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or transactionId'
      });
    }

    const payload = {
      userId,
      transactionId,
      awsWafToken: awsWafToken || null,
      visitorId: visitorId || null,
      pageUrl: pageUrl || null,
      createdAt: Date.now()
    };

    // JSON → base64 = c / p / Fp
    const json = JSON.stringify(payload);
    const fp = Buffer.from(json, 'utf8').toString('base64');

    const ticket = makeId(16);
    const token2 = makeId(16);
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '';

    tickets.set(ticket, { ticket, fp, payload, clientIp });

    const selfieUrl = `${SELFIE_DOMAIN}/selfie?c=${encodeURIComponent(fp)}`;

    return res.json({
      success: true,
      u: ticket,
      t: token2,
      i: clientIp,
      v: selfieUrl,
      p: fp,
      selfieUrl
    });
  } catch (e) {
    console.error('[/api/selfie-link] error', e);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// =====================================
// 2) صفحة DEBUG اختيارية لفك c (for testing)
// =====================================
app.get('/api/selfie/decode', (req, res) => {
  const { c } = req.query;
  if (!c) {
    return res.status(400).json({ success: false, error: 'Missing c' });
  }
  try {
    const json = Buffer.from(c, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return res.json({ success: true, payload });
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Bad c/base64' });
  }
});

// =====================================
// 3) صفحة /selfie: تفتح OzLiveness وتحقن user/transaction
// =====================================
app.get('/selfie', (req, res) => {
  const { c } = req.query;
  if (!c) {
    return res
      .status(400)
      .send('Missing c parameter (base64 encoded JSON payload).');
  }

  // نخلي فك base64 للـ Front حتى يكون سهل التعديل
  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SAMURAI Selfie</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #222 0, #000 50%, #000 100%);
        color: #f5f5f5;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        background: rgba(10,10,12,0.95);
        border-radius: 16px;
        padding: 20px 24px;
        box-shadow: 0 18px 40px rgba(0,0,0,0.6);
        max-width: 420px;
        width: 100%;
        border: 1px solid rgba(0,255,180,0.2);
      }
      .title {
        font-size: 18px;
        margin-bottom: 6px;
      }
      .sub {
        font-size: 13px;
        opacity: 0.7;
        margin-bottom: 16px;
      }
      pre {
        background:#050505;
        padding:10px;
        border-radius:8px;
        font-size:12px;
        max-height:150px;
        overflow:auto;
      }
      #status {
        font-size: 13px;
        margin-top: 10px;
      }
      #startBtn {
        margin-top: 12px;
        width: 100%;
        padding: 8px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        background: #00ffb4;
        color: #000;
      }
    </style>
    <!-- ⚠️ هنا خصك تضيف سكريبت OzLiveness ديالهم -->
    <!-- مثال (غير كمثال، استبدلو باللينك الرسمي لي معطياك Oz): -->
    <!-- <script src="https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.js"></script> -->
  </head>
  <body>
    <div class="card">
      <div class="title">SAMURAI Selfie</div>
      <div class="sub">سيتم فتح OzLiveness باستعمال user_id و transaction_id لي جاؤ من المتصفح الأول.</div>
      <pre id="payloadBox">(decoding...)</pre>
      <button id="startBtn">Start Liveness</button>
      <div id="status"></div>
    </div>

    <script>
      (function () {
        const c = ${JSON.stringify(c)};
        const payloadBox = document.getElementById('payloadBox');
        const statusEl = document.getElementById('status');
        const startBtn = document.getElementById('startBtn');

        let payload = null;

        function decodePayload() {
          try {
            const json = atob(c);
            payload = JSON.parse(json);
            payloadBox.textContent = JSON.stringify(payload, null, 2);
          } catch (e) {
            payloadBox.textContent = 'Decode error: ' + e;
          }
        }

        function startLiveness() {
          if (!payload) {
            statusEl.textContent = '❌ Payload not ready';
            return;
          }
          if (!window.OzLiveness || !OzLiveness.open) {
            statusEl.textContent = '❌ OzLiveness SDK not loaded (check script src).';
            return;
          }

          const userId = payload.userId || payload.user_id;
          const transactionId = payload.transactionId || payload.transaction_id;

          statusEl.textContent = '⏳ Opening OzLiveness...';

          // نفس الكونفيگ لي وريتي انت
          window.OzLiveness.open({
            lang: 'en',
            meta: {
              user_id: userId,
              transaction_id: transactionId
            },
            overlay_options: false,
            action: [
              'video_selfie_blank'
            ],
            result_mode: 'safe',
            on_complete: function (result) {
              console.log('OzLiveness result:', result);
              statusEl.textContent = '✅ Liveness completed. event_session_id=' + result.event_session_id;

              // هنا تقدر تبعث النتيجة لسيرفرك لو بغيت:
              // fetch('/api/selfie/result', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ c, result }) });
            }
          });
        }

        decodePayload();
        startBtn.addEventListener('click', startLiveness);
      })();
    </script>
  </body>
</html>
  `;

  res.send(html);
});

// =====================================
app.listen(PORT, () => {
  console.log('SAMURAI selfie server listening on port', PORT);
});
