function updateClock() {
  document.getElementById("clock").textContent = new Date().toLocaleString();
}
setInterval(updateClock, 1000);
updateClock();

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// created_at is a full "YYYY-MM-DD HH:MM:SS" timestamp -- just the date,
// formatted like the rest of the app (e.g. "8/4/26"), is what's useful here.
function formatDate(datetimeStr) {
  if (!datetimeStr) return "";
  const [y, m, d] = datetimeStr.split(" ")[0].split("-").map(Number);
  if (!y || !m || !d) return datetimeStr;
  return `${m}/${d}/${String(y).slice(2)}`;
}

// Touchscreens on the Pi report as mouse-emulated pointers, so plain CSS
// overflow-y scrolling doesn't respond to a finger drag -- drive scrollTop
// from pointer events instead (same approach the signature pad already
// uses). Skip drag-starts on interactive controls so taps/typing/canvas
// drawing still work normally.
function enableDragScroll(el) {
  let dragging = false;
  let startY = 0;
  let startScrollTop = 0;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("input, select, textarea, button, canvas, a")) return;
    dragging = true;
    startY = e.clientY;
    startScrollTop = el.scrollTop;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    el.scrollTop = startScrollTop - (e.clientY - startY);
  });
  const stopDrag = () => { dragging = false; };
  el.addEventListener("pointerup", stopDrag);
  el.addEventListener("pointercancel", stopDrag);
}
document.querySelectorAll(".detail-card-body, .board-confirm-card").forEach(enableDragScroll);

let latestRows = [];
let currentScreen = null;

function getStaffName() {
  // Server re-derives this from the login session on every write anyway
  // (see app.py) -- this is just for immediate UI text, not the source
  // of truth for who's credited with an action.
  return window.CURRENT_STAFF_NAME || "";
}

// Shared "are you sure?" gate for Release, same treatment it gets on the
// scan station -- it permanently deactivates the tag, so a misclick here
// is much costlier than one on Move or Check Out.
const boardConfirm = document.getElementById("boardConfirm");
const boardConfirmMessage = document.getElementById("boardConfirmMessage");
const boardConfirmYesBtn = document.getElementById("boardConfirmYesBtn");
const boardConfirmNoBtn = document.getElementById("boardConfirmNoBtn");
let pendingBoardConfirm = null;
function askBoardConfirm(message, onConfirm) {
  boardConfirmMessage.textContent = message;
  pendingBoardConfirm = onConfirm;
  boardConfirm.classList.remove("hidden");
}
boardConfirmYesBtn.addEventListener("click", () => {
  boardConfirm.classList.add("hidden");
  const action = pendingBoardConfirm;
  pendingBoardConfirm = null;
  if (action) action();
});
boardConfirmNoBtn.addEventListener("click", () => {
  boardConfirm.classList.add("hidden");
  pendingBoardConfirm = null;
});

const releaseReceiptRow = document.getElementById("releaseReceiptRow");
const releaseReceiptLink = document.getElementById("releaseReceiptLink");

const boardTabs = document.getElementById("boardTabs");
if (boardTabs) {
  const firstTab = boardTabs.querySelector(".board-tab-btn");
  if (firstTab) currentScreen = firstTab.dataset.screen;
  boardTabs.querySelectorAll(".board-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentScreen = btn.dataset.screen;
      boardTabs.querySelectorAll(".board-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      // Deliberately NOT clearing an in-progress move selection here -- a
      // decedent selected on one board (e.g. Cremation Staging) needs to
      // stay selected while switching tabs to tap a destination on a
      // different board (e.g. Metro Coolers).
      renderBoard(latestRows);
    });
  });
}

// ---------------- Touchscreen tap-to-move ----------------
// Off by default so tapping a cell still opens the usual view/edit
// details popup -- toggling this button arms tap-to-move instead: tap an
// occupied shelf to select it, then tap the destination shelf to move it
// there (same /api/move the scan station's Move mode uses).
let moveMode = false;
let moveFromLoc = null; // { location_code, case_code, name }

const moveModeBtn = document.getElementById("moveModeBtn");
const moveStatus = document.getElementById("moveStatus");

function showMoveStatus(text, ok) {
  moveStatus.textContent = text;
  moveStatus.className = "move-status" + (ok ? "" : " err");
  moveStatus.classList.remove("hidden");
}

function resetMoveSelection() {
  moveFromLoc = null;
}

moveModeBtn.addEventListener("click", () => {
  moveMode = !moveMode;
  moveModeBtn.classList.toggle("active", moveMode);
  resetMoveSelection();
  if (moveMode) {
    historyMode = false;
    historyModeBtn.classList.remove("active");
    showMoveStatus("Move mode on -- tap an occupied shelf to move.", true);
  } else {
    moveStatus.classList.add("hidden");
  }
  renderBoard(latestRows);
});

// ---------------- Touchscreen tap-for-history ----------------
// Same idea as Move mode: arm it, then tap a shelf. Instead of selecting
// a source/destination pair, a single tap just pops up that decedent's
// full history (every placed/moved/released/checked-out/checked-in
// event, plus the Prepped/Witness Cremation/ID Viewing/etc. status
// flags from config.CASE_FLAGS) -- a quick way to answer "when did we
// get them, who picked them up, has X happened yet" without opening the
// full edit/move/release popup.
let historyMode = false;
const historyModeBtn = document.getElementById("historyModeBtn");
const historyOverlay = document.getElementById("historyOverlay");
const historyContent = document.getElementById("historyContent");

historyModeBtn.addEventListener("click", () => {
  historyMode = !historyMode;
  historyModeBtn.classList.toggle("active", historyMode);
  if (historyMode) {
    moveMode = false;
    moveModeBtn.classList.remove("active");
    resetMoveSelection();
    showMoveStatus("History mode on -- tap a shelf to view that decedent's history.", true);
  } else {
    moveStatus.classList.add("hidden");
  }
  renderBoard(latestRows);
});

document.getElementById("closeHistory").addEventListener("click", () => {
  historyOverlay.classList.add("hidden");
});

async function handleMoveTap(loc, coolerName, shelfNum, destCell) {
  const where = `${coolerName} — Shelf ${shelfNum}${loc.slot ? loc.slot : ""}`;

  if (!moveFromLoc) {
    if (loc.occupants.length === 0) {
      showMoveStatus("That shelf is empty -- tap an occupied one first.", false);
      return;
    }
    if (loc.occupants.length > 1) {
      showMoveStatus("This location holds multiple decedents -- use the scan station's Move mode for shared locations.", false);
      return;
    }
    const o = loc.occupants[0];
    moveFromLoc = { location_code: loc.location_code, case_code: o.case_code, name: o.name || o.case_code };
    showMoveStatus(`${moveFromLoc.name} selected from ${where}. Tap the destination shelf.`, true);
    renderBoard(latestRows);
    return;
  }

  // A null location_code means this selection came from Check In (see
  // checkedOutList below), not from tapping an occupied shelf -- there's
  // no source shelf to free, so this is a first placement (/api/assign),
  // not a move, and there's no "tap the same cell to cancel" shelf either.
  const isPlacement = !moveFromLoc.location_code;

  if (!isPlacement && loc.location_code === moveFromLoc.location_code) {
    showMoveStatus("Move cancelled.", true);
    resetMoveSelection();
    renderBoard(latestRows);
    return;
  }

  // Instant reassurance that this is the destination -- same yellow
  // outline as the source selection, applied the moment it's tapped
  // rather than waiting on the network round-trip below.
  if (destCell) destCell.classList.add("move-selected");

  try {
    const res = await fetch(isPlacement ? "/api/assign" : "/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_code: moveFromLoc.case_code, location_code: loc.location_code, staff: getStaffName() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Move failed");
    showMoveStatus(`${moveFromLoc.name} ${isPlacement ? "placed" : "moved"} at ${where}.`, true);
    resetMoveSelection();
    poll();
  } catch (err) {
    if (destCell) destCell.classList.remove("move-selected");
    showMoveStatus(err.message, false);
  }
}

// ---------------- Board search ----------------
// Finds a decedent by name or case number across every screen/tab, so
// staff don't have to know which cooler tab someone is on -- useful when
// a funeral home calls asking where a specific decedent currently is.
const boardSearchInput = document.getElementById("boardSearch");
const boardSearchBtn = document.getElementById("boardSearchBtn");
const boardSearchStatus = document.getElementById("boardSearchStatus");

function showSearchStatus(text, ok) {
  boardSearchStatus.textContent = text;
  boardSearchStatus.className = "move-status" + (ok ? "" : " err");
  boardSearchStatus.classList.remove("hidden");
}

function runBoardSearch() {
  const query = boardSearchInput.value.trim().toLowerCase();
  if (!query) return;

  const match = latestRows.find(
    (r) =>
      r.case_code &&
      ((r.name && r.name.toLowerCase().includes(query)) || r.case_code.toLowerCase().includes(query))
  );
  if (!match) {
    showSearchStatus(`No occupied shelf matches "${boardSearchInput.value.trim()}".`, false);
    return;
  }

  showSearchStatus(`Found ${match.name || match.case_code} — ${match.cooler_name}, Shelf ${match.shelf}${match.slot || ""}.`, true);

  if (match.screen !== currentScreen) {
    currentScreen = match.screen;
    boardTabs.querySelectorAll(".board-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.screen === match.screen));
  }
  resetMoveSelection();
  renderBoard(latestRows);

  requestAnimationFrame(() => {
    const cell = document.querySelector(`.slot-cell[data-location="${CSS.escape(match.location_code)}"]`);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
    cell.classList.add("search-highlight");
    setTimeout(() => cell.classList.remove("search-highlight"), 3000);
  });
}

boardSearchBtn.addEventListener("click", runBoardSearch);
boardSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runBoardSearch();
});

// ---------------- Board QR scan ----------------
// Alternative to typing into the search box above -- scan a decedent's
// armband or a shelf's own tag and jump straight to it, same as a typed
// search would (including switching tabs if it's on a different
// screen). /api/board's rows cover every location (occupied or not),
// so a location scan works even for an empty shelf.
const boardScanBtn = document.getElementById("boardScanBtn");
const boardCameraPanel = document.getElementById("boardCameraPanel");
const boardCameraVideo = document.getElementById("boardCameraVideo");
const boardCameraCanvas = document.getElementById("boardCameraCanvas");
const boardCameraStopBtn = document.getElementById("boardCameraStopBtn");
let boardCameraStream = null;
let boardCameraLoopId = null;
let boardCameraCooldown = false;

function normalizeBoardScan(raw) {
  if (raw.startsWith("LOC|")) return { type: "location", code: raw };
  const urlMatch = raw.match(/\/case\/([^/?#]+)\/?$/);
  if (urlMatch) return { type: "case", code: decodeURIComponent(urlMatch[1]) };
  if (raw.startsWith("CASE|")) return { type: "case", code: raw };
  return null;
}

function jumpToBoardRow(matchFn, notFoundMsg) {
  const match = latestRows.find(matchFn);
  if (!match) {
    showSearchStatus(notFoundMsg, false);
    return;
  }
  showSearchStatus(
    `Found ${match.name || match.case_code || match.location_code} — ${match.cooler_name}, Shelf ${match.shelf}${match.slot || ""}.`,
    true
  );
  if (match.screen !== currentScreen) {
    currentScreen = match.screen;
    boardTabs.querySelectorAll(".board-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.screen === match.screen));
  }
  resetMoveSelection();
  renderBoard(latestRows);
  requestAnimationFrame(() => {
    const cell = document.querySelector(`.slot-cell[data-location="${CSS.escape(match.location_code)}"]`);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
    cell.classList.add("search-highlight");
    setTimeout(() => cell.classList.remove("search-highlight"), 3000);
  });
}

async function handleBoardScan(rawCode) {
  const parsed = normalizeBoardScan(rawCode);
  if (!parsed) {
    showSearchStatus("That doesn't look like a Case ID or location QR code.", false);
    return;
  }
  stopBoardCamera();
  if (parsed.type === "location") {
    jumpToBoardRow((r) => r.location_code === parsed.code, `Unknown location: ${parsed.code}`);
  } else {
    jumpToBoardRow((r) => r.case_code === parsed.code, `${parsed.code} isn't currently placed on a shelf.`);
  }
}

async function startBoardCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showSearchStatus("Camera not available on this device/browser.", false);
    return;
  }
  try {
    boardCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    showSearchStatus("Camera permission denied or unavailable: " + err.message, false);
    return;
  }
  boardCameraVideo.srcObject = boardCameraStream;
  boardCameraVideo.muted = true;
  await boardCameraVideo.play();
  boardCameraPanel.classList.remove("hidden");
  boardScanBtn.classList.add("hidden");
  boardCameraLoop();
}

function stopBoardCamera() {
  if (boardCameraLoopId) cancelAnimationFrame(boardCameraLoopId);
  if (boardCameraStream) {
    boardCameraStream.getTracks().forEach((t) => t.stop());
    boardCameraStream = null;
  }
  boardCameraPanel.classList.add("hidden");
  boardScanBtn.classList.remove("hidden");
}

function boardCameraLoop() {
  const ctx = boardCameraCanvas.getContext("2d", { willReadFrequently: true });
  if (boardCameraVideo.readyState === boardCameraVideo.HAVE_ENOUGH_DATA) {
    boardCameraCanvas.width = boardCameraVideo.videoWidth;
    boardCameraCanvas.height = boardCameraVideo.videoHeight;
    ctx.drawImage(boardCameraVideo, 0, 0, boardCameraCanvas.width, boardCameraCanvas.height);
    const imageData = ctx.getImageData(0, 0, boardCameraCanvas.width, boardCameraCanvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (result && result.data && !boardCameraCooldown) {
      boardCameraCooldown = true;
      handleBoardScan(result.data.trim()).finally(() => {
        setTimeout(() => { boardCameraCooldown = false; }, 1500);
      });
    }
  }
  boardCameraLoopId = requestAnimationFrame(boardCameraLoop);
}

boardScanBtn.addEventListener("click", startBoardCamera);
boardCameraStopBtn.addEventListener("click", stopBoardCamera);

function renderBoard(rows) {
  const grid = document.getElementById("grid");
  const byCooler = {};
  const coolerOrder = [];

  const visibleRows = currentScreen ? rows.filter((r) => r.screen === currentScreen) : rows;

  visibleRows.forEach((r) => {
    if (!byCooler[r.cooler_code]) {
      byCooler[r.cooler_code] = { name: r.cooler_name, shelves: {} };
      coolerOrder.push(r.cooler_code);
    }
    const shelves = byCooler[r.cooler_code].shelves;
    shelves[r.shelf] = shelves[r.shelf] || {};
    // Group by location_code, not by raw row -- a shared location can
    // appear as multiple rows (one per occupant); this merges them into
    // a single cell with a list of occupants instead of duplicate cells.
    const loc = shelves[r.shelf][r.location_code] || {
      location_code: r.location_code,
      slot: r.slot,
      shared: !!r.shared,
      occupants: [],
    };
    if (r.case_code) {
      loc.occupants.push({
        case_code: r.case_code,
        name: r.name,
        funeral_home: r.funeral_home,
        pickup_date: r.pickup_date,
        created_at: r.created_at,
      });
    }
    shelves[r.shelf][r.location_code] = loc;
  });

  grid.innerHTML = "";
  coolerOrder.forEach((coolerCode) => {
    const cooler = byCooler[coolerCode];

    const section = document.createElement("div");
    section.className = "cooler-section";

    const title = document.createElement("div");
    title.className = "cooler-title";
    title.textContent = cooler.name;
    section.appendChild(title);

    const shelfGrid = document.createElement("div");
    shelfGrid.className = "shelf-grid";

    Object.keys(cooler.shelves)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((shelfNum) => {
        const locs = Object.values(cooler.shelves[shelfNum]).sort((a, b) =>
          (a.slot || "").localeCompare(b.slot || "")
        );

        const card = document.createElement("div");
        card.className = "shelf-card";

        const shelfLabel = document.createElement("div");
        shelfLabel.className = "shelf-title";
        shelfLabel.textContent = `Shelf ${shelfNum}`;
        card.appendChild(shelfLabel);

        const mini = document.createElement("div");
        mini.className = locs.length > 1 ? "slot-mini-grid" : "slot-mini-grid single";

        locs.forEach((loc) => {
          const cell = document.createElement("div");
          const n = loc.occupants.length;
          cell.className = "slot-cell " + (n > 0 ? "slot-occupied" : "slot-empty");
          const label = loc.slot ? loc.slot : "";
          let bodyHtml;
          if (n === 0) {
            bodyHtml = `<div class="name">empty</div>`;
          } else if (n === 1) {
            const o = loc.occupants[0];
            bodyHtml =
              `<div class="name">${escapeHtml(o.name || o.case_code)}</div>` +
              `<div class="home">${escapeHtml(o.funeral_home || "")}</div>` +
              `<div class="date">${escapeHtml(formatDate(o.created_at))}</div>`;
          } else {
            bodyHtml =
              `<div class="name">${n} occupants</div>` +
              `<div class="home">tap for details</div>`;
          }
          cell.innerHTML = (label ? `<div class="code">${escapeHtml(label)}</div>` : "") + bodyHtml;
          cell.dataset.location = loc.location_code;
          if (moveMode && moveFromLoc && moveFromLoc.location_code === loc.location_code) {
            cell.classList.add("move-selected");
          }
          cell.addEventListener("click", () => {
            if (historyMode) {
              cell.classList.add("search-highlight");
              setTimeout(() => cell.classList.remove("search-highlight"), 1200);
              showHistory(loc, cooler.name, shelfNum);
            } else if (moveMode) {
              handleMoveTap(loc, cooler.name, shelfNum, cell);
            } else {
              showDetail(loc, cooler.name, shelfNum);
            }
          });
          mini.appendChild(cell);
        });

        card.appendChild(mini);
        shelfGrid.appendChild(card);
      });

    section.appendChild(shelfGrid);
    grid.appendChild(section);
  });
}

// Auto-closes the detail popup once someone actually scans the tag it's
// showing -- useful when this board is up on a shared screen and a
// staff member scans the on-screen QR with their own phone instead of
// the physical tag: without this, the popup would just sit there open
// until someone remembers to close it by hand.
let detailPollInterval = null;

function stopDetailScanPoll() {
  if (detailPollInterval) {
    clearInterval(detailPollInterval);
    detailPollInterval = null;
  }
}

async function fetchScanTimestamp(code) {
  try {
    const res = await fetch(`/api/case/${encodeURIComponent(code)}/scan-timestamp`);
    const data = await res.json();
    return data.last_scanned || null;
  } catch (e) {
    return null;
  }
}

async function startDetailScanPoll(caseCodes) {
  if (caseCodes.length === 0) return;
  const baseline = {};
  await Promise.all(caseCodes.map(async (code) => { baseline[code] = await fetchScanTimestamp(code); }));

  detailPollInterval = setInterval(async () => {
    for (const code of caseCodes) {
      const latest = await fetchScanTimestamp(code);
      if (latest && latest !== baseline[code]) {
        stopDetailScanPoll();
        document.getElementById("detail").classList.add("hidden");
        poll();
        return;
      }
    }
  }, 2000);
}

// Auto-closes an EMPTY shelf's detail popup once a decedent actually
// gets placed there -- same idea as startDetailScanPoll above, but
// watches the location itself (there's no case yet to check a scan
// timestamp for) instead of a case code. Also closes on its own after
// a minute even if nothing gets placed, so a shared/TV board display
// never gets stuck showing this popup indefinitely if someone walks
// away without closing it -- safe to do here since there are no
// editable fields to lose, unlike an occupied popup (which never
// auto-closes for exactly that reason -- see startDetailScanPoll).
let locationPollInterval = null;
let locationAutoCloseTimer = null;

function stopLocationPoll() {
  if (locationPollInterval) {
    clearInterval(locationPollInterval);
    locationPollInterval = null;
  }
  if (locationAutoCloseTimer) {
    clearTimeout(locationAutoCloseTimer);
    locationAutoCloseTimer = null;
  }
}

function startLocationPoll(locationCode) {
  locationPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/location/${encodeURIComponent(locationCode)}/lookup`);
      const data = await res.json();
      if (data.occupants && data.occupants.length > 0) {
        stopLocationPoll();
        document.getElementById("detail").classList.add("hidden");
        poll();
      }
    } catch (e) {
      // Transient fetch failure -- just try again next tick.
    }
  }, 2000);
  locationAutoCloseTimer = setTimeout(() => {
    stopLocationPoll();
    document.getElementById("detail").classList.add("hidden");
  }, 60000);
}

function showDetail(loc, coolerName, shelfNum) {
  stopDetailScanPoll();
  stopLocationPoll();
  const overlay = document.getElementById("detail");
  const content = document.getElementById("detailContent");
  const where = `${coolerName} — Shelf ${shelfNum}${loc.slot ? loc.slot : ""}`;

  if (loc.occupants.length === 0) {
    content.innerHTML = `
      <h2>${escapeHtml(where)}</h2>
      <p>Empty</p>
      <div class="case-qr-row">
        <img class="case-qr-thumb" src="/location/${encodeURIComponent(loc.location_code)}/qr.png" alt="QR code for ${escapeHtml(where)}">
        <p class="case-line">${escapeHtml(loc.location_code)}</p>
      </div>
      <p style="color:#aab; font-size:13px; text-align:center; margin-top:8px;">Scan this at the scan station to place a decedent here -- handy if the physical shelf tag isn't reachable.</p>
    `;
  } else {
    const blocks = loc.occupants
      .map((o, i) => {
        const isCremStaging = currentScreen === "Cremation Staging";

        // Cremation Staging is a view-and-act popup, not an edit form --
        // no Save (editing happens on the sheet or scan station), and no
        // Release/Check Out since Cremate is the only exit from here that
        // makes sense; Move to New Location stays in case a decedent needs
        // to go back to a cooler instead. No case-code line either -- just
        // the QR code, so staff don't have to reconcile it with an M26
        // number by eye.
        if (isCremStaging) {
          return `
      <div class="occupant-block">
        <div class="case-qr-row">
          <img class="case-qr-thumb" src="/case/${encodeURIComponent(o.case_code)}/qr.png" alt="QR code for ${escapeHtml(o.name || o.case_code)}">
        </div>
        <p class="case-line"><b>Name:</b> ${escapeHtml(o.name || "—")}</p>
        <p class="case-line"><b>Funeral Home:</b> ${escapeHtml(o.funeral_home || "—")}</p>
        <p class="case-line"><b>Pickup Date:</b> ${escapeHtml(formatDate(o.pickup_date) || "—")}</p>
        <a class="secondary-btn" href="/case/${encodeURIComponent(o.case_code)}/print-cremation-sticker" target="_blank" rel="noopener" style="display:block; text-decoration:none; text-align:center; margin-top:14px;">🖨️ Print Cremation Tag (Office Printer)</a>
        <a class="secondary-btn" href="/case/${encodeURIComponent(o.case_code)}/cremation-tag-image" download style="display:block; text-decoration:none; text-align:center; margin-top:8px;">🖼️ Save as Image (Phone or PDF)</a>
        <div class="cremate-actions" data-case="${escapeHtml(o.case_code)}">
          <button class="cremate-btn" data-case="${escapeHtml(o.case_code)}">🔥 Cremate</button>
        </div>
        <div class="cremate-form-inline hidden" data-case="${escapeHtml(o.case_code)}">
          <label>Disk Number</label>
          <input type="text" class="disk-number-input" data-case="${escapeHtml(o.case_code)}" placeholder="Cremation disk number" inputmode="numeric">
          <button class="confirm-cremate-btn primary-btn" data-case="${escapeHtml(o.case_code)}" style="background:#5c2a2a;">Confirm Cremation</button>
          <button class="cancel-cremate-btn secondary-btn" data-case="${escapeHtml(o.case_code)}">Cancel</button>
        </div>
        <div class="move-actions">
          <button class="move-here-btn" data-case="${escapeHtml(o.case_code)}">📍 Move to New Location</button>
        </div>
      </div>`;
        }

        return `
      <div class="occupant-block">
        <div class="case-qr-row">
          <p class="case-line"><b>Case:</b> ${escapeHtml(o.case_code)}</p>
          <img class="case-qr-thumb" src="/case/${encodeURIComponent(o.case_code)}/qr.png" alt="QR code for ${escapeHtml(o.case_code)}">
        </div>
        <label>Name</label>
        <input type="text" class="edit-name" data-case="${escapeHtml(o.case_code)}" value="${escapeHtml(o.name || "")}">
        <label>Funeral Home</label>
        <input type="text" class="edit-home" data-case="${escapeHtml(o.case_code)}" value="${escapeHtml(o.funeral_home || "")}">
        <label>Pickup Date</label>
        <input type="date" class="edit-date" data-case="${escapeHtml(o.case_code)}" value="${escapeHtml(o.pickup_date || "")}">
        <button class="save-occupant-btn" data-case="${escapeHtml(o.case_code)}" data-index="${i}">Save</button>
        <div class="save-status" data-index="${i}"></div>
        <a class="secondary-btn" href="/case/${encodeURIComponent(o.case_code)}/print" target="_blank" rel="noopener" style="display:block; text-decoration:none; text-align:center; margin-top:14px;">🖨️ Print Tag (Office Printer)</a>
        <a class="secondary-btn" href="/case/${encodeURIComponent(o.case_code)}/print-label" target="_blank" rel="noopener" style="display:block; text-decoration:none; text-align:center; margin-top:8px;">🏷️ Print to Label Printer</a>
        <div class="move-actions">
          <button class="move-here-btn" data-case="${escapeHtml(o.case_code)}">📍 Move to New Location</button>
          <button class="move-staging-btn" data-case="${escapeHtml(o.case_code)}">🔥 Move to Cremation Staging</button>
        </div>
        <div class="cremate-actions" data-case="${escapeHtml(o.case_code)}">
          <button class="cremate-btn" data-case="${escapeHtml(o.case_code)}">🔥 Cremate</button>
        </div>
        <div class="cremate-form-inline hidden" data-case="${escapeHtml(o.case_code)}">
          <label>Disk Number</label>
          <input type="text" class="disk-number-input" data-case="${escapeHtml(o.case_code)}" placeholder="Cremation disk number" inputmode="numeric">
          <button class="confirm-cremate-btn primary-btn" data-case="${escapeHtml(o.case_code)}" style="background:#5c2a2a;">Confirm Cremation</button>
          <button class="cancel-cremate-btn secondary-btn" data-case="${escapeHtml(o.case_code)}">Cancel</button>
        </div>
        <div class="release-actions" data-case="${escapeHtml(o.case_code)}">
          <button class="release-btn" data-case="${escapeHtml(o.case_code)}">📤 Release</button>
          <button class="checkout-btn" data-case="${escapeHtml(o.case_code)}">📦 Check Out</button>
          <a class="inventory-link-btn" href="/scan?open=inventory&case=${encodeURIComponent(o.case_code)}" target="_blank" rel="noopener">🗂️ Inventory</a>
        </div>
        <div class="release-form-inline hidden" data-case="${escapeHtml(o.case_code)}">
          <label>Released To</label>
          <input type="text" class="release-to-input" data-case="${escapeHtml(o.case_code)}" placeholder="Funeral home, transport company, etc.">
          <label>Printed Name (person receiving)</label>
          <input type="text" class="release-name-input" data-case="${escapeHtml(o.case_code)}" placeholder="Print name">
          <label>Signature</label>
          <canvas class="sig-canvas" data-case="${escapeHtml(o.case_code)}" width="500" height="150"></canvas>
          <button type="button" class="clear-sig-btn secondary-btn" data-case="${escapeHtml(o.case_code)}">Clear Signature</button>
          <button class="confirm-release-btn primary-btn" data-case="${escapeHtml(o.case_code)}">Confirm Release</button>
          <button class="cancel-release-btn secondary-btn" data-case="${escapeHtml(o.case_code)}">Cancel</button>
        </div>
        <div class="checkout-form-inline hidden" data-case="${escapeHtml(o.case_code)}">
          <label>Organization</label>
          <input type="text" class="checkout-org-input" data-case="${escapeHtml(o.case_code)}" placeholder="e.g. County Medical Examiner">
          <label>Reason</label>
          <select class="checkout-reason-select" data-case="${escapeHtml(o.case_code)}">
            <option value="Autopsy">Autopsy</option>
            <option value="Organ Donation">Organ Donation</option>
            <option value="Tissue Donation">Tissue Donation</option>
            <option value="Funeral Service">Funeral Service</option>
            <option value="ID Viewing">ID Viewing</option>
            <option value="Other">Other</option>
          </select>
          <button class="confirm-checkout-btn primary-btn" data-case="${escapeHtml(o.case_code)}">Confirm Check Out</button>
          <button class="cancel-checkout-btn secondary-btn" data-case="${escapeHtml(o.case_code)}">Cancel</button>
        </div>
      </div>`;
      })
      .join("");
    content.innerHTML = `<h2>${escapeHtml(where)}${loc.occupants.length > 1 ? ` (${loc.occupants.length} occupants)` : ""}</h2>${blocks}`;

    content.querySelectorAll(".save-occupant-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const caseCode = btn.dataset.case;
        const idx = btn.dataset.index;
        const statusEl = content.querySelector(`.save-status[data-index="${idx}"]`);
        const body = {
          name: content.querySelector(`.edit-name[data-case="${CSS.escape(caseCode)}"]`).value,
          funeral_home: content.querySelector(`.edit-home[data-case="${CSS.escape(caseCode)}"]`).value,
          pickup_date: content.querySelector(`.edit-date[data-case="${CSS.escape(caseCode)}"]`).value,
        };
        btn.disabled = true;
        statusEl.textContent = "Saving...";
        statusEl.className = "save-status";
        try {
          const res = await fetch(`/api/case/${encodeURIComponent(caseCode)}/info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Save failed");
          statusEl.textContent = data.sheet_warning ? `Saved (${data.sheet_warning})` : "Saved.";
          statusEl.className = "save-status " + (data.sheet_warning ? "err" : "ok");
          poll();
        } catch (err) {
          statusEl.textContent = err.message;
          statusEl.className = "save-status err";
        } finally {
          btn.disabled = false;
        }
      });
    });

    content.querySelectorAll(".move-here-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        const occupant = loc.occupants.find((o) => o.case_code === caseCode);
        overlay.classList.add("hidden");
        moveMode = true;
        moveModeBtn.classList.add("active");
        moveFromLoc = {
          location_code: loc.location_code,
          case_code: caseCode,
          name: (occupant && occupant.name) || caseCode,
        };
        showMoveStatus(`${moveFromLoc.name} selected from ${where}. Tap the destination shelf.`, true);
        renderBoard(latestRows);
      });
    });

    content.querySelectorAll(".move-staging-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const caseCode = btn.dataset.case;
        btn.disabled = true;
        try {
          const res = await fetch("/api/move-to-staging", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ case_code: caseCode, staff: getStaffName() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Move failed");
          overlay.classList.add("hidden");
          showMoveStatus(`${occupantNameFor(caseCode, loc)} moved to Cremation Staging (${data.location_code}).`, true);
          poll();
        } catch (err) {
          showMoveStatus(err.message, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    content.querySelectorAll(".cremate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        content.querySelector(`.cremate-actions[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.cremate-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.remove("hidden");
      });
    });

    content.querySelectorAll(".cancel-cremate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        content.querySelector(`.cremate-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.cremate-actions[data-case="${CSS.escape(caseCode)}"]`).classList.remove("hidden");
      });
    });

    content.querySelectorAll(".confirm-cremate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        const name = occupantNameFor(caseCode, loc);
        const diskNumber = content.querySelector(`.disk-number-input[data-case="${CSS.escape(caseCode)}"]`).value.trim();
        askBoardConfirm(
          `Mark ${name} as CREMATED (Final Disposition)? This deactivates the tag and can't be undone.`,
          async () => {
            try {
              const res = await fetch("/api/release", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  case_code: caseCode,
                  cremated: true,
                  staff: getStaffName(),
                  disk_number: diskNumber,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Cremation failed");
              overlay.classList.add("hidden");
              const warning = data.sheet_warning ? ` (${data.sheet_warning})` : "";
              showMoveStatus(`${name} marked as cremated.${warning}`, !data.sheet_warning);
              poll();
            } catch (err) {
              showMoveStatus(err.message, false);
            }
          }
        );
      });
    });

    // Signature capture for each occupant's release form -- same Pointer
    // Events approach as the scan station, just one canvas per occupant
    // instead of a single global one, so a shared location with multiple
    // occupants doesn't have them clobber each other.
    content.querySelectorAll(".sig-canvas").forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvas._hasContent = false;
      let drawing = false;
      function pos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
      }
      canvas.addEventListener("pointerdown", (e) => {
        drawing = true;
        canvas._hasContent = true;
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = pos(e);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
      canvas.addEventListener("pointerup", () => { drawing = false; });
      canvas.addEventListener("pointercancel", () => { drawing = false; });
    });

    content.querySelectorAll(".clear-sig-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const canvas = content.querySelector(`.sig-canvas[data-case="${CSS.escape(btn.dataset.case)}"]`);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas._hasContent = false;
      });
    });

    content.querySelectorAll(".release-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        content.querySelector(`.release-actions[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.release-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.remove("hidden");
      });
    });

    content.querySelectorAll(".checkout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        content.querySelector(`.release-actions[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.checkout-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.remove("hidden");
      });
    });

    content.querySelectorAll(".cancel-release-btn, .cancel-checkout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        content.querySelector(`.release-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.checkout-form-inline[data-case="${CSS.escape(caseCode)}"]`).classList.add("hidden");
        content.querySelector(`.release-actions[data-case="${CSS.escape(caseCode)}"]`).classList.remove("hidden");
      });
    });

    content.querySelectorAll(".confirm-release-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const caseCode = btn.dataset.case;
        const name = occupantNameFor(caseCode, loc);
        const releasedTo = content.querySelector(`.release-to-input[data-case="${CSS.escape(caseCode)}"]`).value.trim();
        const signedName = content.querySelector(`.release-name-input[data-case="${CSS.escape(caseCode)}"]`).value.trim();
        const canvas = content.querySelector(`.sig-canvas[data-case="${CSS.escape(caseCode)}"]`);
        const signature = canvas._hasContent ? canvas.toDataURL("image/png") : null;
        const who = releasedTo || "the party entered above";
        askBoardConfirm(
          `Release ${name} to ${who}? This deactivates the tag and can't be undone.`,
          async () => {
            try {
              const res = await fetch("/api/release", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  case_code: caseCode,
                  released_to: releasedTo,
                  staff: getStaffName(),
                  signed_name: signedName,
                  signature,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Release failed");
              overlay.classList.add("hidden");
              const warning = data.sheet_warning ? ` (${data.sheet_warning})` : "";
              showMoveStatus(`${name} released.${warning}`, !data.sheet_warning);
              releaseReceiptLink.href = `/case/${encodeURIComponent(caseCode)}/release-form`;
              releaseReceiptRow.classList.remove("hidden");
              poll();
            } catch (err) {
              showMoveStatus(err.message, false);
            }
          }
        );
      });
    });

    content.querySelectorAll(".confirm-checkout-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const caseCode = btn.dataset.case;
        const name = occupantNameFor(caseCode, loc);
        const org = content.querySelector(`.checkout-org-input[data-case="${CSS.escape(caseCode)}"]`).value.trim();
        const reason = content.querySelector(`.checkout-reason-select[data-case="${CSS.escape(caseCode)}"]`).value;
        btn.disabled = true;
        try {
          const res = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ case_code: caseCode, organization: org, reason, staff: getStaffName() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Check out failed");
          overlay.classList.add("hidden");
          const warning = data.sheet_warning ? ` (${data.sheet_warning})` : "";
          showMoveStatus(`${name} checked out.${warning}`, !data.sheet_warning);
          poll();
        } catch (err) {
          showMoveStatus(err.message, false);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }
  overlay.classList.remove("hidden");
  if (loc.occupants.length === 0) {
    startLocationPoll(loc.location_code);
  } else {
    startDetailScanPoll(loc.occupants.map((o) => o.case_code));
  }
}

function occupantNameFor(caseCode, loc) {
  const o = loc.occupants.find((occ) => occ.case_code === caseCode);
  return (o && o.name) || caseCode;
}
document.getElementById("closeDetail").addEventListener("click", () => {
  stopDetailScanPoll();
  stopLocationPoll();
  document.getElementById("detail").classList.add("hidden");
});

// ---------------- History popup ----------------
function renderHistoryBlock(caseCode, name, data) {
  const flagRows = data.flags
    .map(({ flag, value }) => {
      const yesClass = value === true ? "active-yes" : "";
      const noClass = value === false ? "active-no" : "";
      return `
        <div class="history-flag-row">
          <span>${escapeHtml(flag)}</span>
          <div class="history-flag-btns">
            <button class="flag-toggle-btn ${yesClass}" data-case="${escapeHtml(caseCode)}" data-flag="${escapeHtml(flag)}" data-value="1">Yes</button>
            <button class="flag-toggle-btn ${noClass}" data-case="${escapeHtml(caseCode)}" data-flag="${escapeHtml(flag)}" data-value="0">No</button>
          </div>
        </div>`;
    })
    .join("");

  const historyRows = data.history.length
    ? data.history
        .map(
          (h) => `
        <div class="history-row">
          <span class="history-when">${escapeHtml(h.when)}</span>
          <span class="history-desc">${escapeHtml(h.description)}</span>
        </div>`
        )
        .join("")
    : `<p style="color:#889; margin:0;">No history yet.</p>`;

  return `
    <div class="occupant-block" data-history-case="${escapeHtml(caseCode)}">
      <h3 style="margin-top:0;">${escapeHtml(name || caseCode)}</h3>
      <div class="case-qr-row">
        <p class="case-line"><b>Case:</b> ${escapeHtml(caseCode)}</p>
        <img class="case-qr-thumb" src="/case/${encodeURIComponent(caseCode)}/qr.png" alt="QR code for ${escapeHtml(caseCode)}">
      </div>
      ${currentScreen === "Cremation Staging" ? `
      <a class="secondary-btn" href="/case/${encodeURIComponent(caseCode)}/print-cremation-sticker" target="_blank" rel="noopener" style="display:block; text-decoration:none; text-align:center; margin-top:4px;">🖨️ Print Cremation Tag (Office Printer)</a>
      ` : ""}
      <div class="history-flags">${flagRows}</div>
      <h3>History</h3>
      <div class="history-list">${historyRows}</div>
    </div>`;
}

async function showHistory(loc, coolerName, shelfNum) {
  const overlay = historyOverlay;
  const content = historyContent;
  const where = `${coolerName} — Shelf ${shelfNum}${loc.slot ? loc.slot : ""}`;

  if (loc.occupants.length === 0) {
    content.innerHTML = `<h2>${escapeHtml(where)}</h2><p>Empty</p>`;
    overlay.classList.remove("hidden");
    return;
  }

  content.innerHTML = `<h2>${escapeHtml(where)}</h2><p style="color:#889;">Loading history...</p>`;
  overlay.classList.remove("hidden");

  const results = await Promise.all(
    loc.occupants.map((o) =>
      fetch(`/api/case/${encodeURIComponent(o.case_code)}/history`).then((r) => r.json())
    )
  );

  content.innerHTML =
    `<h2>${escapeHtml(where)}</h2>` +
    results.map((data, i) => renderHistoryBlock(loc.occupants[i].case_code, data.name, data)).join("");

  wireFlagButtons(content, loc);
}

// Delegated on `content` itself (rather than bound per-button) so
// re-rendering one occupant's block after a toggle -- which replaces
// that block's markup wholesale -- never leaves stale/missing listeners
// on the buttons inside it.
function wireFlagButtons(content, loc) {
  if (content._flagClickWired) return;
  content._flagClickWired = true;
  content.addEventListener("click", async (e) => {
    const btn = e.target.closest(".flag-toggle-btn");
    if (!btn || !content.contains(btn)) return;
    const caseCode = btn.dataset.case;
    const flag = btn.dataset.flag;
    const value = btn.dataset.value === "1";
    btn.disabled = true;
    try {
      const res = await fetch(`/api/case/${encodeURIComponent(caseCode)}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag, value, staff: getStaffName() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update status");
      const block = content.querySelector(`.occupant-block[data-history-case="${CSS.escape(caseCode)}"]`);
      const name = occupantNameFor(caseCode, loc);
      block.outerHTML = renderHistoryBlock(caseCode, name, data);
    } catch (err) {
      showMoveStatus(err.message, false);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------- Checked-out list / Check In ----------------
// Checked-out decedents hold no shelf/slot, so they never appear in the
// grid above -- this is their only presence on the board until they're
// checked back in.
const checkedOutPanel = document.getElementById("checkedOutPanel");
const checkedOutList = document.getElementById("checkedOutList");

function renderCheckedOut(rows) {
  if (rows.length === 0) {
    checkedOutPanel.classList.add("hidden");
    checkedOutList.innerHTML = "";
    return;
  }
  checkedOutPanel.classList.remove("hidden");
  checkedOutList.innerHTML = rows
    .map((r) => {
      const since = r.checked_out_at ? formatDate(r.checked_out_at) : "";
      const meta = `${escapeHtml(r.checkout_org || "?")}${r.checkout_reason ? ` (${escapeHtml(r.checkout_reason)})` : ""}${since ? ` since ${since}` : ""}`;
      return `
        <div class="checked-out-row">
          <div class="checked-out-info">
            <b>${escapeHtml(r.name || r.case_code)}</b> — ${escapeHtml(r.case_code)}<br>
            <span class="checked-out-meta">${meta}</span>
          </div>
          <button class="checkin-btn" data-case="${escapeHtml(r.case_code)}" data-name="${escapeHtml(r.name || r.case_code)}">📥 Check In</button>
        </div>`;
    })
    .join("");

  checkedOutList.querySelectorAll(".checkin-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const caseCode = btn.dataset.case;
      const name = btn.dataset.name;
      btn.disabled = true;
      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_code: caseCode, staff: getStaffName() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Check in failed");
        // No shelf to free/select a "from" -- the next shelf tapped is
        // where this decedent gets placed (see the isPlacement branch in
        // handleMoveTap), same as a first Assign.
        moveMode = true;
        moveModeBtn.classList.add("active");
        moveFromLoc = { location_code: null, case_code: caseCode, name };
        showMoveStatus(`${name} checked in. Tap a shelf to place.`, true);
        pollCheckedOut();
        renderBoard(latestRows);
      } catch (err) {
        showMoveStatus(err.message, false);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function pollCheckedOut() {
  try {
    const res = await fetch("/api/checked-out");
    const rows = await res.json();
    renderCheckedOut(rows);
  } catch (e) {
    console.error("checked-out poll failed", e);
  }
}

async function poll() {
  try {
    const res = await fetch("/api/board");
    const rows = await res.json();
    latestRows = rows;
    renderBoard(rows);
  } catch (e) {
    console.error("board poll failed", e);
  }
  pollCheckedOut();
}
poll();
setInterval(poll, 3000);
