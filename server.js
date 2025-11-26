// server.js
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// نسمحو للريكوستات من أي دومين (عدلها إذا بغيت)
app.use(cors());
app.use(express.json());

// تخزين بسيط فالميموري (يمكن تبدلو ب DB)
const tickets = new Map();

function makeId(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

// ================================
// 1) الإندبوينت لي كتتوصل مع الإضافة
// ================================
//
// الإضافة ترسل مثلاً JSON:
// {
//   "userId": "...",
//   "transactionId": "...",
//   "awsWafToken": "...",
//   "visitorId": "...",
//   "pageUrl": "..."
// }
//
// وهو يرجع بحال Cameleon:
// {
//   "success": true,
//   "u": "ticket-uuid",
//   "t": "token2-uuid",
//   "i": "client-ip",
//   "v": "https://YOURDOMAIN.com/selfie?c=...",
//   "p": "BASE64(JSON)",
//   "selfieUrl": "نفس v"
// }
//
app.post('/api/selfie-link', (req, res) => {
  try {
    const {
      userId,
      transactionId,
      awsWafToken,
      visitorId,
      pageUrl
    } = req.body || {};

    if (!userId || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or transactionId'
      });
    }

    // نحضرو payload لي بغينا نحتافضو بيه
    const payload = {
      userId,
      transactionId,
      awsWafToken: awsWafToken || null,
      visitorId: visitorId || null,
      pageUrl: pageUrl || null,
      createdAt: Date.now()
    };

    // نحولو JSON → base64 (Fp)
    const json = JSON.stringify(payload);
    const fp = Buffer.from(json, 'utf8').toString('base64'); // تقدر تستعمل base64url إلا بغيت

    // نولد ticket و token
    const ticket = makeId(16);
    const token2 = makeId(16);
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '';

    // نخزن كلشي فالميموري
    tickets.set(ticket, {
      ticket,
      fp,
      payload,
      clientIp
    });

    // رابط السيلفي لي غادي تفتحو فمتصفح آخر
    const SELF_DOMAIN = process.env.SELFIE_DOMAIN || 'https://samurai-selfi.onrender.com';
    const selfieUrl = `${SELF_DOMAIN}/selfie?c=${encodeURIComponent(fp)}`;

    // ستايل بحال Cameleon
    return res.json({
      success: true,
      u: ticket,        // بحال applicationId
      t: token2,        // token ثانوي
      i: clientIp,      // IP ديال المتصفح لي نادى الإندبوينت
      v: selfieUrl,     // نقدر نستعملو كما هو
      p: fp,            // base64 JSON
      selfieUrl         // نفس v للوضوح
    });
  } catch (e) {
    console.error('[/api/selfie-link] error', e);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// ================================
// 2) إندبوينت باش المتصفح الثاني يقرا data من c (اختياري debug)
// ================================
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

// ================================
// 3) صفحة بسيطة للسيلفي (يمكن تبدلها بصفحتك)
// ================================
app.get('/selfie', (req, res) => {
  const { c } = req.query;
  if (!c) {
    return res
      .status(400)
      .send('Missing c parameter (base64 encoded payload)');
  }

  // هنا فقط كنوري payload، انت فالحقيقي غادي تدير OzLiveness UI
  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MILANO Selfie</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      pre { background: #111; color:#0f0; padding:10px; border-radius:6px; }
    </style>
  </head>
  <body>
    <h2>MILANO Selfie – Debug Payload</h2>
    <p>c (base64):</p>
    <pre>${c}</pre>
    <p>Decoded JSON:</p>
    <pre id="payload"></pre>

    <script>
      try {
        const json = atob(${JSON.stringify(c)});
        const obj = JSON.parse(json);
        document.getElementById('payload').textContent =
          JSON.stringify(obj, null, 2);
      } catch(e) {
        document.getElementById('payload').textContent = 'Decode error: ' + e;
      }
    </script>
  </body>
</html>
  `;
  res.send(html);
});

// ================================
app.listen(PORT, () => {
  console.log('MILANO selfie server listening on port', PORT);
});
