// server.js — Samurai Selfie Server
// ========================================================
//  Node + Express server to manage:
//  - Start selfie session
//  - Deliver selfie URL (token-based)
//  - Receive Liveness result
//  - Poll status from origin page
// ========================================================

import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const PORT = process.env.PORT || 3000;

// ========================================================
// TOKEN STORAGE (In-Memory)
// ========================================================
/*
  Schema:
  tokens = {
    token123: {
      createdAt: 123456,
      status: 'pending' | 'done',
      meta: {
        user_id,
        transaction_id,
        appointment_data,
        liveness_data,
        return_url,
        request_verification_token
      },
      livenessResult: {
        livenessId,
        finishedAt
      }
    }
  }
*/
const tokens = new Map();

// تنظيف التوكنات القديمة كل 30 دقيقة
setInterval(() => {
  const now = Date.now();
  for (const [tk, entry] of tokens.entries()) {
    if (now - entry.createdAt > 60 * 60 * 1000) {
      tokens.delete(tk);
    }
  }
  console.log("[CLEAN UP] Old tokens removed.");
}, 30 * 60 * 1000);

// ========================================================
// Endpoints
// ========================================================

// 1) START — الصفحة الأصلية ترسل (appointment, liveness, token…)
app.post("/api/samurai/start", (req, res) => {
  const {
    appointment_data,
    liveness_data,
    return_url,
    request_verification_token,
    user_id,
    transaction_id
  } = req.body || {};

  if (!appointment_data || !liveness_data || !request_verification_token) {
    return res.status(400).json({
      ok: false,
      error: "missing_required_fields"
    });
  }

  // إنشاء TOKEN
  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();

  tokens.set(token, {
    createdAt: now,
    status: "pending",
    meta: {
      appointment_data,
      liveness_data,
      return_url,
      request_verification_token,
      user_id: user_id || null,
      transaction_id: transaction_id || null
    },
    livenessResult: null
  });

  // رابط السيلفي الذي سيستعمله CLIENT
  const selfieUrl = `${req.protocol}://${req.get("host")}/samurai-selfie?c=${encodeURIComponent(
    token
  )}`;

  return res.json({
    ok: true,
    token,
    selfie_url: selfieUrl
  });
});

// 2) SELFIE PAGE — الإضافة الثانية تستعمل /samurai-selfie?c=TOKEN
// =========================================================
// هذه ترجع صفحة HTML فيها AUTOSUBMIT لطلب livenessrequest على موقعك
// =========================================================
app.get("/samurai-selfie", (req, res) => {
  const token = req.query.c;
  const entry = tokens.get(token);

  if (!entry) {
    return res.status(404).send("Invalid Samurai Token.");
  }

  const meta = entry.meta;

  // صفحة HTML فيها فورم يتم إرساله تلقائياً للـ livenessrequest في موقعك
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Samurai Liveness</title>
</head>
<body>
<p>Samurai: Processing Liveness...</p>

<form id="samuraiForm" method="POST" action="https://YOUR-SITE.com/MAR/appointment/livenessrequest">
  <input type="hidden" name="AppointmentData" value="${escapeHtml(meta.appointment_data)}">
  <input type="hidden" name="LivenessData" value="${escapeHtml(meta.liveness_data)}">
  <input type="hidden" name="ReturnUrl" value="${escapeHtml(meta.return_url)}">
  <input type="hidden" name="__RequestVerificationToken" value="${escapeHtml(meta.request_verification_token)}">
</form>

<script>
  document.getElementById("samuraiForm").submit();
</script>

</body>
</html>
  `;

  res.send(html);
});

// وظيفة بسيطة للهروب من HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 3) FINISH — CLIENT كيصيفط النتيجة النهائية (LivenessId)
app.post("/api/samurai/finish", (req, res) => {
  const { token, livenessId } = req.body || {};

  const entry = tokens.get(token);
  if (!entry) {
    return res.status(404).json({ ok: false, error: "token_not_found" });
  }

  entry.status = "done";
  entry.livenessResult = {
    livenessId,
    finishedAt: Date.now()
  };

  return res.json({ ok: true });
});

// 4) STATUS — الصفحة الأصلية كتسول على النتيجة
app.get("/api/samurai/status/:token", (req, res) => {
  const tk = req.params.token;
  const entry = tokens.get(tk);

  if (!entry) {
    return res.status(404).json({ ok: false, error: "token_not_found" });
  }

  return res.json({
    ok: true,
    status: entry.status,
    meta: entry.meta,
    livenessResult: entry.livenessResult
  });
});

// ========================================================
app.listen(PORT, () => {
  console.log(`🟢 Samurai Liveness Server running on PORT ${PORT}`);
});
