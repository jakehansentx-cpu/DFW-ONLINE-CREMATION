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

let latestRows = [];
let currentScreen = null;

const boardTabs = document.getElementById("boardTabs");
if (boardTabs) {
  const firstTab = boardTabs.querySelector(".board-tab-btn");
  if (firstTab) currentScreen = firstTab.dataset.screen;
  boardTabs.querySelectorAll(".board-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentScreen = btn.dataset.screen;
      boardTabs.querySelectorAll(".board-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      resetMoveSelection();
      if (moveMode) moveStatus.classList.add("hidden");
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
    showMoveStatus("Move mode on -- tap an occupied shelf to move.", true);
  } else {
    moveStatus.classList.add("hidden");
  }
  renderBoard(latestRows);
});

async function handleMoveTap(loc, coolerName, shelfNum) {
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

  if (loc.location_code === moveFromLoc.location_code) {
    showMoveStatus("Move cancelled.", true);
    resetMoveSelection();
    renderBoard(latestRows);
    return;
  }

  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_code: moveFromLoc.case_code, location_code: loc.location_code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Move failed");
    showMoveStatus(`${moveFromLoc.name} moved to ${where}.`, true);
    resetMoveSelection();
    poll();
  } catch (err) {
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
            if (moveMode) {
              handleMoveTap(loc, cooler.name, shelfNum);
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

function showDetail(loc, coolerName, shelfNum) {
  const overlay = document.getElementById("detail");
  const content = document.getElementById("detailContent");
  const where = `${coolerName} — Shelf ${shelfNum}${loc.slot ? loc.slot : ""}`;

  if (loc.occupants.length === 0) {
    content.innerHTML = `<h2>${escapeHtml(where)}</h2><p>Empty</p>`;
  } else {
    const blocks = loc.occupants
      .map(
        (o, i) => `
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
      </div>`
      )
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
  }
  overlay.classList.remove("hidden");
}
document.getElementById("closeDetail").addEventListener("click", () => {
  document.getElementById("detail").classList.add("hidden");
});

async function poll() {
  try {
    const res = await fetch("/api/board");
    const rows = await res.json();
    latestRows = rows;
    renderBoard(rows);
  } catch (e) {
    console.error("board poll failed", e);
  }
}
poll();
setInterval(poll, 3000);
