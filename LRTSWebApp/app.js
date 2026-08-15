// Batch state + UI wiring for the Metro desktop certificate/sticker maker.
// Everything lives in memory plus a localStorage mirror (so an accidental
// tab close doesn't lose an in-progress batch) - there is no server and
// nothing leaves this machine.

const STORAGE_KEY = "lrts-batch-v1";

let cases = [];
let editingId = null;

// Positions (1-6) on the FIRST physical Avery 8464 sheet that already have
// a label stuck to them - set by clicking the sheet-layout grid before
// printing stickers, so a partially-used sheet can be finished off instead
// of wasted. Not persisted across reloads; it describes whatever physical
// sheet is currently in the printer, not a saved preference.
let skippedSheetPositions = new Set();

function loadBatch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cases = JSON.parse(raw);
  } catch (error) {
    cases = [];
  }
}

function saveBatch() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

function fullName(c) {
  return [c.first, c.middle, c.last, c.suffix].filter((p) => cleanText(p) !== "").join(" ");
}

function el(id) {
  return document.getElementById(id);
}

function populateProfileSelect() {
  const select = el("profileSelect");
  select.innerHTML = "";
  for (const p of PROFILES) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.cityState ? `${p.funeralHome} — ${p.cityState}` : p.funeralHome;
    select.appendChild(opt);
  }
}

function readForm() {
  const profileId = el("profileSelect").value;
  const profile = findProfile(profileId);
  return {
    id: editingId || `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    first: el("firstName").value,
    middle: el("middleName").value,
    last: el("lastName").value,
    suffix: el("suffixName").value,
    cremationDate: el("cremationDate").value,
    discId: el("discId").value,
    profileId,
    labelQuantity: parseInt(el("labelQuantity").value, 10) || 1,
  };
}

function clearForm() {
  el("firstName").value = "";
  el("middleName").value = "";
  el("lastName").value = "";
  el("suffixName").value = "";
  el("cremationDate").value = "";
  el("discId").value = "";
  editingId = null;
  el("addButton").textContent = "Add to batch";
  updateLabelQuantityDefault();
}

function updateLabelQuantityDefault() {
  // Sticker quantity always starts at 1, regardless of funeral home -
  // no longer varies per profile.
  if (!editingId) {
    el("labelQuantity").value = 1;
  }
}

function validateForm(data) {
  const missing = [];
  if (cleanText(data.first) === "") missing.push("First name");
  if (cleanText(data.last) === "") missing.push("Last name");
  if (cleanText(data.cremationDate) === "") missing.push("Date of cremation");
  if (cleanText(data.discId) === "") missing.push("I.D. disc number");
  return missing;
}

function addOrUpdateCase() {
  const data = readForm();
  const missing = validateForm(data);
  if (missing.length > 0) {
    showStatus(`Missing: ${missing.join(", ")}`, true);
    return;
  }
  const existingIndex = cases.findIndex((c) => c.id === data.id);
  if (existingIndex >= 0) {
    cases[existingIndex] = data;
  } else {
    cases.push(data);
  }
  saveBatch();
  clearForm();
  renderBatch();
  showStatus(existingIndex >= 0 ? "Case updated." : "Added to batch.", false);
}

function editCase(id) {
  const c = cases.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  el("firstName").value = c.first;
  el("middleName").value = c.middle;
  el("lastName").value = c.last;
  el("suffixName").value = c.suffix;
  el("cremationDate").value = c.cremationDate;
  el("discId").value = c.discId;
  el("profileSelect").value = c.profileId;
  el("labelQuantity").value = c.labelQuantity;
  el("addButton").textContent = "Save changes";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function removeCase(id) {
  cases = cases.filter((c) => c.id !== id);
  saveBatch();
  renderBatch();
}

function renderBatch() {
  const tbody = el("batchTableBody");
  tbody.innerHTML = "";
  el("batchCount").textContent = cases.length;
  el("printCertsBtn").disabled = cases.length === 0;
  el("printLabelsBtn").disabled = cases.length === 0;

  for (const c of cases) {
    const profile = findProfile(c.profileId);
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = fullName(c);
    tr.appendChild(nameTd);

    const dateTd = document.createElement("td");
    dateTd.textContent = prettyDate(c.cremationDate);
    tr.appendChild(dateTd);

    const discTd = document.createElement("td");
    discTd.textContent = c.discId;
    tr.appendChild(discTd);

    const homeTd = document.createElement("td");
    homeTd.textContent = profile ? profile.funeralHome : "(unknown profile)";
    tr.appendChild(homeTd);

    const qtyTd = document.createElement("td");
    qtyTd.textContent = c.labelQuantity;
    tr.appendChild(qtyTd);

    const actionsTd = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "linkButton";
    editBtn.onclick = () => editCase(c.id);
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.className = "linkButton danger";
    removeBtn.onclick = () => removeCase(c.id);
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(removeBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  }
}

function showStatus(message, isError) {
  const box = el("statusBox");
  box.textContent = message;
  box.className = isError ? "status error" : "status ok";
  box.style.display = "block";
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { box.style.display = "none"; }, 4000);
}

function openPdfBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Popup blocked - fall back to a direct download so nothing is lost.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
}

// buildCertificatePdf/buildLabelsPdf (pdfgen.js) both expect a single
// decedentName string per case; the batch list stores first/middle/last/
// suffix separately (matching the form fields), so every call into pdfgen.js
// needs to go through this mapping first.
function withDecedentName(c) {
  return { ...c, decedentName: fullName(c) };
}

async function printAllCertificates() {
  if (cases.length === 0) return;
  try {
    showStatus("Building certificates...", false);
    const bytes = await buildCertificatePdf(cases.map(withDecedentName));
    openPdfBlob(bytes, `certificates-${Date.now()}.pdf`);
    showStatus(`Opened ${cases.length} certificate(s) - use your browser's Print button.`, false);
  } catch (error) {
    showStatus(error.message || String(error), true);
  }
}

async function printAllLabels() {
  if (cases.length === 0) return;
  try {
    showStatus("Building sticker sheets...", false);
    const casesWithProfiles = cases.map((c) => withDecedentName({ ...c, profile: findProfile(c.profileId) || {} }));
    const bytes = await buildLabelsPdf(casesWithProfiles, skippedSheetPositions);
    openPdfBlob(bytes, `stickers-${Date.now()}.pdf`);
    showStatus("Opened sticker sheet(s) - use your browser's Print button.", false);
  } catch (error) {
    showStatus(error.message || String(error), true);
  }
}

function renderSheetGrid() {
  document.querySelectorAll("#sheetGrid .sheetCell").forEach((cell) => {
    const position = parseInt(cell.dataset.position, 10);
    cell.classList.toggle("used", skippedSheetPositions.has(position));
    cell.setAttribute("aria-pressed", skippedSheetPositions.has(position) ? "true" : "false");
  });
}

function toggleSheetPosition(position) {
  if (skippedSheetPositions.has(position)) {
    skippedSheetPositions.delete(position);
  } else {
    skippedSheetPositions.add(position);
  }
  renderSheetGrid();
}

function resetSheetLayout() {
  skippedSheetPositions.clear();
  renderSheetGrid();
}

function clearWholeBatch() {
  if (cases.length === 0) return;
  if (!confirm(`Remove all ${cases.length} case(s) from the batch? This cannot be undone.`)) return;
  cases = [];
  saveBatch();
  renderBatch();
}

function init() {
  populateProfileSelect();
  loadBatch();
  renderBatch();
  updateLabelQuantityDefault();

  el("profileSelect").addEventListener("change", updateLabelQuantityDefault);
  el("addButton").addEventListener("click", addOrUpdateCase);
  el("cancelEditButton").addEventListener("click", clearForm);
  el("printCertsBtn").addEventListener("click", printAllCertificates);
  el("printLabelsBtn").addEventListener("click", printAllLabels);
  el("clearBatchBtn").addEventListener("click", clearWholeBatch);

  document.querySelectorAll("#sheetGrid .sheetCell").forEach((cell) => {
    cell.addEventListener("click", () => toggleSheetPosition(parseInt(cell.dataset.position, 10)));
  });
  el("resetSheetLayoutBtn").addEventListener("click", resetSheetLayout);
  renderSheetGrid();
}

document.addEventListener("DOMContentLoaded", init);
