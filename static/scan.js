const modeButtons = document.querySelectorAll(".mode-btn");
const scanInput = document.getElementById("scanInput");
const stepLabel = document.getElementById("stepLabel");
const statusMsg = document.getElementById("statusMsg");
const infoForm = document.getElementById("infoForm");
const infoFormTitle = document.getElementById("infoFormTitle");
const resetBtn = document.getElementById("resetBtn");
const saveInfoBtn = document.getElementById("saveInfoBtn");
const pendingBadge = document.getElementById("pendingBadge");
const startSheetCaseBtn = document.getElementById("startSheetCaseBtn");
const printTagLink = document.getElementById("printTagLink");
const releaseForm = document.getElementById("releaseForm");
const releaseFormTitle = document.getElementById("releaseFormTitle");
const releasedTo = document.getElementById("releasedTo");
const confirmReleaseBtn = document.getElementById("confirmReleaseBtn");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutFormTitle = document.getElementById("checkoutFormTitle");
const checkoutOrg = document.getElementById("checkoutOrg");
const checkoutReason = document.getElementById("checkoutReason");
const confirmCheckoutBtn = document.getElementById("confirmCheckoutBtn");
const checkinForm = document.getElementById("checkinForm");
const checkinFormTitle = document.getElementById("checkinFormTitle");
const checkinInfo = document.getElementById("checkinInfo");
const confirmCheckinBtn = document.getElementById("confirmCheckinBtn");

// Declared here (not down by the rest of the camera code) because
// resetFlow() calls stopCamera() on every run, including the very first
// call below -- if these were still declared with let/const further down
// the file, that first call would throw "Cannot access before
// initialization" and abort the rest of this script's setup.
const cameraBtn = document.getElementById("cameraBtn");
const cameraStopBtn = document.getElementById("cameraStopBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
let cameraStream = null;
let cameraLoopId = null;
let cameraCooldown = false; // prevents re-firing on the same code every frame

let mode = "sheet-intake";
let step = "case";       // case | location
let currentCaseCode = null;
let currentCaseName = null;
let currentSheetRow = null;

// Used wherever a case is referenced in a status/step message, so staff
// can visually verify they've got the right decedent -- the case number
// alone isn't enough for that check.
function nameSuffix(name) {
  return name ? ` — ${name}` : "";
}

function setMode(newMode) {
  mode = newMode;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
  resetFlow();
}
modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

function resetFlow() {
  step = "case";
  currentCaseCode = null;
  currentCaseName = null;
  currentSheetRow = null;
  infoForm.classList.add("hidden");
  releaseForm.classList.add("hidden");
  checkoutForm.classList.add("hidden");
  checkinForm.classList.add("hidden");
  printTagLink.classList.add("hidden");
  statusMsg.textContent = "";
  statusMsg.className = "status-msg";
  if (typeof stopCamera === "function") stopCamera();

  const isSheetIntake = mode === "sheet-intake";
  // Manual scan input box is hidden everywhere -- this station only uses
  // the camera. Left in the DOM (not deleted) so it's a one-line change
  // to bring back if a physical USB/Bluetooth barcode scanner is ever
  // added later; it still works as a scan target either way, it's just
  // not shown or auto-focused.
  scanInput.classList.add("hidden");
  startSheetCaseBtn.classList.toggle("hidden", !isSheetIntake);

  if (mode === "sheet-intake") stepLabel.textContent = "Tap to pull the next case number from the sheet";
  if (mode === "intake") stepLabel.textContent = "Scan the Case ID tag (works with no signal)";
  if (mode === "assign") stepLabel.textContent = "Scan the Case ID tag";
  if (mode === "move") stepLabel.textContent = "Scan the Case ID of the decedent to move";
  if (mode === "release") stepLabel.textContent = "Scan the Case ID to release / mark picked up";
  if (mode === "checkout") stepLabel.textContent = "Scan the Case ID to check out or check back in";
  scanInput.value = "";
}
resetBtn.addEventListener("click", resetFlow);

function clearInfoForm() {
  document.getElementById("fName").value = "";
  document.getElementById("fHome").value = "";
  document.getElementById("fDate").value = "";
  document.getElementById("fTimeReceived").value = "";
  document.getElementById("fRemovalType").value = "";
  document.getElementById("fDisposition").value = "";
  document.getElementById("fRemovalBy").value = "";
  document.getElementById("fNight").checked = false;
}

startSheetCaseBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/sheet-intake/start", {}, 25000);
    currentCaseCode = result.case_code;
    currentSheetRow = result.sheet_row;
    infoFormTitle.textContent = `Case ${currentCaseCode} (from sheet, row ${currentSheetRow})`;
    infoForm.classList.remove("hidden");
    clearInfoForm();
    saveInfoBtn.textContent = "Save (writes to sheet + this app)";
    printTagLink.href = `/case/${encodeURIComponent(currentCaseCode)}/print`;
    printTagLink.classList.remove("hidden");
    showStatus(`Pulled ${currentCaseCode} from the sheet. Fill in details.`, true);
  } catch (err) {
    showStatus(err.message, false);
  }
});

function showStatus(text, ok) {
  statusMsg.textContent = text;
  statusMsg.className = "status-msg " + (ok ? "ok" : "err");
}

// fetch with a timeout, so a dead/slow connection fails fast instead of
// hanging the UI -- important on cellular where a bar of signal can mean
// a request neither succeeds nor errors for a long time.
async function postJSON(url, body, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

scanInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const code = scanInput.value.trim();
  scanInput.value = "";
  if (!code) return;
  await processScannedCode(code);
});

async function processScannedCode(code) {
  try {
    if (step === "case") {
      await handleCaseScan(code);
    } else if (step === "location") {
      await handleLocationScan(code);
    }
  } catch (err) {
    showStatus(err.message, false);
  }
}

// Printed armband tags now encode a full URL (http://host/case/<code>) so
// any phone's default camera app can open them directly -- but scanning
// one here (physical scanner or in-app camera) still needs to drive the
// Assign/Move/Release flow, so pull the bare case code back out of it.
// Older pre-printed "CASE|<id>" tags still work unchanged.
function normalizeCaseCode(raw) {
  const urlMatch = raw.match(/\/case\/([^/?#]+)\/?$/);
  if (urlMatch) return decodeURIComponent(urlMatch[1]);
  if (raw.startsWith("CASE|")) return raw;
  return null;
}

async function handleCaseScan(rawCode) {
  const code = normalizeCaseCode(rawCode);
  if (!code) {
    showStatus("That doesn't look like a Case ID tag.", false);
    return;
  }
  currentCaseCode = code;

  if (mode === "intake") {
    // No server round-trip required here on purpose -- this has to work
    // with zero signal. Just show the form; Save is what tries to sync.
    infoFormTitle.textContent = `Case ${code}`;
    infoForm.classList.remove("hidden");
    clearInfoForm();
    saveInfoBtn.textContent = "Save (uploads now, or later if no signal)";
    showStatus(`${code} scanned. Fill in what you have.`, true);
    return;
  }

  const caseData = await postJSON("/api/case/lookup", { case_code: code });
  currentCaseName = caseData.name || null;
  const nameTag = nameSuffix(currentCaseName);

  if (mode === "release") {
    if (caseData.status !== "placed") {
      showStatus(`${code} is not currently placed, so there's nothing to release.`, false);
      return;
    }
    releaseFormTitle.textContent = `Release Case ${code}${nameTag}`;
    releasedTo.value = "";
    releaseForm.classList.remove("hidden");
    showStatus(`${code}${nameTag} scanned. Enter who it's released to.`, true);
    return;
  }

  if (mode === "checkout") {
    if (caseData.status === "placed") {
      checkoutFormTitle.textContent = `Check Out Case ${code}${nameTag}`;
      checkoutOrg.value = "";
      checkoutReason.value = "Autopsy";
      checkoutForm.classList.remove("hidden");
      showStatus(`${code}${nameTag} scanned. Enter who it's checked out to.`, true);
      return;
    }
    if (caseData.status === "checked_out") {
      checkinFormTitle.textContent = `Check In Case ${code}${nameTag}`;
      const since = caseData.checked_out_at ? caseData.checked_out_at.split(" ")[0] : "";
      checkinInfo.textContent =
        `Currently checked out to ${caseData.checkout_org || "?"}` +
        (caseData.checkout_reason ? ` (${caseData.checkout_reason})` : "") +
        (since ? ` since ${since}.` : ".");
      checkinForm.classList.remove("hidden");
      showStatus(`${code}${nameTag} scanned.`, true);
      return;
    }
    showStatus(`${code} is not currently placed or checked out -- nothing to check out/in.`, false);
    return;
  }

  if (mode === "assign" || mode === "sheet-intake") {
    if (caseData.status === "placed") {
      showStatus(`${code} is already placed. Use Move instead.`, false);
      return;
    }
    if (caseData.status === "released") {
      showStatus(`${code} has already been released/cremated. This tag is no longer active.`, false);
      return;
    }
    if (caseData.status === "checked_out") {
      showStatus(`${code} is currently checked out. Use Check Out/In mode to bring it back first.`, false);
      return;
    }
    if (caseData.status === "pending_info") {
      infoFormTitle.textContent = `Case ${code} — Enter Details`;
      infoForm.classList.remove("hidden");
      clearInfoForm();
      saveInfoBtn.textContent = "Save & Continue to Location Scan";
      showStatus(`New case ${code}. Fill in details below.`, true);
      return;
    }
    // pending_location -- info was already saved (maybe in an earlier
    // session) but a location was never scanned before the flow got
    // reset/closed. Re-scanning the same tag here picks right back up
    // at the location-scan step instead of leaving the case stranded.
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${code}${nameTag}`;
    showStatus(`${code}${nameTag} recognized. Scan a slot location.`, true);
  }

  if (mode === "move") {
    if (caseData.status !== "placed") {
      showStatus(`${code} is not currently placed. Use Assign instead.`, false);
      return;
    }
    step = "location";
    stepLabel.textContent = `Scan the NEW slot location for ${code}${nameTag}`;
    showStatus(`${code}${nameTag} found. Scan the new location.`, true);
  }
}

async function handleLocationScan(code) {
  if (!code.startsWith("LOC|")) {
    showStatus("That doesn't look like a location tag.", false);
    return;
  }
  if (mode === "assign" || mode === "sheet-intake" || mode === "checkout") {
    const result = await postJSON("/api/assign", { case_code: currentCaseCode, location_code: code });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    showStatus(`${currentCaseCode} placed at ${code}.${warning}`, !result.sheet_warning);
  } else if (mode === "move") {
    await postJSON("/api/move", { case_code: currentCaseCode, location_code: code });
    showStatus(`${currentCaseCode} moved to ${code}.`, true);
  }
  setTimeout(resetFlow, 1400);
}

saveInfoBtn.addEventListener("click", async () => {
  const body = {
    name: document.getElementById("fName").value,
    funeral_home: document.getElementById("fHome").value,
    pickup_date: document.getElementById("fDate").value,
    time_received: document.getElementById("fTimeReceived").value,
    removal_type: document.getElementById("fRemovalType").value,
    disposition: document.getElementById("fDisposition").value,
    removal_by: document.getElementById("fRemovalBy").value,
    night: document.getElementById("fNight").checked ? "Yes" : "No",
  };

  if (mode === "intake") {
    await saveIntake(currentCaseCode, body);
    infoForm.classList.add("hidden");
    resetFlow();
    return;
  }

  if (mode === "sheet-intake") {
    try {
      body.case_code = currentCaseCode;
      body.sheet_row = currentSheetRow;
      const result = await postJSON("/api/sheet-intake/save", body, 25000);
      currentCaseName = body.name || null;
      infoForm.classList.add("hidden");
      // Switch the UI over to the normal scan input so the location can
      // be scanned right away, same as the Assign flow.
      startSheetCaseBtn.classList.add("hidden");
      scanInput.classList.remove("hidden");
      scanInput.focus();
      step = "location";
      stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
      const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
      showStatus(`Saved${warning}. Scan a slot location.`, !result.sheet_warning);
    } catch (err) {
      showStatus(err.message, false);
    }
    return;
  }

  try {
    await postJSON(`/api/case/${encodeURIComponent(currentCaseCode)}/info`, body);
    currentCaseName = body.name || null;
    infoForm.classList.add("hidden");
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
    showStatus("Saved. Scan a slot location.", true);
    scanInput.focus();
  } catch (err) {
    showStatus(err.message, false);
  }
});

confirmReleaseBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/release", {
      case_code: currentCaseCode,
      released_to: releasedTo.value,
    });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    showStatus(`${currentCaseCode} released.${warning}`, !result.sheet_warning);
    setTimeout(resetFlow, 1400);
  } catch (err) {
    showStatus(err.message, false);
  }
});

confirmCheckoutBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/checkout", {
      case_code: currentCaseCode,
      organization: checkoutOrg.value,
      reason: checkoutReason.value,
    });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    showStatus(`${currentCaseCode} checked out.${warning}`, !result.sheet_warning);
    setTimeout(resetFlow, 1400);
  } catch (err) {
    showStatus(err.message, false);
  }
});

confirmCheckinBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/checkin", { case_code: currentCaseCode });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    checkinForm.classList.add("hidden");
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
    showStatus(`${currentCaseCode} checked in.${warning} Scan a slot location.`, !result.sheet_warning);
  } catch (err) {
    showStatus(err.message, false);
  }
});

resetFlow();

// ==================== Offline queue (Field Intake mode) ====================
// IndexedDB, not localStorage -- survives app restarts and holds structured
// records. Every save gets a client-generated id so a retried/duplicated
// sync is a no-op on the server instead of creating a duplicate record.

const DB_NAME = "cooler_offline";
const STORE_NAME = "pending_intakes";

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "client_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAdd(item) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueRemove(clientId) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(clientId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueAll() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newClientId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function saveIntake(caseCode, info) {
  const item = {
    client_id: newClientId(),
    case_code: caseCode,
    name: info.name || "",
    funeral_home: info.funeral_home || "",
    pickup_date: info.pickup_date || "",
    saved_at: new Date().toISOString(),
  };
  try {
    await postJSON("/api/intake-sync", item, 5000);
    showStatus(`${caseCode} uploaded.`, true);
  } catch (err) {
    await queueAdd(item);
    showStatus(`${caseCode} saved on this phone -- will upload automatically once you have a connection.`, true);
  }
  updatePendingBadge();
}

async function flushQueue() {
  const items = await queueAll();
  if (items.length === 0) {
    updatePendingBadge();
    return;
  }
  for (const item of items) {
    try {
      await postJSON("/api/intake-sync", item, 5000);
      await queueRemove(item.client_id);
    } catch (err) {
      // still offline / server unreachable -- stop trying this pass,
      // the next timer tick or 'online' event will retry everything.
      break;
    }
  }
  await updatePendingBadge();
}

async function updatePendingBadge() {
  const items = await queueAll();
  if (items.length === 0) {
    pendingBadge.classList.add("hidden");
    return;
  }
  pendingBadge.classList.remove("hidden");
  pendingBadge.classList.remove("synced");
  pendingBadge.textContent =
    items.length === 1
      ? "1 case saved on this phone, waiting to upload"
      : `${items.length} cases saved on this phone, waiting to upload`;
}

window.addEventListener("online", flushQueue);
window.addEventListener("load", () => {
  updatePendingBadge();
  flushQueue();
});
setInterval(flushQueue, 20000);

// ---------------- Camera scanning (jsQR, fully local — no CDN) ----------------
cameraBtn.addEventListener("click", startCamera);
cameraStopBtn.addEventListener("click", stopCamera);

// Synthesized beep (Web Audio API) instead of an audio file -- keeps this
// fully local/offline like everything else here, and it's just a couple
// lines either way. Browsers only allow audio to start from a real user
// gesture, so the AudioContext gets created/resumed inside startCamera()
// (a click handler), not lazily on the first scan.
let audioCtx = null;
function playBeep() {
  try {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 1500;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    // Audio blocked/unavailable -- scanning itself still works fine either way.
  }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStatus(
      "Camera not available. On a phone/tablet browser this usually means the page isn't loaded over a secure connection (see README — 'Camera scanning' section) or camera permission was denied.",
      false
    );
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      // Without a resolution cap, many phones default to their camera's
      // native resolution (often 4K+) for this stream -- decoding a
      // frame that large with jsQR on every tick is slow enough to make
      // scanning feel laggy/finicky. 1280x720 is still far more detail
      // than a QR code needs and decodes many times faster per frame.
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (err) {
    showStatus("Camera permission denied or unavailable: " + err.message, false);
    return;
  }
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  cameraVideo.srcObject = cameraStream;
  cameraVideo.muted = true;
  await cameraVideo.play();
  cameraPanel.classList.remove("hidden");
  cameraBtn.classList.add("hidden");
  cameraLoop();
}

function stopCamera() {
  if (cameraLoopId) cancelAnimationFrame(cameraLoopId);
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  cameraPanel.classList.add("hidden");
  cameraBtn.classList.remove("hidden");
}

function cameraLoop() {
  const ctx = cameraCanvas.getContext("2d", { willReadFrequently: true });
  if (cameraVideo.readyState === cameraVideo.HAVE_ENOUGH_DATA) {
    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
    const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    // dontInvert: every printed tag is plain black-on-white (see
    // gen_location_qr.py / the QR label routes in app.py), so the
    // inverted-colors decode pass jsQR tries by default is pure wasted
    // work here -- skipping it roughly halves the time spent per frame.
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (result && result.data && !cameraCooldown) {
      cameraCooldown = true;
      playBeep();
      processScannedCode(result.data.trim()).finally(() => {
        setTimeout(() => { cameraCooldown = false; }, 1500);
      });
    }
  }
  cameraLoopId = requestAnimationFrame(cameraLoop);
}
