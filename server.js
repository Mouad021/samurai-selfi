// ==============================
// SAMURAI SELFIE SERVER (FULL)
// ==============================

import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

const SELFIE_DOMAIN =
  process.env.SELFIE_DOMAIN || "https://samurai-selfi.onrender.com";

app.use(cors());
app.use(express.json());

function makeId(len = 16) {
  return crypto.randomBytes(len).toString("hex");
}

// ==============================
// 1) API — الإضافة تبعث البيانات
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
// 2) SELFIE PAGE
// ==============================
app.get("/selfie", (req, res) => {
  const c = req.query.c || "";

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SAMURAI Selfie</title>

  <!-- SDK الحقيقي لي عطيتيني -->
  <script src="https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php"></script>

  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI";
      background: #000;
      margin:0;
      padding:0;
      display:flex;
      justify-content:center;
      align-items:center;
      min-height:100vh;
      color:#fff;
    }
    .card {
      width:480px;
      background:#0b0b0c;
      padding:25px;
      border-radius:15px;
      border:1px solid #00ffa8;
      box-shadow:0 0 25px rgba(0,255,150,0.3);
    }
    pre {
      background:#050505;
      padding:10px;
      border-radius:8px;
      max-height:200px;
      overflow:auto;
      font-size:12px;
    }
    #startBtn {
      width:100%;
      padding:12px;
      background:#00ffb4;
      border:none;
      color:#000;
      border-radius:8px;
      margin-top:12px;
      font-weight:bold;
      cursor:pointer;
    }
    #status { margin-top:12px; font-size:14px; }
  </style>
</head>

<body>
  <div class="card">
    <h2>SAMURAI Selfie</h2>
    <p>البيانات التي جاؤت من المتصفح الأول:</p>

    <pre id="payloadBox">(decoding...)</pre>

    <button id="startBtn">Start Liveness</button>

    <div id="status"></div>
  </div>

<script>
(function () {

  const c = "${c}";
  const payloadBox = document.getElementById("payloadBox");
  const statusEl = document.getElementById("status");
  const startBtn = document.getElementById("startBtn");

  let payload = null;

  // فك base64 → JSON
  try {
    const json = atob(c);
    payload = JSON.parse(json);
    payloadBox.textContent = JSON.stringify(payload, null, 2);
  } catch (e) {
    payloadBox.textContent = "Error decoding c: " + e;
    return;
  }

  function waitOz(callback) {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      if (window.OzLiveness && typeof OzLiveness.open === "function") {
        clearInterval(timer);
        callback(true);
      }
      if (i > 50) {
        clearInterval(timer);
        callback(false);
      }
    }, 100);
  }

  function runLiveness() {

    const userId = payload.userId || payload.user_id;
    const transactionId = payload.transactionId || payload.transaction_id;

    if (!userId || !transactionId) {
      statusEl.textContent = "❌ Missing user_id / transaction_id";
      statusEl.style.color = "#ff4444";
      return;
    }

    OzLiveness.open({
      lang: "en",
      meta: {
        user_id: userId,
        transaction_id: transactionId
      },
      overlay_options: false,
      action: ["video_selfie_blank"],
      result_mode: "safe",

      on_complete: function(result) {
        statusEl.textContent =
          "✅ Done — event_session_id = " + result.event_session_id;
        statusEl.style.color = "#00ffb4";
      }
    });
  }

  startBtn.onclick = function () {
    statusEl.textContent = "⏳ Loading SDK...";
    waitOz((ok) => {
      if (!ok) {
        statusEl.textContent = "❌ OzLiveness SDK not found.";
        statusEl.style.color = "#ff4444";
        return;
      }
      statusEl.textContent = "🚀 Starting Liveness...";
      runLiveness();
    });
  };

  // Auto-start
  setTimeout(() => startBtn.click(), 800);

})();
</script>

</body>
</html>`;

  res.send(html);
});

// ==============================
app.listen(PORT, () => {
  console.log("SAMURAI selfie server running on port", PORT);
});
