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
const printGate = document.getElementById("printGate");
const printGateBtn = document.getElementById("printGateBtn");
const releaseForm = document.getElementById("releaseForm");
const releaseFormTitle = document.getElementById("releaseFormTitle");
const releasedTo = document.getElementById("releasedTo");
const confirmReleaseBtn = document.getElementById("confirmReleaseBtn");
const confirmCrematedBtn = document.getElementById("confirmCrematedBtn");
const cremateForm = document.getElementById("cremateForm");
const cremateFormTitle = document.getElementById("cremateFormTitle");
const diskNumber = document.getElementById("diskNumber");
const confirmCremateBtn = document.getElementById("confirmCremateBtn");
const printedName = document.getElementById("printedName");
const signatureCanvas = document.getElementById("signatureCanvas");
const clearSignatureBtn = document.getElementById("clearSignatureBtn");
const releaseReceiptGate = document.getElementById("releaseReceiptGate");
const releaseReceiptBtn = document.getElementById("releaseReceiptBtn");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutFormTitle = document.getElementById("checkoutFormTitle");
const checkoutOrg = document.getElementById("checkoutOrg");
const checkoutReason = document.getElementById("checkoutReason");
const confirmCheckoutBtn = document.getElementById("confirmCheckoutBtn");
const checkinForm = document.getElementById("checkinForm");
const checkinFormTitle = document.getElementById("checkinFormTitle");
const checkinInfo = document.getElementById("checkinInfo");
const confirmCheckinBtn = document.getElementById("confirmCheckinBtn");
const confirmBox = document.getElementById("confirmBox");
const confirmMessage = document.getElementById("confirmMessage");
const confirmYesBtn = document.getElementById("confirmYesBtn");
const confirmNoBtn = document.getElementById("confirmNoBtn");
const staffSelect = document.getElementById("staffSelect");
const inventoryPanel = document.getElementById("inventoryPanel");
const inventoryTitle = document.getElementById("inventoryTitle");
const inventoryList = document.getElementById("inventoryList");
const inventoryDescription = document.getElementById("inventoryDescription");
const inventoryPhotoInput = document.getElementById("inventoryPhotoInput");
const inventoryPhotoPreview = document.getElementById("inventoryPhotoPreview");
const addInventoryBtn = document.getElementById("addInventoryBtn");
const inventoryStatus = document.getElementById("inventoryStatus");

// "Who's working?" is picked once per shift and remembered across page
// reloads -- not a login, just tags every Assign/Move/Release/Checkout/
// Check-in action with who did it (see the case History view).
const STAFF_STORAGE_KEY = "cooler_staff_name";
const savedStaff = localStorage.getItem(STAFF_STORAGE_KEY);
if (savedStaff && [...staffSelect.options].some((o) => o.value === savedStaff)) {
  staffSelect.value = savedStaff;
}
staffSelect.addEventListener("change", () => {
  localStorage.setItem(STAFF_STORAGE_KEY, staffSelect.value);
});

// ---------------- Monthly spreadsheet ----------------
// A new call log spreadsheet gets generated every month. New intakes
// (Decedent Information) need to know which one is "current"; a case
// already in progress keeps resolving to whichever sheet it was created
// against, so switching this over mid-month never moves an open case to
// the wrong spreadsheet -- see sheet_id in app.py.
const sheetToggleBtn = document.getElementById("sheetToggleBtn");
const sheetPanel = document.getElementById("sheetPanel");
const sheetPanelMsg = document.getElementById("sheetPanelMsg");
const sheetUrlInput = document.getElementById("sheetUrlInput");
const sheetSetBtn = document.getElementById("sheetSetBtn");
const sheetSetStatus = document.getElementById("sheetSetStatus");

sheetToggleBtn.addEventListener("click", () => {
  sheetPanel.classList.toggle("hidden");
});

sheetSetBtn.addEventListener("click", async () => {
  sheetSetStatus.textContent = "Checking access...";
  sheetSetStatus.className = "status-msg";
  sheetSetBtn.disabled = true;
  try {
    const result = await postJSON("/api/settings/sheet", { url: sheetUrlInput.value }, 15000);
    sheetSetStatus.textContent = `Saved. New intakes now go to "${result.label}".`;
    sheetSetStatus.className = "status-msg ok";
    sheetUrlInput.value = "";
    sheetToggleBtn.classList.remove("attention");
  } catch (err) {
    sheetSetStatus.textContent = err.message;
    sheetSetStatus.className = "status-msg err";
  } finally {
    sheetSetBtn.disabled = false;
  }
});

(async function checkSheetStatus() {
  try {
    const res = await fetch("/api/settings/sheet-status");
    if (!res.ok) return;
    const data = await res.json();
    if (data.auto_adopted_label) {
      showStatus(`New month detected -- automatically switched to "${data.auto_adopted_label}".`, true);
      sheetPanelMsg.textContent = `Currently set to "${data.current_sheet_label}" (auto-detected). Paste a new link below if you ever need to switch it manually.`;
    } else if (data.needs_new_sheet) {
      sheetToggleBtn.classList.add("attention");
      sheetPanel.classList.remove("hidden");
      sheetPanelMsg.textContent =
        "A new month has started and no new sheet has been auto-detected yet -- paste this month's spreadsheet link below so new intakes go to the right place. Cases already in progress are unaffected.";
    } else {
      sheetPanelMsg.textContent = data.current_sheet_label
        ? `Currently set to "${data.current_sheet_label}". Paste a new link below to switch it.`
        : "Paste a new spreadsheet link below to switch it.";
    }
  } catch (e) {
    console.error("sheet status check failed", e);
  }
})();

// Some staff prefer typing name/date/funeral home/disposition/night
// straight into the spreadsheet rather than using this app -- that's
// fine, but a decedent only gets a local record (and therefore an
// armband tag/QR and board tracking) once the app knows about them.
// This pulls in anything typed directly into the sheet that isn't
// tracked locally yet.
const syncSheetBtn = document.getElementById("syncSheetBtn");
const syncResults = document.getElementById("syncResults");

function escapeHtmlLocal(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

syncSheetBtn.addEventListener("click", async () => {
  syncSheetBtn.disabled = true;
  syncSheetBtn.textContent = "Checking sheet...";
  try {
    // Checks every filled-in row against the sheet (not just brand-new
    // ones) to catch stray/incomplete records too -- as the sheet fills
    // up over the month this can take a while, so this gets a longer
    // timeout than the app's other, quicker actions.
    const result = await postJSON("/api/sheet-sync", {}, 60000);
    if (result.synced.length === 0) {
      syncResults.innerHTML = `<p style="color:#aab; margin:0;">No new manual entries found -- everything in the sheet is already tracked.</p>`;
    } else {
      const rows = result.synced
        .map(
          (c) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid #263042;">
          <span>${escapeHtmlLocal(c.case_code)}${c.name ? " — " + escapeHtmlLocal(c.name) : ""}</span>
          <a href="/case/${encodeURIComponent(c.case_code)}/print" target="_blank" rel="noopener" style="color:#5fa8e0; white-space:nowrap;">🖨️ Print Tag</a>
        </div>`
        )
        .join("");
      syncResults.innerHTML =
        `<h3 style="margin-top:0;">${result.synced.length} New Decedent${result.synced.length > 1 ? "s" : ""} Found</h3>` +
        `<p style="color:#aab; font-size:14px;">Print an armband tag for each, then place and scan them in as usual.</p>` +
        rows;
    }
    syncResults.classList.remove("hidden");
  } catch (err) {
    const timedOut = err.name === "AbortError" || /abort/i.test(err.message);
    const message = timedOut
      ? "This is taking longer than usual to check the sheet. It may still finish in the background -- wait a minute, then check column N or try again."
      : err.message;
    syncResults.innerHTML = `<p class="status-msg err" style="margin:0;">${escapeHtmlLocal(message)}</p>`;
    syncResults.classList.remove("hidden");
  } finally {
    syncSheetBtn.disabled = false;
    syncSheetBtn.textContent = "🔄 Sync Manual Entries From Sheet";
  }
});

// Signature capture for the Release form -- drawn on a canvas via
// Pointer Events so mouse, touch, and stylus all work the same way.
const sigCtx = signatureCanvas.getContext("2d");
let sigDrawing = false;
let sigHasContent = false;

function clearSignature() {
  sigCtx.fillStyle = "#fff";
  sigCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  sigHasContent = false;
}
clearSignature();

function sigPos(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (signatureCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (signatureCanvas.height / rect.height),
  };
}
signatureCanvas.addEventListener("pointerdown", (e) => {
  sigDrawing = true;
  sigHasContent = true;
  const p = sigPos(e);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
  signatureCanvas.setPointerCapture(e.pointerId);
});
signatureCanvas.addEventListener("pointermove", (e) => {
  if (!sigDrawing) return;
  const p = sigPos(e);
  sigCtx.strokeStyle = "#000";
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
});
signatureCanvas.addEventListener("pointerup", () => {
  sigDrawing = false;
});
signatureCanvas.addEventListener("pointercancel", () => {
  sigDrawing = false;
});
clearSignatureBtn.addEventListener("click", clearSignature);

function getSignatureDataUrl() {
  return sigHasContent ? signatureCanvas.toDataURL("image/png") : null;
}

function getStaffName() {
  return staffSelect.value;
}

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
let pendingConfirmAction = null;

// Used wherever a case is referenced in a status/step message, so staff
// can visually verify they've got the right decedent -- the case number
// alone isn't enough for that check.
function nameSuffix(name) {
  return name ? ` — ${name}` : "";
}

// Release and Cremated both permanently deactivate the case's QR code --
// a misscan there is much costlier than one in Move, so both get a
// confirmation step before the actual API call fires. Reused for any
// future action that needs the same "are you sure?" treatment.
function askConfirm(message, onConfirm) {
  confirmMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  confirmBox.classList.remove("hidden");
}
confirmYesBtn.addEventListener("click", () => {
  confirmBox.classList.add("hidden");
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  if (action) action();
});
confirmNoBtn.addEventListener("click", () => {
  confirmBox.classList.add("hidden");
  pendingConfirmAction = null;
});

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
  cremateForm.classList.add("hidden");
  checkoutForm.classList.add("hidden");
  checkinForm.classList.add("hidden");
  printTagLink.classList.add("hidden");
  printGate.classList.add("hidden");
  releaseReceiptGate.classList.add("hidden");
  inventoryPanel.classList.add("hidden");
  confirmBox.classList.add("hidden");
  pendingConfirmAction = null;
  printedName.value = "";
  diskNumber.value = "";
  inventoryDescription.value = "";
  inventoryPhotoInput.value = "";
  inventoryPhotoPreview.classList.add("hidden");
  inventoryStatus.textContent = "";
  inventoryStatus.className = "status-msg";
  clearSignature();
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
  if (mode === "cremate") stepLabel.textContent = "Scan the armband QR to confirm cremation";
  if (mode === "checkout") stepLabel.textContent = "Scan the Case ID to check out or check back in";
  if (mode === "inventory") stepLabel.textContent = "Scan the Case ID to view/add inventory";
  scanInput.value = "";
}
resetBtn.addEventListener("click", resetFlow);

// After decedent info is saved, the tag has to actually get printed before
// the flow moves on to placing the decedent -- this screen forces that
// step to happen instead of leaving it as something easy to forget.
// Continuing is gated behind the print button's own click handler below,
// not a separate "Continue" button, so there's only one thing to press.
function showPrintGate(code, nameTag) {
  infoForm.classList.add("hidden");
  printGate.classList.remove("hidden");
  printGateBtn.href = `/case/${encodeURIComponent(code)}/print`;
  stepLabel.textContent = `Print the armband tag for ${code}${nameTag}`;
  showStatus("Saved. Print the armband tag to continue.", true);
}

printGateBtn.addEventListener("click", () => {
  printGate.classList.add("hidden");
  startSheetCaseBtn.classList.add("hidden");
  step = "location";
  stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
  showStatus("Scan a slot location.", true);
});

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
  let code = normalizeCaseCode(rawCode);
  if (!code) {
    showStatus("That doesn't look like a Case ID tag.", false);
    return;
  }

  if (mode === "intake") {
    // No server round-trip required here on purpose -- this has to work
    // with zero signal. Just show the form; Save is what tries to sync.
    currentCaseCode = code;
    infoFormTitle.textContent = `Case ${code}`;
    infoForm.classList.remove("hidden");
    clearInfoForm();
    saveInfoBtn.textContent = "Save (uploads now, or later if no signal)";
    showStatus(`${code} scanned. Fill in what you have.`, true);
    return;
  }

  const caseData = await postJSON("/api/case/lookup", { case_code: code });
  // A pre-printed placeholder field tag (see gen_field_tags.py) gets
  // claimed against a real, sheet-issued case number the first time it's
  // scanned -- from then on, everything (including this same physical
  // tag) refers to that real number, not the placeholder code that was
  // actually scanned.
  code = caseData.case_code || code;
  currentCaseCode = code;
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

  if (mode === "cremate") {
    if (caseData.status !== "placed") {
      showStatus(`${code} is not currently placed, so there's nothing to cremate.`, false);
      return;
    }
    cremateFormTitle.textContent = `Cremate Case ${code}${nameTag}`;
    diskNumber.value = "";
    cremateForm.classList.remove("hidden");
    showStatus(`${code}${nameTag} scanned. Enter the disk number.`, true);
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

  if (mode === "inventory") {
    inventoryTitle.textContent = `Inventory — ${code}${nameTag}`;
    inventoryPanel.classList.remove("hidden");
    showStatus(`${code}${nameTag} scanned.`, true);
    await loadInventory(code);
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
    const result = await postJSON("/api/assign", { case_code: currentCaseCode, location_code: code, staff: getStaffName() });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    showStatus(`${currentCaseCode} placed at ${code}.${warning}`, !result.sheet_warning);
  } else if (mode === "move") {
    await postJSON("/api/move", { case_code: currentCaseCode, location_code: code, staff: getStaffName() });
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
      const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
      showPrintGate(currentCaseCode, nameSuffix(currentCaseName));
      if (warning) showStatus(`Saved${warning}. Print the armband tag to continue.`, false);
    } catch (err) {
      showStatus(err.message, false);
    }
    return;
  }

  try {
    await postJSON(`/api/case/${encodeURIComponent(currentCaseCode)}/info`, body);
    currentCaseName = body.name || null;
    showPrintGate(currentCaseCode, nameSuffix(currentCaseName));
  } catch (err) {
    showStatus(err.message, false);
  }
});

async function doRelease() {
  const releasedCode = currentCaseCode;
  try {
    const result = await postJSON("/api/release", {
      case_code: releasedCode,
      released_to: releasedTo.value,
      staff: getStaffName(),
      signed_name: printedName.value,
      signature: getSignatureDataUrl(),
    });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    releaseForm.classList.add("hidden");
    releaseReceiptGate.classList.remove("hidden");
    releaseReceiptBtn.href = `/case/${encodeURIComponent(releasedCode)}/release-form`;
    showStatus(`${releasedCode} released.${warning} Print the release form for your records.`, !result.sheet_warning);
  } catch (err) {
    showStatus(err.message, false);
  }
}

releaseReceiptBtn.addEventListener("click", () => {
  releaseReceiptGate.classList.add("hidden");
  resetFlow();
});

async function doCremate() {
  try {
    const result = await postJSON("/api/release", {
      case_code: currentCaseCode,
      cremated: true,
      staff: getStaffName(),
      disk_number: diskNumber.value.trim(),
    });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    showStatus(`${currentCaseCode} marked as cremated.${warning}`, !result.sheet_warning);
    setTimeout(resetFlow, 1400);
  } catch (err) {
    showStatus(err.message, false);
  }
}

confirmReleaseBtn.addEventListener("click", () => {
  const who = releasedTo.value.trim() || "the party entered above";
  askConfirm(
    `Release ${currentCaseCode}${nameSuffix(currentCaseName)} to ${who}? This deactivates the tag and can't be undone.`,
    doRelease
  );
});

confirmCrematedBtn.addEventListener("click", () => {
  releaseForm.classList.add("hidden");
  cremateFormTitle.textContent = `Cremate Case ${currentCaseCode}${nameSuffix(currentCaseName)}`;
  diskNumber.value = "";
  cremateForm.classList.remove("hidden");
  showStatus(`${currentCaseCode}${nameSuffix(currentCaseName)} — enter the disk number.`, true);
});

confirmCremateBtn.addEventListener("click", () => {
  askConfirm(
    `Mark ${currentCaseCode}${nameSuffix(currentCaseName)} as CREMATED (Final Disposition)? This deactivates the tag and can't be undone.`,
    doCremate
  );
});

confirmCheckoutBtn.addEventListener("click", async () => {
  try {
    const result = await postJSON("/api/checkout", {
      case_code: currentCaseCode,
      organization: checkoutOrg.value,
      reason: checkoutReason.value,
      staff: getStaffName(),
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
    const result = await postJSON("/api/checkin", { case_code: currentCaseCode, staff: getStaffName() });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    checkinForm.classList.add("hidden");
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
    showStatus(`${currentCaseCode} checked in.${warning} Scan a slot location.`, !result.sheet_warning);
  } catch (err) {
    showStatus(err.message, false);
  }
});

// ---------------- Inventory ----------------
// Personal effects (jewelry, clothing, phone, paperwork, etc.) logged
// per decedent -- a description, optionally with one photo captured
// straight from the device's camera. Multiple angles of the same item
// are just multiple line entries.
function renderInventoryList(items) {
  if (items.length === 0) {
    inventoryList.innerHTML = `<p style="color:#889; margin:0;">No items logged yet.</p>`;
    return;
  }
  inventoryList.innerHTML = items
    .map(
      (item) => `
    <div class="inventory-row">
      ${item.has_photo ? `<img class="inventory-thumb" src="/api/inventory/${item.id}/photo" alt="">` : ""}
      <div class="inventory-info">
        <div>${escapeHtmlLocal(item.description || "(photo only)")}</div>
        <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(item.when)}${item.staff ? " — " + escapeHtmlLocal(item.staff) : ""}</div>
      </div>
      <button class="inventory-delete-btn" data-id="${item.id}">Delete</button>
    </div>`
    )
    .join("");

  inventoryList.querySelectorAll(".inventory-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const itemId = btn.dataset.id;
      askConfirm("Delete this inventory item? This can't be undone.", async () => {
        try {
          const res = await fetch(`/api/inventory/${itemId}/delete`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Delete failed");
          renderInventoryList(data.items);
        } catch (err) {
          inventoryStatus.textContent = err.message;
          inventoryStatus.className = "status-msg err";
        }
      });
    });
  });
}

async function loadInventory(code) {
  try {
    const res = await fetch(`/api/case/${encodeURIComponent(code)}/inventory`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't load inventory");
    renderInventoryList(data.items);
  } catch (err) {
    inventoryList.innerHTML = "";
    inventoryStatus.textContent = err.message;
    inventoryStatus.className = "status-msg err";
  }
}

inventoryPhotoInput.addEventListener("change", () => {
  const file = inventoryPhotoInput.files[0];
  if (!file) {
    inventoryPhotoPreview.classList.add("hidden");
    return;
  }
  inventoryPhotoPreview.src = URL.createObjectURL(file);
  inventoryPhotoPreview.classList.remove("hidden");
});

addInventoryBtn.addEventListener("click", async () => {
  if (!currentCaseCode) return;
  const description = inventoryDescription.value.trim();
  const photo = inventoryPhotoInput.files[0];
  if (!description && !photo) {
    inventoryStatus.textContent = "Enter a description or attach a photo.";
    inventoryStatus.className = "status-msg err";
    return;
  }

  const body = new FormData();
  body.append("description", description);
  body.append("staff", getStaffName());
  if (photo) body.append("photo", photo);

  addInventoryBtn.disabled = true;
  inventoryStatus.textContent = "Saving...";
  inventoryStatus.className = "status-msg";
  try {
    const res = await fetch(`/api/case/${encodeURIComponent(currentCaseCode)}/inventory`, {
      method: "POST",
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't save item");
    renderInventoryList(data.items);
    inventoryDescription.value = "";
    inventoryPhotoInput.value = "";
    inventoryPhotoPreview.classList.add("hidden");
    inventoryStatus.textContent = "Item added.";
    inventoryStatus.className = "status-msg ok";
  } catch (err) {
    inventoryStatus.textContent = err.message;
    inventoryStatus.className = "status-msg err";
  } finally {
    addInventoryBtn.disabled = false;
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
