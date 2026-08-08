const homeModeButtons = document.querySelectorAll(".home-mode-btn");
const homeScreen = document.getElementById("homeScreen");
const smartScanBtn = document.getElementById("smartScanBtn");
const scanPanel = document.getElementById("scanPanel");
const homeBtn = document.getElementById("homeBtn");
const smartResult = document.getElementById("smartResult");
const quickPrintPanel = document.getElementById("quickPrintPanel");
const quickPrintTitle = document.getElementById("quickPrintTitle");
const quickPrintOfficeBtn = document.getElementById("quickPrintOfficeBtn");
const quickPrintLabelBtn = document.getElementById("quickPrintLabelBtn");
const quickPrintBackBtn = document.getElementById("quickPrintBackBtn");
const findDecedentBtn = document.getElementById("findDecedentBtn");
const findPanel = document.getElementById("findPanel");
const findInput = document.getElementById("findInput");
const findResults = document.getElementById("findResults");
const findBackBtn = document.getElementById("findBackBtn");
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
const printLabelLink = document.getElementById("printLabelLink");
const printGate = document.getElementById("printGate");
const printGateBtn = document.getElementById("printGateBtn");
const printLabelGateBtn = document.getElementById("printLabelGateBtn");
const releaseForm = document.getElementById("releaseForm");
const releaseFormTitle = document.getElementById("releaseFormTitle");
const releasedTo = document.getElementById("releasedTo");
const confirmReleaseBtn = document.getElementById("confirmReleaseBtn");
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
const photoLightbox = document.getElementById("photoLightbox");
const photoLightboxImg = document.getElementById("photoLightboxImg");
const photoLightboxCloseBtn = document.getElementById("photoLightboxCloseBtn");

function openPhotoLightbox(src) {
  photoLightboxImg.src = src;
  photoLightbox.classList.remove("hidden");
}
function closePhotoLightbox() {
  photoLightbox.classList.add("hidden");
  photoLightboxImg.src = "";
}
photoLightboxCloseBtn.addEventListener("click", closePhotoLightbox);
photoLightbox.addEventListener("click", (e) => {
  if (e.target === photoLightbox) closePhotoLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePhotoLightbox();
});
const inventoryPanel = document.getElementById("inventoryPanel");
const inventoryTitle = document.getElementById("inventoryTitle");
const inventoryList = document.getElementById("inventoryList");
const inventoryDescription = document.getElementById("inventoryDescription");
const inventoryCameraBtn = document.getElementById("inventoryCameraBtn");
const inventoryCameraPanel = document.getElementById("inventoryCameraPanel");
const inventoryCameraVideo = document.getElementById("inventoryCameraVideo");
const inventoryCameraCanvas = document.getElementById("inventoryCameraCanvas");
const inventoryCameraStopBtn = document.getElementById("inventoryCameraStopBtn");
const inventoryPendingList = document.getElementById("inventoryPendingList");
let inventoryCameraStream = null;
// Photos taken this session but not saved yet -- { blob, url, capturedAt }.
// Stays open for multiple shots in a row instead of closing after each
// one, and each entry remembers the real moment it was taken (not when
// the batch eventually gets uploaded).
let pendingCaptures = [];
const addInventoryBtn = document.getElementById("addInventoryBtn");
const inventoryStatus = document.getElementById("inventoryStatus");

const documentsPanel = document.getElementById("documentsPanel");
const documentsTitle = document.getElementById("documentsTitle");
const documentsList = document.getElementById("documentsList");
const documentsType = document.getElementById("documentsType");
const documentsCameraBtn = document.getElementById("documentsCameraBtn");
const documentsCameraPanel = document.getElementById("documentsCameraPanel");
const documentsCameraVideo = document.getElementById("documentsCameraVideo");
const documentsCameraCanvas = document.getElementById("documentsCameraCanvas");
const documentsCameraStopBtn = document.getElementById("documentsCameraStopBtn");
const documentsPendingList = document.getElementById("documentsPendingList");
let documentsCameraStream = null;
let documentsPendingCaptures = [];
const addDocumentBtn = document.getElementById("addDocumentBtn");
const documentsStatus = document.getElementById("documentsStatus");

function escapeHtmlLocal(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

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
  // Server re-derives this from the login session on every write anyway
  // (see app.py) -- this is just for immediate UI text, not the source
  // of truth for who's credited with an action.
  return window.CURRENT_STAFF_NAME || "";
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

const caseSearchBtn = document.getElementById("caseSearchBtn");
const caseSearchPanel = document.getElementById("caseSearchPanel");
const caseSearchInput = document.getElementById("caseSearchInput");
const caseSearchResults = document.getElementById("caseSearchResults");
// Classic per-mode screens that start with "scan a Case ID tag for X" --
// caseSearchBtn offers name/case-number search as an alternative on all
// of them (see resetFlow/wireCaseSearch).
const CASE_SEARCH_MODES = ["move", "release", "cremate", "checkout", "inventory", "documents", "print"];

// Disposition suggestions -- Admin manages the list (see admin.js); this
// just fills the <datalist> so the field offers them while still taking
// any free-text value that isn't in the list.
(async function loadDispositionSuggestions() {
  const datalist = document.getElementById("dispositionSuggestions");
  if (!datalist) return;
  try {
    const res = await fetch("/api/dispositions");
    if (!res.ok) return;
    const data = await res.json();
    datalist.innerHTML = (data.options || [])
      .map((label) => `<option value="${label.replace(/"/g, "&quot;")}">`)
      .join("");
  } catch (e) {
    console.error("failed to load disposition suggestions", e);
  }
})();

let mode = "home";
let step = "case";       // case | location
let currentCaseCode = null;
let currentCaseName = null;
let currentSheetRow = null;
let pendingConfirmAction = null;
// Set while staff is choosing WHICH decedent to place at a shelf they've
// already scanned (see showPlaceAtLocationPicker) -- the location code
// this is set to. Checked at the very top of processScannedCode so the
// next scan is interpreted as "the decedent to place here" no matter
// what mode is otherwise active.
let placeAtLocationCode = null;
// True for the rest of a single action started from a smart-scan
// contextual button (e.g. tapping "Move to New Location" after scanning
// an armband) -- those are one-off actions, so completing one should
// return to the home screen instead of re-arming that same mode for
// another case, which is what the classic home-grid mode buttons do.
let smartOneOff = false;

function finishFlow() {
  if (smartOneOff) {
    smartOneOff = false;
    setMode("home");
  } else {
    resetFlow();
  }
}

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
  resetFlow();
}
homeModeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
homeBtn.addEventListener("click", () => setMode("home"));
smartScanBtn.addEventListener("click", () => setMode("smart"));
quickPrintBackBtn.addEventListener("click", () => setMode("home"));
resetBtn.addEventListener("click", resetFlow);

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
  printLabelLink.classList.add("hidden");
  printGate.classList.add("hidden");
  releaseReceiptGate.classList.add("hidden");
  inventoryPanel.classList.add("hidden");
  documentsPanel.classList.add("hidden");
  smartResult.classList.add("hidden");
  smartResult.innerHTML = "";
  placeAtLocationCode = null;
  quickPrintPanel.classList.add("hidden");
  confirmBox.classList.add("hidden");
  pendingConfirmAction = null;
  printedName.value = "";
  diskNumber.value = "";
  inventoryDescription.value = "";
  stopInventoryCamera();
  clearPendingCaptures();
  addInventoryBtn.textContent = "Add Item";
  inventoryStatus.textContent = "";
  inventoryStatus.className = "status-msg";
  documentsType.value = "";
  stopDocumentsCamera();
  clearDocumentsPendingCaptures();
  addDocumentBtn.textContent = "Add Document";
  documentsStatus.textContent = "";
  documentsStatus.className = "status-msg";
  clearSignature();
  statusMsg.textContent = "";
  statusMsg.className = "status-msg";
  if (typeof stopCamera === "function") stopCamera();
  caseSearchPanel.classList.add("hidden");
  caseSearchInput.value = "";
  caseSearchResults.innerHTML = "";

  homeScreen.classList.toggle("hidden", mode !== "home");
  findPanel.classList.toggle("hidden", mode !== "find");
  scanPanel.classList.toggle("hidden", mode === "home" || mode === "find");

  const isSheetIntake = mode === "sheet-intake";
  // Manual scan input box is hidden everywhere -- this station only uses
  // the camera. Left in the DOM (not deleted) so it's a one-line change
  // to bring back if a physical USB/Bluetooth barcode scanner is ever
  // added later; it still works as a scan target either way, it's just
  // not shown or auto-focused.
  scanInput.classList.add("hidden");
  startSheetCaseBtn.classList.toggle("hidden", !isSheetIntake);
  // Not every one of these actions has the physical tag handy right
  // then (e.g. printing a replacement, or checking what was inventoried
  // on a case released a while back) -- search by name/case number as
  // an alternative to scanning, on every mode that starts with "scan a
  // Case ID tag for X".
  caseSearchBtn.classList.toggle("hidden", !CASE_SEARCH_MODES.includes(mode));

  if (mode === "sheet-intake") stepLabel.textContent = "Tap to pull the next case number from the sheet";
  if (mode === "intake") stepLabel.textContent = "Scan the Case ID tag (works with no signal)";
  if (mode === "assign") stepLabel.textContent = "Scan the Case ID tag";
  if (mode === "move") stepLabel.textContent = "Scan the Case ID of the decedent to move";
  if (mode === "release") stepLabel.textContent = "Scan the Case ID to release / mark picked up";
  if (mode === "cremate") stepLabel.textContent = "Scan the armband QR to confirm cremation";
  if (mode === "checkout") stepLabel.textContent = "Scan the Case ID to check out or check back in";
  if (mode === "inventory") stepLabel.textContent = "Scan the Case ID to view/add inventory";
  if (mode === "documents") stepLabel.textContent = "Scan the Case ID to add a document";
  if (mode === "print") stepLabel.textContent = "Scan the Case ID tag to print";
  if (mode === "smart" || mode === "edit") stepLabel.textContent = "Scan any QR code -- armband, shelf, or blank tag";
  if (mode === "assign-location") stepLabel.textContent = "Scan the shelf location to place a decedent";
  scanInput.value = "";

  if (mode === "smart" || mode === "assign-location") startCamera();
}

// After decedent info is saved, the tag has to actually get printed before
// the flow moves on to placing the decedent -- this screen forces that
// step to happen instead of leaving it as something easy to forget.
// Continuing is gated behind the print button's own click handler below,
// not a separate "Continue" button, so there's only one thing to press.
function showPrintGate(code, nameTag) {
  infoForm.classList.add("hidden");
  printGate.classList.remove("hidden");
  printGateBtn.href = `/case/${encodeURIComponent(code)}/print`;
  printLabelGateBtn.href = `/case/${encodeURIComponent(code)}/print-label`;
  stepLabel.textContent = `Print the armband tag for ${code}${nameTag}`;
  showStatus("Saved. Print the armband tag to continue.", true);
}

// Either printer works to satisfy the "print before placing" gate --
// whichever one staff actually have on hand.
function advancePastPrintGate() {
  printGate.classList.add("hidden");
  startSheetCaseBtn.classList.add("hidden");
  cameraBtn.classList.remove("hidden");
  step = "location";
  stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
  showStatus("Scan the empty shelf location QR code.", true);
}
printGateBtn.addEventListener("click", advancePastPrintGate);
printLabelGateBtn.addEventListener("click", advancePastPrintGate);

// Decedent Information (sheet-intake) alternative to the print gate --
// for staff who hand-write the decedent's info onto a pre-printed blank
// field tag instead of printing a new one. Scanning that tag here links
// it (via /api/sheet-intake/link-tag) to the case just created, so later
// scans of the same physical tag resolve to this case instead of
// claiming a different, unrelated one. A tag only gets PRINTED here if
// one actually still needs to be made -- staff can instead print a
// fresh one (office or label printer) if they don't already have a
// hand-written tag ready; either path lands on the same next step
// (scan the slot location), since a freshly printed tag already carries
// the real case code and needs no separate linking.
function showTagLinkStep(code, nameTag) {
  infoForm.classList.add("hidden");
  startSheetCaseBtn.classList.add("hidden");
  step = "link-tag";
  cameraBtn.classList.remove("hidden");
  printTagLink.href = `/case/${encodeURIComponent(code)}/print`;
  printLabelLink.href = `/case/${encodeURIComponent(code)}/print-label`;
  printTagLink.classList.remove("hidden");
  printLabelLink.classList.remove("hidden");
  stepLabel.textContent = `Scan the tag you wrote ${code}${nameTag}'s info on -- or print a new one below`;
  showStatus("Saved. Scan the physical tag to link it, or print a new one.", true);
}

function advancePastTagLinkPrint() {
  printTagLink.classList.add("hidden");
  printLabelLink.classList.add("hidden");
  step = "location";
  stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
  showStatus("Scan the empty shelf location QR code.", true);
}
printTagLink.addEventListener("click", advancePastTagLinkPrint);
printLabelLink.addEventListener("click", advancePastTagLinkPrint);

async function handleTagLinkScan(rawCode) {
  const placeholderCode = normalizeCaseCode(rawCode);
  if (!placeholderCode) {
    showStatus("That doesn't look like a tag QR code.", false);
    return;
  }
  try {
    await postJSON("/api/sheet-intake/link-tag", {
      case_code: currentCaseCode,
      placeholder_code: placeholderCode,
    });
    step = "location";
    stepLabel.textContent = `Now scan the SLOT location for ${currentCaseCode}${nameSuffix(currentCaseName)}`;
    showStatus("Tag linked. Scan the empty shelf location QR code.", true);
  } catch (err) {
    showStatus(err.message, false);
  }
}

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
    // Nothing to print or scan yet at this point -- both come later,
    // gated behind Save, so hide them rather than showing every step's
    // controls at once (see showPrintGate/advancePastPrintGate below).
    startSheetCaseBtn.classList.add("hidden");
    cameraBtn.classList.add("hidden");
    cameraPanel.classList.add("hidden");
    stepLabel.textContent = currentCaseCode;
    infoFormTitle.textContent = `Case ${currentCaseCode} (from sheet, row ${currentSheetRow})`;
    infoForm.classList.remove("hidden");
    clearInfoForm();
    saveInfoBtn.textContent = "Save";
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
    if (placeAtLocationCode) {
      await handlePlaceAtLocationScan(code);
    } else if (mode === "smart") {
      await handleSmartScan(code);
    } else if (mode === "assign-location") {
      await handleAssignLocationScan(code);
    } else if (mode === "print") {
      await handlePrintScan(code);
    } else if (step === "case") {
      await handleCaseScan(code);
    } else if (step === "location") {
      await handleLocationScan(code);
    } else if (step === "link-tag") {
      await handleTagLinkScan(code);
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

  if (mode === "documents") {
    documentsTitle.textContent = `Documents — ${code}${nameTag}`;
    documentsPanel.classList.remove("hidden");
    showStatus(`${code}${nameTag} scanned.`, true);
    await loadDocuments(code);
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
    showStatus(`${code}${nameTag} recognized. Scan the empty shelf location QR code.`, true);
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
  setTimeout(finishFlow, 1400);
}

// ==================== Smart scan (unified "just scan it" flow) ====================
// Triggered by the home screen's big camera button -- unlike every other
// mode above, this one doesn't need a mode picked first. It looks at
// WHAT was scanned and figures out what to show: an occupied shelf's own
// QR shows that decedent's info + an edit button; an unclaimed blank
// field tag goes straight into the same entry form Decedent Information
// uses; an armband/case tag shows only the actions that make sense for
// that case's current status.
async function handleSmartScan(rawCode) {
  if (rawCode.startsWith("LOC|")) {
    await handleSmartLocationScan(rawCode);
    return;
  }
  const code = normalizeCaseCode(rawCode);
  if (!code) {
    showStatus("That doesn't look like a Case ID or location tag.", false);
    return;
  }
  await handleSmartCaseScan(code);
}

async function handleSmartLocationScan(locationCode) {
  const res = await fetch(`/api/location/${encodeURIComponent(locationCode)}/lookup`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't look up that location");
  stopCamera();
  const where = `${data.cooler_name} — Shelf ${data.shelf}${data.slot || ""}`;

  if (data.occupants.length === 0) {
    smartResult.innerHTML = `
      <h3 style="margin-top:0;">${escapeHtmlLocal(where)}</h3>
      <p style="color:#889;">Empty.</p>
      <div class="smart-actions">
        <button id="placeHereBtn">📍 Move Decedent to This Shelf</button>
      </div>
      <button id="smartBackBtn" class="secondary-btn" style="margin-top:14px;">🏠 Back to Home</button>`;
  } else {
    const blocks = data.occupants
      .map(
        (o) => `
      <div style="border-top:1px solid #333; padding-top:12px; margin-top:12px;">
        <p style="margin:4px 0;"><b>Case:</b> ${escapeHtmlLocal(o.case_code)}</p>
        <p style="margin:4px 0;"><b>Name:</b> ${escapeHtmlLocal(o.name || "—")}</p>
        <p style="margin:4px 0;"><b>Funeral Home:</b> ${escapeHtmlLocal(o.funeral_home || "—")}</p>
        <p style="margin:4px 0;"><b>Pickup Date:</b> ${escapeHtmlLocal(o.pickup_date || "—")}</p>
        <button class="smart-edit-btn" data-case="${escapeHtmlLocal(o.case_code)}" style="margin-top:10px; width:100%; padding:12px; background:#2a5d8a; color:#fff; border:none; border-radius:8px;">✏️ Edit Information</button>
      </div>`
      )
      .join("");
    smartResult.innerHTML = `
      <h3 style="margin-top:0;">${escapeHtmlLocal(where)}</h3>
      ${blocks}
      <button id="smartBackBtn" class="secondary-btn" style="margin-top:14px;">🏠 Back to Home</button>`;
  }
  smartResult.classList.remove("hidden");
  wireSmartResultButtons(null);
  const placeHereBtn = document.getElementById("placeHereBtn");
  if (placeHereBtn) {
    placeHereBtn.addEventListener("click", () => showPlaceAtLocationPicker(locationCode, where));
  }
  showStatus(`${where} scanned.`, true);
}

// After scanning an empty shelf, staff pick which decedent goes there
// either by searching (name/case number) or by scanning that decedent's
// own tag next -- see placeAtLocationCode/handlePlaceAtLocationScan.
function showPlaceAtLocationPicker(locationCode, where) {
  placeAtLocationCode = locationCode;
  smartResult.innerHTML = `
    <h3 style="margin-top:0;">Place a Decedent at ${escapeHtmlLocal(where)}</h3>
    <label style="display:block; color:#aab; font-size:14px; margin-top:6px;">Search by Name or Case Number</label>
    <input id="placeSearchInput" type="text" placeholder="Start typing..." autocomplete="off"
           style="width:100%; font-size:18px; padding:10px; margin-top:4px; border-radius:6px; border:1px solid #333; background:#0d1116; color:#fff;">
    <div id="placeSearchResults" class="inventory-list" style="margin-top:12px;"></div>
    <button id="placeScanInsteadBtn" class="camera-btn" style="margin-top:14px;">📷 Or Scan the Decedent's Tag Instead</button>
    <button id="placeCancelBtn" class="secondary-btn" style="margin-top:10px;">🏠 Back to Home</button>`;
  smartResult.classList.remove("hidden");

  const searchInput = document.getElementById("placeSearchInput");
  const searchResults = document.getElementById("placeSearchResults");
  let placeDebounceTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(placeDebounceTimer);
    const q = searchInput.value.trim();
    if (!q) {
      searchResults.innerHTML = "";
      return;
    }
    placeDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cases/search?q=${encodeURIComponent(q)}`);
        const matches = (await res.json()).filter(
          (m) => m.status === "pending_location" || m.status === "placed"
        );
        renderPlaceSearchResults(matches, searchResults);
      } catch (err) {
        searchResults.innerHTML = `<p class="status-msg err" style="margin:0;">${escapeHtmlLocal(err.message)}</p>`;
      }
    }, 250);
  });
  searchInput.focus();

  document.getElementById("placeScanInsteadBtn").addEventListener("click", () => {
    showStatus(`Scan the decedent's tag to place at ${where}.`, true);
    startCamera();
  });
  document.getElementById("placeCancelBtn").addEventListener("click", () => {
    placeAtLocationCode = null;
    setMode("home");
  });
}

function renderPlaceSearchResults(matches, container) {
  if (matches.length === 0) {
    container.innerHTML = `<p style="color:#889; margin:0;">No matches awaiting placement or already placed elsewhere.</p>`;
    return;
  }
  container.innerHTML = matches
    .map(
      (m) => `
      <div class="inventory-row">
        <div class="inventory-info">
          <div><b>${escapeHtmlLocal(m.name || m.case_code)}</b></div>
          <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(m.case_code)}${m.funeral_home ? " — " + escapeHtmlLocal(m.funeral_home) : ""} — ${m.status === "placed" ? "currently placed" : "awaiting placement"}</div>
        </div>
        <button class="place-select-btn" data-case="${escapeHtmlLocal(m.case_code)}" style="padding:8px 14px; background:#2a5d8a; color:#fff; border:none; border-radius:6px;">Select</button>
      </div>`
    )
    .join("");
  container.querySelectorAll(".place-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => placeCaseAtLocation(btn.dataset.case));
  });
}

async function handlePlaceAtLocationScan(rawCode) {
  const code = normalizeCaseCode(rawCode);
  if (!code) {
    showStatus("That doesn't look like a decedent's tag. Scan the tag you want to place here.", false);
    return;
  }
  await placeCaseAtLocation(code);
}

async function placeCaseAtLocation(code) {
  const locationCode = placeAtLocationCode;
  if (!locationCode) return;
  try {
    const caseData = await postJSON("/api/case/lookup", { case_code: code });
    if (caseData.status !== "pending_location" && caseData.status !== "placed") {
      showStatus(`${caseData.case_code} can't be placed right now (status: ${caseData.status}).`, false);
      return;
    }
    const endpoint = caseData.status === "placed" ? "/api/move" : "/api/assign";
    const result = await postJSON(endpoint, {
      case_code: caseData.case_code,
      location_code: locationCode,
      staff: getStaffName(),
    });
    const warning = result.sheet_warning ? ` (${result.sheet_warning})` : "";
    placeAtLocationCode = null;
    stopCamera();
    showStatus(`${caseData.case_code}${nameSuffix(caseData.name)} placed at ${locationCode}.${warning}`, !result.sheet_warning);
    setMode("home");
  } catch (err) {
    showStatus(err.message, false);
  }
}

async function handleAssignLocationScan(rawCode) {
  if (!rawCode.startsWith("LOC|")) {
    showStatus("That doesn't look like a shelf/location tag. Scan a shelf QR code.", false);
    return;
  }
  await handleSmartLocationScan(rawCode);
}

async function handleSmartCaseScan(code) {
  const caseData = await postJSON("/api/case/lookup", { case_code: code });
  code = caseData.case_code || code;
  currentCaseCode = code;
  currentCaseName = caseData.name || null;
  stopCamera();

  if (caseData.status === "pending_info") {
    // Blank/unclaimed tag, or a case started but never filled in -- same
    // entry form as Decedent Information's "Start New Case".
    infoFormTitle.textContent = `Case ${code} — Enter Details`;
    infoForm.classList.remove("hidden");
    clearInfoForm();
    saveInfoBtn.textContent = "Save";
    showStatus(`New case ${code}. Fill in details below.`, true);
    return;
  }

  renderSmartCaseActions(caseData);
}

function renderSmartCaseActions(caseData) {
  const code = caseData.case_code;
  const nameTag = nameSuffix(caseData.name);
  const status = caseData.status;

  if (status === "released") {
    const outcome =
      caseData.released_to === "Cremated"
        ? "Cremated"
        : `Released${caseData.released_to ? " to " + escapeHtmlLocal(caseData.released_to) : ""}`;
    smartResult.innerHTML = `
      <h3 style="margin-top:0;">${escapeHtmlLocal(code)}${escapeHtmlLocal(nameTag)}</h3>
      <p style="color:#889;">${outcome}. This tag is no longer active for placement or tracking.</p>
      <button id="smartBackBtn" class="secondary-btn" style="margin-top:14px;">🏠 Back to Home</button>`;
    smartResult.classList.remove("hidden");
    wireSmartResultButtons(caseData);
    return;
  }

  let buttons = "";
  if (status === "placed") {
    buttons += `<button class="smart-action-btn" data-action="move">📍 Move to New Location</button>`;
    buttons += `<button class="smart-action-btn" data-action="release">📤 Release Decedent</button>`;
    buttons += `<button class="smart-action-btn" data-action="cremate" style="background:#5c2a2a;">🔥 Cremate</button>`;
    buttons += `<button class="smart-action-btn" data-action="checkout">📦 Check Out</button>`;
  } else if (status === "checked_out") {
    buttons += `<button class="smart-action-btn" data-action="checkin">📦 Check In</button>`;
  } else if (status === "pending_location") {
    buttons += `<button class="smart-action-btn" data-action="place">📍 Place at Location</button>`;
  }
  buttons += `<button class="smart-action-btn" data-action="inventory">🗂️ Take Inventory</button>`;
  buttons += `<button class="smart-action-btn" data-action="documents">📄 Scan Document</button>`;
  buttons += `<button class="smart-action-btn" data-action="edit">✏️ Edit Decedent Information</button>`;
  buttons += `<button class="smart-action-btn" data-action="print">🖨️ Print Tag</button>`;
  buttons += `<button id="smartBackBtn" class="secondary-btn" style="margin-top:6px;">🏠 Back to Home</button>`;

  smartResult.innerHTML = `
    <h3 style="margin-top:0;">${escapeHtmlLocal(code)}${escapeHtmlLocal(nameTag)}</h3>
    <div class="smart-actions">${buttons}</div>`;
  smartResult.classList.remove("hidden");
  wireSmartResultButtons(caseData);
}

function wireSmartResultButtons(caseData) {
  const backBtn = document.getElementById("smartBackBtn");
  if (backBtn) backBtn.addEventListener("click", () => setMode("home"));

  smartResult.querySelectorAll(".smart-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => startEditFlow(btn.dataset.case, null));
  });

  smartResult.querySelectorAll(".smart-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const code = caseData.case_code;
      const nameTag = nameSuffix(caseData.name);
      smartResult.classList.add("hidden");
      mode = "smart";
      smartOneOff = true;
      currentCaseCode = code;
      currentCaseName = caseData.name || null;

      if (action === "move" || action === "place") {
        mode = "move";
        step = "location";
        stepLabel.textContent = `Scan the ${action === "move" ? "NEW " : ""}slot location for ${code}${nameTag}`;
        showStatus(`${code}${nameTag} — scan the destination shelf.`, true);
      } else if (action === "release") {
        mode = "release";
        releaseFormTitle.textContent = `Release Case ${code}${nameTag}`;
        releasedTo.value = "";
        releaseForm.classList.remove("hidden");
        showStatus(`${code}${nameTag}. Enter who it's released to.`, true);
      } else if (action === "cremate") {
        mode = "cremate";
        cremateFormTitle.textContent = `Cremate Case ${code}${nameTag}`;
        diskNumber.value = "";
        cremateForm.classList.remove("hidden");
        showStatus(`${code}${nameTag} — enter the disk number.`, true);
      } else if (action === "checkout") {
        mode = "checkout";
        checkoutFormTitle.textContent = `Check Out Case ${code}${nameTag}`;
        checkoutOrg.value = "";
        checkoutReason.value = "Autopsy";
        checkoutForm.classList.remove("hidden");
        showStatus(`${code}${nameTag}. Enter who it's checked out to.`, true);
      } else if (action === "checkin") {
        mode = "checkout";
        checkinFormTitle.textContent = `Check In Case ${code}${nameTag}`;
        const since = caseData.checked_out_at ? caseData.checked_out_at.split(" ")[0] : "";
        checkinInfo.textContent =
          `Currently checked out to ${caseData.checkout_org || "?"}` +
          (caseData.checkout_reason ? ` (${caseData.checkout_reason})` : "") +
          (since ? ` since ${since}.` : ".");
        checkinForm.classList.remove("hidden");
        showStatus(`${code}${nameTag}.`, true);
      } else if (action === "inventory") {
        mode = "inventory";
        inventoryTitle.textContent = `Inventory — ${code}${nameTag}`;
        inventoryPanel.classList.remove("hidden");
        showStatus(`${code}${nameTag}.`, true);
        loadInventory(code);
      } else if (action === "documents") {
        mode = "documents";
        documentsTitle.textContent = `Documents — ${code}${nameTag}`;
        documentsPanel.classList.remove("hidden");
        showStatus(`${code}${nameTag}.`, true);
        loadDocuments(code);
      } else if (action === "edit") {
        startEditFlow(code, caseData);
      } else if (action === "print") {
        showQuickPrint(code, nameTag);
      }
    });
  });
}

async function startEditFlow(code, caseData) {
  if (!caseData) {
    caseData = await postJSON("/api/case/lookup", { case_code: code });
  }
  mode = "edit";
  currentCaseCode = caseData.case_code;
  currentCaseName = caseData.name || null;
  smartResult.classList.add("hidden");
  infoFormTitle.textContent = `Edit Case ${caseData.case_code}${nameSuffix(caseData.name)}`;
  document.getElementById("fName").value = caseData.name || "";
  document.getElementById("fHome").value = caseData.funeral_home || "";
  document.getElementById("fDate").value = caseData.pickup_date || "";
  document.getElementById("fTimeReceived").value = caseData.time_received || "";
  document.getElementById("fRemovalType").value = caseData.removal_type || "";
  document.getElementById("fDisposition").value = caseData.disposition || "";
  document.getElementById("fRemovalBy").value = caseData.removal_by || "";
  document.getElementById("fNight").checked = caseData.night === "Yes";
  infoForm.classList.remove("hidden");
  saveInfoBtn.textContent = "Save Changes";
  showStatus(`Editing ${caseData.case_code}${nameSuffix(caseData.name)}.`, true);
}

function showQuickPrint(code, nameTag) {
  quickPrintTitle.textContent = `Print Tag — ${code}${nameTag || ""}`;
  quickPrintOfficeBtn.href = `/case/${encodeURIComponent(code)}/print`;
  quickPrintLabelBtn.href = `/case/${encodeURIComponent(code)}/print-label`;
  quickPrintPanel.classList.remove("hidden");
}

async function handlePrintScan(rawCode) {
  const code = normalizeCaseCode(rawCode);
  if (!code) {
    showStatus("That doesn't look like a Case ID tag.", false);
    return;
  }
  const caseData = await postJSON("/api/case/lookup", { case_code: code });
  currentCaseCode = caseData.case_code;
  currentCaseName = caseData.name || null;
  stopCamera();
  showQuickPrint(caseData.case_code, nameSuffix(currentCaseName));
}

// ==================== Case search (alternative to scanning) ====================
// Available on every classic mode that starts with "scan a Case ID tag
// for X" (see CASE_SEARCH_MODES/resetFlow) -- not every case has its
// physical tag on hand right then, so search by name/case number and
// picking a result acts exactly as if that result's tag had been
// scanned, whatever the current mode is (processScannedCode dispatches
// on mode already).
let caseSearchDebounceTimer = null;

caseSearchBtn.addEventListener("click", () => {
  caseSearchPanel.classList.toggle("hidden");
  if (!caseSearchPanel.classList.contains("hidden")) {
    caseSearchInput.value = "";
    caseSearchResults.innerHTML = "";
    caseSearchInput.focus();
  }
});

caseSearchInput.addEventListener("input", () => {
  clearTimeout(caseSearchDebounceTimer);
  const q = caseSearchInput.value.trim();
  if (!q) {
    caseSearchResults.innerHTML = "";
    return;
  }
  caseSearchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/cases/search?q=${encodeURIComponent(q)}`);
      const matches = await res.json();
      renderCaseSearchResults(matches);
    } catch (err) {
      caseSearchResults.innerHTML = `<p class="status-msg err" style="margin:0;">${escapeHtmlLocal(err.message)}</p>`;
    }
  }, 250);
});

function renderCaseSearchResults(matches) {
  if (matches.length === 0) {
    caseSearchResults.innerHTML = `<p style="color:#889; margin:0;">No matches.</p>`;
    return;
  }
  caseSearchResults.innerHTML = matches
    .map(
      (m) => `
      <div class="inventory-row">
        <div class="inventory-info">
          <div><b>${escapeHtmlLocal(m.name || m.case_code)}</b></div>
          <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(m.case_code)}${m.funeral_home ? " — " + escapeHtmlLocal(m.funeral_home) : ""}</div>
        </div>
        <button class="case-search-select-btn" data-case="${escapeHtmlLocal(m.case_code)}" style="padding:8px 14px; background:#2a5d8a; color:#fff; border:none; border-radius:6px;">Select</button>
      </div>`
    )
    .join("");
  caseSearchResults.querySelectorAll(".case-search-select-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.dataset.case;
      caseSearchPanel.classList.add("hidden");
      cameraBtn.classList.add("hidden");
      try {
        await processScannedCode(`${window.location.origin}/case/${encodeURIComponent(code)}`);
      } catch (err) {
        showStatus(err.message, false);
      }
    });
  });
}

// ==================== Find Decedent ====================
let findDebounceTimer = null;

findDecedentBtn.addEventListener("click", () => {
  setMode("find");
  findInput.value = "";
  findResults.innerHTML = "";
  findInput.focus();
});
findBackBtn.addEventListener("click", () => setMode("home"));

findInput.addEventListener("input", () => {
  clearTimeout(findDebounceTimer);
  const q = findInput.value.trim();
  if (!q) {
    findResults.innerHTML = "";
    return;
  }
  findDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/cases/search?q=${encodeURIComponent(q)}`);
      const matches = await res.json();
      renderFindResults(matches);
    } catch (err) {
      findResults.innerHTML = `<p class="status-msg err" style="margin:0;">${escapeHtmlLocal(err.message)}</p>`;
    }
  }, 250);
});

function renderFindResults(matches) {
  if (matches.length === 0) {
    findResults.innerHTML = `<p style="color:#889; margin:0;">No matches.</p>`;
    return;
  }
  findResults.innerHTML = matches
    .map(
      (m) => `
      <div class="inventory-row">
        <div class="inventory-info">
          <div><b>${escapeHtmlLocal(m.name || m.case_code)}</b></div>
          <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(m.case_code)}${m.funeral_home ? " — " + escapeHtmlLocal(m.funeral_home) : ""}</div>
        </div>
        <button class="find-select-btn" data-case="${escapeHtmlLocal(m.case_code)}" style="padding:8px 14px; background:#2a5d8a; color:#fff; border:none; border-radius:6px;">Select</button>
      </div>`
    )
    .join("");
  findResults.querySelectorAll(".find-select-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.dataset.case;
      mode = "smart";
      findPanel.classList.add("hidden");
      scanPanel.classList.remove("hidden");
      try {
        await handleSmartCaseScan(code);
      } catch (err) {
        showStatus(err.message, false);
      }
    });
  });
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
      showTagLinkStep(currentCaseCode, nameSuffix(currentCaseName));
      if (warning) showStatus(`Saved${warning}. Scan the physical tag to link it.`, false);
    } catch (err) {
      showStatus(err.message, false);
    }
    return;
  }

  if (mode === "edit") {
    try {
      await postJSON(`/api/case/${encodeURIComponent(currentCaseCode)}/info`, body);
      currentCaseName = body.name || null;
      infoForm.classList.add("hidden");
      showStatus(`${currentCaseCode} updated.`, true);
      const caseData = await postJSON("/api/case/lookup", { case_code: currentCaseCode });
      mode = "smart";
      renderSmartCaseActions(caseData);
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
  finishFlow();
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
    setTimeout(finishFlow, 1400);
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
    setTimeout(finishFlow, 1400);
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
    showStatus(`${currentCaseCode} checked in.${warning} Scan the empty shelf location QR code.`, !result.sheet_warning);
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
  const hasAnyPhoto = items.some((item) => item.has_photo);
  inventoryList.innerHTML = items
    .map(
      (item) => `
    <div class="inventory-row">
      ${item.has_photo ? `<img class="inventory-thumb" src="/api/inventory/${item.id}/photo" alt="" data-lightbox-src="/api/inventory/${item.id}/photo">` : ""}
      <div class="inventory-info">
        <div>${escapeHtmlLocal(item.description || "(photo only)")}</div>
        <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(item.when)}${item.staff ? " — " + escapeHtmlLocal(item.staff) : ""}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${item.has_photo ? `<a href="/inventory/${item.id}/print" target="_blank" rel="noopener" style="text-align:center; text-decoration:none; padding:8px 12px; background:#263447; color:#cdd; border-radius:6px; font-size:14px;">🖨️ Print</a>` : ""}
        <button class="inventory-delete-btn" data-id="${item.id}">Delete</button>
      </div>
    </div>`
    )
    .join("") + (hasAnyPhoto && currentCaseCode
      ? `<a href="/case/${encodeURIComponent(currentCaseCode)}/print-inventory" target="_blank" rel="noopener" class="secondary-btn" style="display:block; text-decoration:none; text-align:center; margin-top:12px;">🖨️ Print All Photos (Office Printer)</a>`
      : "");

  inventoryList.querySelectorAll(".inventory-thumb").forEach((img) => {
    img.addEventListener("click", () => openPhotoLightbox(img.dataset.lightboxSrc));
  });

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

// Inventory photo capture -- a live camera preview the user taps
// anywhere on to snap a photo, instead of handing off to the OS's own
// separate camera app via a plain file input. Stays open across
// multiple shots in a row (take one photo per item without re-opening
// the camera each time) instead of closing after every single photo.
// Its own stream/video/canvas, kept independent of the main Case ID
// scan camera above, so this can never interfere with that flow's state.
function pad2(n) {
  return String(n).padStart(2, "0");
}
// Matches the "%Y-%m-%d %H:%M:%S" format used everywhere else in the
// app/database -- sent to the server as when each photo was ACTUALLY
// taken, not whenever the batch eventually finishes uploading.
function formatTimestampForServer(date) {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

async function startInventoryCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    inventoryStatus.textContent = "Camera not available on this device/browser.";
    inventoryStatus.className = "status-msg err";
    return;
  }
  try {
    inventoryCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    inventoryStatus.textContent = "Camera permission denied or unavailable: " + err.message;
    inventoryStatus.className = "status-msg err";
    return;
  }
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  inventoryCameraVideo.srcObject = inventoryCameraStream;
  inventoryCameraVideo.muted = true;
  await inventoryCameraVideo.play();
  inventoryCameraPanel.classList.remove("hidden");
  inventoryCameraBtn.classList.add("hidden");
}

function stopInventoryCamera() {
  if (inventoryCameraStream) {
    inventoryCameraStream.getTracks().forEach((t) => t.stop());
    inventoryCameraStream = null;
  }
  inventoryCameraPanel.classList.add("hidden");
  inventoryCameraBtn.classList.remove("hidden");
}

function captureInventoryPhoto() {
  if (!inventoryCameraStream) return;
  playShutterSound();
  const ctx = inventoryCameraCanvas.getContext("2d");
  inventoryCameraCanvas.width = inventoryCameraVideo.videoWidth;
  inventoryCameraCanvas.height = inventoryCameraVideo.videoHeight;
  ctx.drawImage(inventoryCameraVideo, 0, 0, inventoryCameraCanvas.width, inventoryCameraCanvas.height);
  inventoryCameraCanvas.toBlob(
    (blob) => {
      pendingCaptures.push({ blob, url: URL.createObjectURL(blob), capturedAt: new Date() });
      renderPendingCaptures();
      // Camera stays open on purpose -- ready for the next shot right away.
    },
    "image/jpeg",
    0.85
  );
}

function renderPendingCaptures() {
  if (pendingCaptures.length === 0) {
    inventoryPendingList.classList.add("hidden");
    inventoryPendingList.innerHTML = "";
  } else {
    inventoryPendingList.classList.remove("hidden");
    inventoryPendingList.innerHTML = pendingCaptures
      .map(
        (c, i) => `
      <div class="inventory-pending-item">
        <img src="${c.url}" alt="Captured item photo">
        <div class="pending-time">${c.capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <button type="button" class="pending-remove-btn" data-index="${i}">✕</button>
      </div>`
      )
      .join("");
    inventoryPendingList.querySelectorAll(".pending-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.index, 10);
        URL.revokeObjectURL(pendingCaptures[i].url);
        pendingCaptures.splice(i, 1);
        renderPendingCaptures();
      });
    });
  }
  addInventoryBtn.textContent = pendingCaptures.length > 1 ? `Add ${pendingCaptures.length} Items` : "Add Item";
}

function clearPendingCaptures() {
  stopInventoryCamera();
  pendingCaptures.forEach((c) => URL.revokeObjectURL(c.url));
  pendingCaptures = [];
  renderPendingCaptures();
}

inventoryCameraBtn.addEventListener("click", startInventoryCamera);
inventoryCameraStopBtn.addEventListener("click", stopInventoryCamera);
inventoryCameraVideo.addEventListener("click", captureInventoryPhoto);

addInventoryBtn.addEventListener("click", async () => {
  if (!currentCaseCode) return;
  const description = inventoryDescription.value.trim();
  if (!description && pendingCaptures.length === 0) {
    inventoryStatus.textContent = "Enter a description or take a photo.";
    inventoryStatus.className = "status-msg err";
    return;
  }

  addInventoryBtn.disabled = true;
  // A description with no photos at all is still just one line item;
  // otherwise save one line item per captured photo, each with its own
  // real capture time, applying the same typed description (if any) to
  // each -- staff can always edit an individual line's wording later if
  // a batch covered several different items.
  const toSave = pendingCaptures.length > 0 ? pendingCaptures : [null];
  let lastItems = null;
  let lastWarning = null;
  try {
    for (let i = 0; i < toSave.length; i++) {
      const capture = toSave[i];
      if (toSave.length > 1) {
        inventoryStatus.textContent = `Saving ${i + 1} of ${toSave.length}...`;
        inventoryStatus.className = "status-msg";
      } else {
        inventoryStatus.textContent = "Saving...";
        inventoryStatus.className = "status-msg";
      }
      const body = new FormData();
      body.append("description", description);
      body.append("staff", getStaffName());
      if (capture) {
        body.append("photo", capture.blob, "inventory.jpg");
        body.append("captured_at", formatTimestampForServer(capture.capturedAt));
      }
      const res = await fetch(`/api/case/${encodeURIComponent(currentCaseCode)}/inventory`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save item");
      lastItems = data.items;
      if (data.sheet_warning) lastWarning = data.sheet_warning;
    }
    renderInventoryList(lastItems);
    inventoryDescription.value = "";
    clearPendingCaptures();
    const savedMsg = toSave.length > 1 ? `${toSave.length} items added.` : "Item added.";
    inventoryStatus.textContent = lastWarning ? `${savedMsg} (${lastWarning})` : savedMsg;
    inventoryStatus.className = "status-msg " + (lastWarning ? "err" : "ok");
  } catch (err) {
    if (lastItems) renderInventoryList(lastItems);
    inventoryStatus.textContent = err.message;
    inventoryStatus.className = "status-msg err";
  } finally {
    addInventoryBtn.disabled = false;
  }
});

// ==================== Documents (face sheets, first call sheets, etc.) ====================
// Same multi-capture camera pattern as Inventory above, just for scanned
// paperwork instead of personal effects -- its own independent
// stream/video/canvas/pending-queue so the two never interfere.
function renderDocumentsList(items) {
  if (items.length === 0) {
    documentsList.innerHTML = `<p style="color:#889; margin:0;">No documents scanned yet.</p>`;
    return;
  }
  documentsList.innerHTML = items
    .map(
      (item) => `
    <div class="inventory-row">
      <img class="inventory-thumb" src="/api/documents/${item.id}/photo" alt="" data-lightbox-src="/api/documents/${item.id}/photo">
      <div class="inventory-info">
        <div>${escapeHtmlLocal(item.doc_type || "(untitled document)")}</div>
        <div style="color:#889; font-size:12.5px;">${escapeHtmlLocal(item.when)}${item.staff ? " — " + escapeHtmlLocal(item.staff) : ""}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <a href="/documents/${item.id}/print" target="_blank" rel="noopener" style="text-align:center; text-decoration:none; padding:8px 12px; background:#263447; color:#cdd; border-radius:6px; font-size:14px;">🖨️ Print</a>
        <button class="document-delete-btn" data-id="${item.id}">Delete</button>
      </div>
    </div>`
    )
    .join("") + (currentCaseCode
      ? `<a href="/case/${encodeURIComponent(currentCaseCode)}/print-documents" target="_blank" rel="noopener" class="secondary-btn" style="display:block; text-decoration:none; text-align:center; margin-top:12px;">🖨️ Print All Documents (Office Printer)</a>`
      : "");

  documentsList.querySelectorAll(".inventory-thumb").forEach((img) => {
    img.addEventListener("click", () => openPhotoLightbox(img.dataset.lightboxSrc));
  });

  documentsList.querySelectorAll(".document-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const docId = btn.dataset.id;
      askConfirm("Delete this document? This can't be undone.", async () => {
        try {
          const res = await fetch(`/api/documents/${docId}/delete`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Delete failed");
          renderDocumentsList(data.items);
        } catch (err) {
          documentsStatus.textContent = err.message;
          documentsStatus.className = "status-msg err";
        }
      });
    });
  });
}

async function loadDocuments(code) {
  try {
    const res = await fetch(`/api/case/${encodeURIComponent(code)}/documents`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't load documents");
    renderDocumentsList(data.items);
  } catch (err) {
    documentsList.innerHTML = "";
    documentsStatus.textContent = err.message;
    documentsStatus.className = "status-msg err";
  }
}

async function startDocumentsCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    documentsStatus.textContent = "Camera not available on this device/browser.";
    documentsStatus.className = "status-msg err";
    return;
  }
  try {
    documentsCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    documentsStatus.textContent = "Camera permission denied or unavailable: " + err.message;
    documentsStatus.className = "status-msg err";
    return;
  }
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  documentsCameraVideo.srcObject = documentsCameraStream;
  documentsCameraVideo.muted = true;
  await documentsCameraVideo.play();
  documentsCameraPanel.classList.remove("hidden");
  documentsCameraBtn.classList.add("hidden");
}

function stopDocumentsCamera() {
  if (documentsCameraStream) {
    documentsCameraStream.getTracks().forEach((t) => t.stop());
    documentsCameraStream = null;
  }
  documentsCameraPanel.classList.add("hidden");
  documentsCameraBtn.classList.remove("hidden");
}

function captureDocumentsPhoto() {
  if (!documentsCameraStream) return;
  playShutterSound();
  const ctx = documentsCameraCanvas.getContext("2d");
  documentsCameraCanvas.width = documentsCameraVideo.videoWidth;
  documentsCameraCanvas.height = documentsCameraVideo.videoHeight;
  ctx.drawImage(documentsCameraVideo, 0, 0, documentsCameraCanvas.width, documentsCameraCanvas.height);
  documentsCameraCanvas.toBlob(
    (blob) => {
      documentsPendingCaptures.push({ blob, url: URL.createObjectURL(blob), capturedAt: new Date() });
      renderDocumentsPendingCaptures();
    },
    "image/jpeg",
    0.85
  );
}

function renderDocumentsPendingCaptures() {
  if (documentsPendingCaptures.length === 0) {
    documentsPendingList.classList.add("hidden");
    documentsPendingList.innerHTML = "";
  } else {
    documentsPendingList.classList.remove("hidden");
    documentsPendingList.innerHTML = documentsPendingCaptures
      .map(
        (c, i) => `
      <div class="inventory-pending-item">
        <img src="${c.url}" alt="Captured document page">
        <div class="pending-time">${c.capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <button type="button" class="pending-remove-btn" data-index="${i}">✕</button>
      </div>`
      )
      .join("");
    documentsPendingList.querySelectorAll(".pending-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.index, 10);
        URL.revokeObjectURL(documentsPendingCaptures[i].url);
        documentsPendingCaptures.splice(i, 1);
        renderDocumentsPendingCaptures();
      });
    });
  }
  addDocumentBtn.textContent = documentsPendingCaptures.length > 1 ? `Add ${documentsPendingCaptures.length} Documents` : "Add Document";
}

function clearDocumentsPendingCaptures() {
  stopDocumentsCamera();
  documentsPendingCaptures.forEach((c) => URL.revokeObjectURL(c.url));
  documentsPendingCaptures = [];
  renderDocumentsPendingCaptures();
}

documentsCameraBtn.addEventListener("click", startDocumentsCamera);
documentsCameraStopBtn.addEventListener("click", stopDocumentsCamera);
documentsCameraVideo.addEventListener("click", captureDocumentsPhoto);

addDocumentBtn.addEventListener("click", async () => {
  if (!currentCaseCode) return;
  const docType = documentsType.value.trim();
  if (documentsPendingCaptures.length === 0) {
    documentsStatus.textContent = "Take at least one photo of the document.";
    documentsStatus.className = "status-msg err";
    return;
  }

  addDocumentBtn.disabled = true;
  const toSave = documentsPendingCaptures.length;
  let lastItems = null;
  try {
    for (let i = 0; i < documentsPendingCaptures.length; i++) {
      const capture = documentsPendingCaptures[i];
      documentsStatus.textContent = toSave > 1 ? `Saving ${i + 1} of ${toSave}...` : "Saving...";
      documentsStatus.className = "status-msg";
      const body = new FormData();
      body.append("doc_type", docType);
      body.append("photo", capture.blob, "document.jpg");
      body.append("captured_at", formatTimestampForServer(capture.capturedAt));
      const res = await fetch(`/api/case/${encodeURIComponent(currentCaseCode)}/documents`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save document");
      lastItems = data.items;
    }
    renderDocumentsList(lastItems);
    documentsType.value = "";
    clearDocumentsPendingCaptures();
    documentsStatus.textContent = toSave > 1 ? `${toSave} documents added.` : "Document added.";
    documentsStatus.className = "status-msg ok";
  } catch (err) {
    if (lastItems) renderDocumentsList(lastItems);
    documentsStatus.textContent = err.message;
    documentsStatus.className = "status-msg err";
  } finally {
    addDocumentBtn.disabled = false;
  }
});

resetFlow();

// Deep link from the spreadsheet's "NO PROPERTY" link in column Q --
// jumps straight into this case's Inventory panel, skipping the home
// screen and a QR scan entirely, so a click from the sheet lands
// directly on "add a photo/description" for that exact case.
(function openPanelDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const openMode = params.get("open");
  const code = params.get("case");
  if (!code || (openMode !== "inventory" && openMode !== "documents")) return;
  mode = openMode;
  homeScreen.classList.add("hidden");
  scanPanel.classList.remove("hidden");
  stepLabel.textContent = openMode === "inventory" ? "Loading inventory..." : "Loading documents...";
  handleCaseScan(`${window.location.origin}/case/${encodeURIComponent(code)}`).catch((err) =>
    showStatus(err.message, false)
  );
})();

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

// Synthesized sounds (Web Audio API) instead of audio files -- keeps this
// fully local/offline like everything else here. Browsers only allow
// audio to start from a real user gesture, so the AudioContext gets
// created/resumed inside each camera's start function
// (startCamera/startInventoryCamera/startDocumentsCamera -- all click
// handlers), not lazily on first use.
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

// Old-camera shutter click for Inventory/Document photo captures (see
// captureInventoryPhoto/captureDocumentsPhoto) -- two short bursts of
// filtered noise (no audio file, synthesized same as playBeep) shaped
// to sound like a mechanical shutter opening then closing, rather than
// an electronic beep, so staff get an unambiguous "photo taken" cue
// instead of tapping repeatedly unsure whether it registered.
function playShutterSound() {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;

    function click(startTime, duration, peakGain, filterFreq) {
      const sampleCount = Math.floor(audioCtx.sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        // Noise burst with a fast decay envelope baked into the samples
        // themselves -- this is what makes it read as a sharp "click"
        // instead of a sustained hiss.
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 3);
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = filterFreq;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(peakGain, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(startTime);
      noise.stop(startTime + duration);
    }

    click(t0, 0.045, 0.6, 2200); // shutter opening -- sharp, bright
    click(t0 + 0.065, 0.035, 0.4, 1200); // shutter closing -- a beat later, softer/lower
  } catch (e) {
    // Audio blocked/unavailable -- capture itself still works fine either way.
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
