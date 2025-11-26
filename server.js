// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ==============================
//  إعدادات أساسية
// ==============================
const PORT = process.env.PORT || 3000;

// SDK link (s)
const OZ_SDK_URL =
  process.env.OZ_SDK_URL ||
  'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';

// رابط POST النهائي (v)
const LIVENESS_URL =
  process.env.LIVENESS_URL ||
  'https://www.blsspainmorocco.net/MAR/appointment/livenessrequest';

app.use(express.json());

// CORS + preflight بحال اللي شفت فـ Network تاع Cameleon
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // ولا حدد دومينات اللي عندك
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    // preflight
    return res.sendStatus(200);
  }
  next();
});

// ==============================
//  /v/up  —  نفس فكرة Cameleon
// ==============================
//
// الإضافة كترسل:
//
// {
//   role: "appointment",
//   url: "https://...",
//   clientId: "xxxx",
//   ts: 1730000000,
//   meta: {
//     userId,
//     transactionId,
//     appointmentData,
//     livenessData,
//     verificationToken,
//     returnUrl
//   }
// }
//
// ونحن نرجعو ليها:
//
// {
//   success: true,
//   i: "ip",
//   p: "<base64 payload>",
//   s: "<SDK URL>",
//   t: "<transaction_id>",
//   u: "<user_id>",
//   v: "<livenessrequest url>"
// }
// ==============================
app.post('/v/up', (req, res) => {
  try {
    const { role, url, clientId, ts, meta = {} } = req.body || {};

    // نضمنو وجود meta
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
    const appointmentData =
      meta.appointmentData ||
      meta.AppointmentData ||
      null;
    const livenessData =
      meta.livenessData ||
      meta.LivenessData ||
      null;
    const verificationToken =
      meta.verificationToken ||
      meta.__RequestVerificationToken ||
      null;
    const returnUrl =
      meta.returnUrl ||
      meta.ReturnUrl ||
      null;

    // payload اللي غادي نشفروه فـ p (تقدر تغيّرو كيف بغيتي)
    const payload = {
      userId,
      transactionId,
      appointmentData,
      livenessData,
      verificationToken,
      returnUrl,
      url,
      role,
      clientId,
      ts: ts || Date.now()
    };

    const json = JSON.stringify(payload);
    const p = Buffer.from(json, 'utf8').toString('base64');

    // ip ديال الكلاينت (تقريبية حسب البروكسي)
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';

    const response = {
      success: true,
      i: ip,
      p,                 // payload مشفّر
      s: OZ_SDK_URL,     // SDK link
      t: transactionId,  // transaction_id
      u: userId,         // user_id
      v: LIVENESS_URL    // رابط POST النهائي
    };

    console.log('[v/up] req from', ip, 'role=', role, 'url=', url);
    // ممكن تخزن clientId/meta فـ DB لو بغيت تتبع الجلسات

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
//  تشغيل السرفر
// ==============================
app.listen(PORT, () => {
  console.log('SAMURAI /v/up server listening on port', PORT);
});
