// ==============================
// SAMURAI SELFIE SERVER (BRIDGE)
// ==============================

import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

// الدومين ديال السيلفي (نفس اللي كتحطو فالإضافات)
const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || "https://samurai-selfi.onrender.com";

app.use(cors());
app.use(express.json());

function makeId(len = 16) {
  return crypto.randomBytes(len).toString("hex");
}

// ==============================
// 1) API — المتصفح الأول (Appointment)
// ==============================
//
// الإضافة الأولى كتبعث:
// { userId, transactionId, awsWafToken?, visitorId?, pageUrl? }
//
// و السيرفر كيرجع:
// {
//   success: true,
//   selfieUrl: "https://.../selfie?c=...",
//   p: base64Payload,
//   u: ticket,
//   t: token,
//   i: ip
// }
// ==============================
app.post("/api/selfie-link", (req, res) => {
  try {
    const { userId, transactionId, awsWafToken, visitorId, pageUrl } =
      req.body || {};

    if (!userId || !transactionId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId or transactionId",
      });
    }

    const payload = {
      userId,
      transactionId,
      awsWafToken: awsWafToken || null,
      visitorId: visitorId || null,
      pageUrl: pageUrl || null,
      createdAt: Date.now(),
    };

    // JSON → base64
    const json = JSON.stringify(payload);
    const fp = Buffer.from(json, "utf8").toString("base64");

    const ticket = makeId(12);
    const token = makeId(12);

    // الرابط اللي غادي يمشي به المتصفح الثاني
    const selfieUrl = `${SELFIE_DOMAIN}/selfie?c=${encodeURIComponent(fp)}`;

    return res.json({
      success: true,
      selfieUrl,
      p: fp,
      u: ticket,
      t: token,
      i: req.ip,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ==============================
// 2) SELFIE PAGE — المتصفح الثاني (جهاز السيلفي)
// ==============================
//
// هادي صفحة "Bridge" فقط:
// - كترجع HTML خفيف (200 OK) باش content_script ديال الإضافة الثانية يخدم.
// - الإضافة الثانية (selfie-bridge.js) هي اللي كتشوف c فـ URL,
//   كتفك JSON وتخزن payload → من بعد كتحول التاب إلى
//   https://www.blsspainmorocco.net/MAR/Appointment/Liveness
//
// مابقيناش كنستعمل OzLiveness هنا فالدومين ديالنا، كامل السيلفي الحقيقي
// غادي يتدار على دومين BLS فصفحة /MAR/Appointment/Liveness.
// ==============================
app.get("/selfie", (req, res) => {
  const c = (req.query.c || "").toString();

  // نعمل escape بسيط لـ c باش مايديرش أي injection فـ HTML
  const safeC = c
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SAMURAI Selfie Bridge</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>

  <style>
    :root {
      color-scheme: dark;
    }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #06101f, #02040a 55%, #000000);
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f4fbff;
    }
    .card {
      width: 480px;
      max-width: 95vw;
      background: rgba(3, 8, 18, 0.96);
      border-radius: 16px;
      border: 1px solid rgba(0, 255, 180, 0.4);
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.8),
        0 0 0 1px rgba(140, 255, 220, 0.2);
      padding: 22px 20px 18px;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #00ffb4;
      box-shadow: 0 0 10px #00ffb4;
    }
    .subtitle {
      font-size: 12px;
      opacity: 0.86;
      margin-bottom: 10px;
    }
    .badge {
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(0, 255, 180, 0.06);
      border: 1px solid rgba(0, 255, 180, 0.4);
      margin-bottom: 10px;
    }
    .code {
      font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 11px;
      background: #02060f;
      border-radius: 8px;
      padding: 8px 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      word-break: break-all;
      margin-bottom: 10px;
    }
    .hint {
      font-size: 11px;
      opacity: 0.7;
      margin-top: 2px;
    }
  </style>
</head>

<body>
  <div class="card">
    <div class="title">
      <div class="dot"></div>
      <span>SAMURAI Selfie Bridge</span>
    </div>
    <div class="subtitle">
      هذه الصفحة مجرد جسر بين المتصفح الأول (Appointment) والمتصفح الثاني (جهاز السيلفي).<br/>
      إضافة SAMURAI في هذا المتصفح ستقرأ القيمة <code>c</code> وتحوّلك تلقائياً إلى صفحة BLS Liveness.
    </div>

    <div class="badge">
      c-param من المتصفح الأول:
    </div>
    <div class="code">${safeC || "(لا يوجد c في الرابط)"}</div>

    <div class="hint">
      • إذا رأيت هذه الصفحة فقط، تأكد أن إضافة SAMURAI Selfie Client مفعلة على هذا المتصفح.<br/>
      • لا يوجد أي سيلفي هنا، السيلفي الحقيقي يتم على دومين BLS بعد التحويل.
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

// ==============================
// 3) تشغيل السيرفر
// ==============================
app.listen(PORT, () => {
  console.log("SAMURAI selfie server (bridge) running on port", PORT);
});
