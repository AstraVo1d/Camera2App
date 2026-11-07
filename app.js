/* ======================================================================
   Cam2app — عين المنزل
   كل شيء يشتغل داخل المتصفح: الكاميرا + كشف الوجوه/الأجسام بالذكاء
   الاصطناعي (face-api.js) تصير معالجتها محلياً على الجهاز، وما يترفع أي
   فيديو أو صورة لأي سيرفر إلا لحظة إرسال صورة التنبيه نفسه إلى بوت
   تيليجرام الخاص بالمستخدم مباشرة من المتصفح.
   ====================================================================== */

const STORAGE_KEY = "cam2app_config_v1";
const MODELS_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

const $ = (id) => document.getElementById(id);

const els = {
  wizard: $("wizard"), wizardBody: $("wizardBody"), wizardNav: $("wizardNav"),
  steps: [$("ws1"), $("ws2"), $("ws3"), $("ws4")],
  mainApp: $("mainApp"),
  video: $("video"), overlay: $("overlay"), stage: $("stage"), stageOverlay: $("stageOverlay"),
  statusDot: $("statusDot"), fpsBadge: $("fpsBadge"),
  monitorSwitch: $("monitorSwitch"), flipCamera: $("flipCamera"),
  sensitivity: $("sensitivity"), sensVal: $("sensVal"),
  logList: $("logList"), openSettings: $("openSettings"), toast: $("toast"),
};

let config = loadConfig();
let stream = null;
let monitoring = false;
let modelsReady = false;
let lastAlertAt = 0;
let facingMode = config.facingMode || "user";
let wizardState = {};

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveConfig() { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }

function showToast(msg, ms = 3200) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

/* ---------------------------------------------------------------------
   Setup wizard — خطوة بخطوة من أول ما يفتح الرابط
   --------------------------------------------------------------------- */

const steps = [renderWelcome, renderCameraStep, renderTelegramStep, renderDoneStep];
let stepIndex = 0;

function startWizard() {
  els.wizard.hidden = false;
  els.mainApp.hidden = true;
  stepIndex = 0;
  renderStep();
}

function renderStep() {
  els.steps.forEach((s, i) => s.classList.toggle("done", i <= stepIndex));
  steps[stepIndex]();
}

function nav(buttons) {
  els.wizardNav.innerHTML = "";
  buttons.forEach(({ label, kind, onClick }) => {
    const b = document.createElement("button");
    b.className = "btn " + (kind || "btn-primary");
    b.textContent = label;
    b.onclick = onClick;
    els.wizardNav.appendChild(b);
  });
}

function renderWelcome() {
  els.wizardBody.innerHTML = `
    <h1>مرحباً 👋</h1>
    <p>هذا التطبيق يحوّل هاتفك لكاميرا مراقبة ذكية: يراقب المكان، وأول ما حد يقرّب منه، يبعثلك تنبيه فوري على تيليجرام مع صورة.</p>
    <p>بناخذ ٣ خطوات بسيطة بس عشان نجهزه، وبعدها يصير جاهز دايماً من نفس الرابط.</p>`;
  nav([{ label: "يلا نبدأ", onClick: () => { stepIndex = 1; renderStep(); } }]);
}

function renderCameraStep() {
  els.wizardBody.innerHTML = `
    <h1>١. إذن الكاميرا</h1>
    <p>التطبيق يحتاج يشوف من كاميرا الهاتف عشان يكشف إذا حد قرّب. ما يترفع أي فيديو لأي مكان — كله يتحلل جوا الهاتف نفسه.</p>
    <div class="test-result" id="camTestResult"></div>`;
  nav([
    { label: "رجوع", kind: "btn-ghost", onClick: () => { stepIndex = 0; renderStep(); } },
    { label: "اطلب الإذن", onClick: testCameraPermission },
  ]);
}

async function testCameraPermission() {
  const r = $("camTestResult");
  r.className = "test-result";
  r.textContent = "...جاري الطلب";
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    r.className = "test-result ok";
    r.textContent = "✓ تمام، الكاميرا تشتغل";
    setTimeout(() => { stepIndex = 2; renderStep(); }, 500);
  } catch (e) {
    r.className = "test-result fail";
    r.textContent = "✗ رفض الإذن — افتحه من إعدادات المتصفح وجرب مرة ثانية";
  }
}

function renderTelegramStep() {
  els.wizardBody.innerHTML = `
    <h1>٢. بوت التنبيهات</h1>
    <p>التنبيه يوصلك رسالة على تيليجرام. خطوتين بس وتجهز بوتك الخاص:</p>
    <ol>
      <li>افتح تيليجرام وكلم <b>@BotFather</b>، اكتب <span class="mono">/newbot</span> واتبع التعليمات، وراح يعطيك <b>Token</b></li>
      <li>كلم <b>@userinfobot</b> وراح يعطيك <b>Chat ID</b> حقك (أرقام)</li>
    </ol>
    <div class="field">
      <label>Bot Token</label>
      <input type="text" id="botToken" placeholder="123456789:AAH...." value="${config.botToken || ""}">
    </div>
    <div class="field">
      <label>Chat ID</label>
      <input type="text" id="chatId" placeholder="123456789" value="${config.chatId || ""}">
    </div>
    <div class="test-result" id="tgTestResult"></div>`;
  nav([
    { label: "رجوع", kind: "btn-ghost", onClick: () => { stepIndex = 1; renderStep(); } },
    { label: "اختبر وكمّل", onClick: testTelegram },
  ]);
}

async function testTelegram() {
  const token = $("botToken").value.trim();
  const chatId = $("chatId").value.trim();
  const r = $("tgTestResult");
  if (!token || !chatId) {
    r.className = "test-result fail";
    r.textContent = "✗ عبّي الاثنين الحقلين";
    return;
  }
  r.className = "test-result";
  r.textContent = "...جاري الاختبار";
  const ok = await sendTelegramMessage(token, chatId, "✅ Cam2app متصل وجاهز يرسلك تنبيهات من هنا");
  if (ok) {
    config.botToken = token;
    config.chatId = chatId;
    saveConfig();
    r.className = "test-result ok";
    r.textContent = "✓ وصلتك رسالة على تيليجرام؟ تمام، كمّل";
    setTimeout(() => { stepIndex = 3; renderStep(); }, 600);
  } else {
    r.className = "test-result fail";
    r.textContent = "✗ ما قدرنا نوصل — تأكد من الـ Token والـ Chat ID";
  }
}

function renderDoneStep() {
  els.wizardBody.innerHTML = `
    <h1>جاهز ✓</h1>
    <p>التطبيق جاهز الآن. اضغط "ابدأ المراقبة" في الصفحة الرئيسية وقت ما تبي تفعّله.</p>
    <p class="hint">تقدر تثبّت هذا الرابط على شاشة هاتفك الرئيسية (Add to Home Screen) عشان يفتح زي أي تطبيق عادي.</p>`;
  nav([{ label: "افتح التطبيق", onClick: finishWizard }]);
}

function finishWizard() {
  config.setupDone = true;
  saveConfig();
  els.wizard.hidden = true;
  els.mainApp.hidden = false;
  initMainApp();
}

/* ---------------------------------------------------------------------
   Telegram
   --------------------------------------------------------------------- */

async function sendTelegramMessage(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch { return false; }
}

async function sendTelegramPhoto(token, chatId, blob, caption) {
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("photo", blob, "alert.jpg");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    return res.ok;
  } catch { return false; }
}

/* ---------------------------------------------------------------------
   Main app: camera + detection loop
   --------------------------------------------------------------------- */

function initMainApp() {
  els.sensitivity.value = config.sensitivity || 50;
  els.sensVal.textContent = els.sensitivity.value + "%";
  els.stage.classList.toggle("rear", facingMode === "environment");

  els.sensitivity.oninput = () => {
    els.sensVal.textContent = els.sensitivity.value + "%";
    config.sensitivity = +els.sensitivity.value;
    saveConfig();
  };

  els.monitorSwitch.onclick = () => (monitoring ? stopMonitoring() : startMonitoring());
  els.flipCamera.onclick = flipCamera;
  els.openSettings.onclick = () => { els.mainApp.hidden = true; els.wizard.hidden = false; stepIndex = 2; renderStep(); };

  loadModels();
}

async function loadModels() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
    modelsReady = true;
  } catch {
    showToast("تعذر تحميل نموذج الكشف — تأكد من الاتصال بالإنترنت وجرب تحدّث الصفحة");
  }
}

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 960 }, height: { ideal: 1280 } },
    audio: false,
  });
  els.video.srcObject = stream;
  await els.video.play();
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function flipCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  config.facingMode = facingMode;
  saveConfig();
  els.stage.classList.toggle("rear", facingMode === "environment");
  if (monitoring) { stopCamera(); await startCamera(); }
}

async function startMonitoring() {
  if (!modelsReady) { showToast("لسا التطبيق يحمّل نموذج الكشف، ثواني وحاول مرة ثانية"); return; }
  try {
    await startCamera();
  } catch {
    showToast("ما قدرنا نوصل للكاميرا — تأكد من إعطاء الإذن");
    return;
  }
  monitoring = true;
  els.monitorSwitch.classList.add("on");
  els.statusDot.classList.add("live");
  els.stageOverlay.hidden = true;
  detectLoop();
}

function stopMonitoring() {
  monitoring = false;
  els.monitorSwitch.classList.remove("on");
  els.statusDot.classList.remove("live", "alert");
  els.stageOverlay.hidden = false;
  stopCamera();
  const ctx = els.overlay.getContext("2d");
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
}

async function detectLoop() {
  if (!monitoring) return;
  const v = els.video;
  if (v.readyState >= 2 && v.videoWidth) {
    els.overlay.width = v.videoWidth;
    els.overlay.height = v.videoHeight;
    const detections = await faceapi.detectAllFaces(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }));
    drawDetections(detections, v.videoWidth, v.videoHeight);
    checkProximity(detections, v.videoWidth, v.videoHeight);
  }
  requestAnimationFrame(detectLoop);
}

function drawDetections(detections, vw, vh) {
  const ctx = els.overlay.getContext("2d");
  ctx.clearRect(0, 0, vw, vh);
  ctx.lineWidth = Math.max(2, vw / 220);
  ctx.strokeStyle = "#f2b705";
  const mirror = facingMode === "user";
  detections.forEach((d) => {
    const b = d.box;
    const x = mirror ? vw - b.x - b.width : b.x;
    ctx.strokeRect(x, b.y, b.width, b.height);
  });
}

function checkProximity(detections, vw, vh) {
  if (!detections.length) return;
  const frameArea = vw * vh;
  const biggest = Math.max(...detections.map((d) => d.box.width * d.box.height));
  const ratio = biggest / frameArea;
  const sensitivity = config.sensitivity || 50;
  const threshold = (sensitivity / 100) * 0.6; // أعلى حساسية = يحتاج يقرب أكثر

  if (ratio >= threshold) {
    const now = Date.now();
    if (now - lastAlertAt > 20000) { // كولداون ٢٠ ثانية بين تنبيه وتنبيه
      lastAlertAt = now;
      fireAlert();
    } else {
      pulseAlertDot();
    }
  }
}

function pulseAlertDot() {
  els.statusDot.classList.add("alert");
  setTimeout(() => els.statusDot.classList.remove("alert"), 800);
}

async function fireAlert() {
  pulseAlertDot();
  const time = new Date().toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" });
  addLogEntry(time);
  showToast("🔔 تم رصد اقتراب — جاري إرسال التنبيه");

  const snap = await captureSnapshot();
  const caption = `تنبيه Cam2app — في شخص قريب من الكاميرا (${time})`;
  let sent = false;
  if (snap) sent = await sendTelegramPhoto(config.botToken, config.chatId, snap, caption);
  if (!sent) sent = await sendTelegramMessage(config.botToken, config.chatId, caption);
  if (!sent) showToast("تعذر إرسال التنبيه، تأكد من اتصال الإنترنت");
}

function captureSnapshot() {
  try {
    const v = els.video;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (facingMode === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  } catch { return null; }
}

function addLogEntry(time) {
  const empty = els.logList.querySelector(".log-empty");
  if (empty) empty.remove();
  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML = `<span>شخص قريب من الكاميرا</span><span class="t mono">${time}</span>`;
  els.logList.prepend(item);
  while (els.logList.children.length > 20) els.logList.lastChild.remove();
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

if (config.setupDone && config.botToken && config.chatId) {
  els.wizard.hidden = true;
  els.mainApp.hidden = false;
  initMainApp();
} else {
  startWizard();
}
