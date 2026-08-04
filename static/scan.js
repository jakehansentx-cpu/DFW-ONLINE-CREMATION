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

let mode = "sheet-intake";
let step = "case";       // case | location
let currentCaseCode = null;
let currentSheetRow = null;

function setMode(newMode) {
  mode = newMode;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
  resetFlow();
}
modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

function resetFlow() {
  step = "case";
  currentCaseCode = null;
  currentSheetRow = null;
  infoForm.classList.add("hidden");
  statusMsg.textContent = "";
  statusMsg.className = "status-msg";
  if (typeof stopCamera === "function") stopCamera();

  const isSheetIntake = mode === "sheet-intake";
  scanInput.classList.toggle("hidden", isSheetIntake);
  startSheetCaseBtn.classList.toggle("hidden", !isSheetIntake);

  if (mode === "sheet-intake") stepLabel.textContent = "Tap to pull the next case number from the sheet";
  if (mode === "intake") stepLabel.textContent = "Scan the Case ID tag (works with no signal)";
  if (mode === "assign") stepLabel.textContent = "Scan the Case ID tag";
  if (mode === "move") stepLabel.textContent = "Scan the Case ID of the decedent to move";
  if (mode === "release") stepLabel.textContent = "Scan the Case ID to release / mark picked up";
  scanInput.value = "";
  if (!isSheetIntake) scanInput.focus();
}
resetBtn.addEventListener("click", resetFlow);

startSheetCaseBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/sheet-intake/start", {}, 25000);
    currentCaseCode = result.case_code;
    currentSheetRow = result.sheet_row;
    infoFormTitle.textContent = `Case ${currentCaseCode} (from sheet, row ${currentSheetRow})`;
    infoForm.classList.remove("hidden");
    document.getElementById("fName").value = "";
    document.getElementById("fHome").value = "";
    document.getElementById("fDate").value = "";
    saveInfoBtn.textContent = "Save (writes to sheet + this app)";
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

async function handleCaseScan(code) {
  if (!code.startsWith("CASE|")) {
    showStatus("That doesn't look like a Case ID tag.", false);
    return;
  }
  currentCaseCode = code;

  if (mode === "intake") {
    // No server round-trip required here on purpose -- this has to work
    // with zero signal. Just show the form; Save is what tries to sync.
    infoFormTitle.textContent = `Case ${code}`;
    infoForm.classList.remove("hidden");
    document.getElementById("fName").value = "";
    document.getElementById("fHome").value = "";
    document.getElementById("fDate").value = "";
    saveInfoBtn.textContent = "Save (uploads now, or later if no signal)";
    showStatus(`${code} scanned. Fill in what you have.`, true);
    return;
  }

  if (mode === "release") {
    await postJSON("/api/release", { case_code: code });
    showStatus(`${code} released.`, true);
    setTimeout(resetFlow, 1200);
    return;
  }

  const caseData = await postJSON("/api/case/lookup", { case_code: code });

  if (mode === "assign") {
    if (caseData.status === "placed") {
      showStatus(`${code} is already placed. Use Move instead.`, false);
      return;
    }
    if (caseData.status === "pending_info") {
      infoFormTitle.textContent = `Case ${code} — Enter Details`;
      infoForm.classList.remove("hidden");
      document.getElementById("fName").value = "";
      document.getElementById("fHome").value = "";
      document.getElementById("fDate").value = "";
      saveInfoBtn.textContent = "Save & Continue to Location Scan";
      showStatus(`New case ${code}. Fill in details below.`, true);
      return;
    }
    // pending_location already
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${code}`;
    showStatus(`${code} recognized. Scan a slot location.`, true);
  }

  if (mode === "move") {
    if (caseData.status !== "placed") {
      showStatus(`${code} is not currently placed. Use Assign instead.`, false);
      return;
    }
    step = "location";
    stepLabel.textContent = `Scan the NEW slot location for ${code}`;
    showStatus(`${code} found. Scan the new location.`, true);
  }
}

async function handleLocationScan(code) {
  if (!code.startsWith("LOC|")) {
    showStatus("That doesn't look like a location tag.", false);
    return;
  }
  if (mode === "assign" || mode === "sheet-intake") {
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
      infoForm.classList.add("hidden");
      // Switch the UI over to the normal scan input so the location can
      // be scanned right away, same as the Assign flow.
      startSheetCaseBtn.classList.add("hidden");
      scanInput.classList.remove("hidden");
      scanInput.focus();
      step = "location";
      stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}`;
      const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
      showStatus(`Saved${warning}. Scan a slot location.`, !result.sheet_warning);
    } catch (err) {
      showStatus(err.message, false);
    }
    return;
  }

  try {
    await postJSON(`/api/case/${encodeURIComponent(currentCaseCode)}/info`, body);
    infoForm.classList.add("hidden");
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}`;
    showStatus("Saved. Scan a slot location.", true);
    scanInput.focus();
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
const cameraBtn = document.getElementById("cameraBtn");
const cameraStopBtn = document.getElementById("cameraStopBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
let cameraStream = null;
let cameraLoopId = null;
let cameraCooldown = false; // prevents re-firing on the same code every frame

cameraBtn.addEventListener("click", startCamera);
cameraStopBtn.addEventListener("click", stopCamera);

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
      video: { facingMode: "environment" },
    });
  } catch (err) {
    showStatus("Camera permission denied or unavailable: " + err.message, false);
    return;
  }
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
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result && result.data && !cameraCooldown) {
      cameraCooldown = true;
      processScannedCode(result.data.trim()).finally(() => {
        setTimeout(() => { cameraCooldown = false; }, 1500);
      });
    }
  }
  cameraLoopId = requestAnimationFrame(cameraLoop);
}
