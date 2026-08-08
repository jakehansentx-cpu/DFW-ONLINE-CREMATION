function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

let users = window.INITIAL_USERS || [];

const userList = document.getElementById("userList");
const addUserBtn = document.getElementById("addUserBtn");
const newUsername = document.getElementById("newUsername");
const newUserAdmin = document.getElementById("newUserAdmin");
const addUserStatus = document.getElementById("addUserStatus");
const historyOverlay = document.getElementById("historyOverlay");
const historyContent = document.getElementById("historyContent");

document.getElementById("closeHistory").addEventListener("click", () => {
  historyOverlay.classList.add("hidden");
});

function renderUsers() {
  userList.innerHTML = users
    .map((u) => {
      const badges = [
        u.is_admin ? '<span style="color:#f0b74f;">Admin</span>' : "",
        !u.active ? '<span style="color:#ff9d9d;">Disabled</span>' : "",
        u.must_change_password ? '<span style="color:#889;">Password not yet set</span>' : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const lastLogin = u.last_login_at ? `Last login: ${escapeHtml(u.last_login_at)}` : "Never logged in";
      return `
        <div class="inventory-row" data-user-id="${u.id}" style="align-items:flex-start;">
          <div class="inventory-info" style="flex:1;">
            <div><b>${escapeHtml(u.username)}</b>${badges ? " — " + badges : ""}</div>
            <div class="history-when">${lastLogin}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
              <button class="secondary-btn toggle-active-btn" data-id="${u.id}" style="width:auto; padding:8px 12px;">${u.active ? "Disable" : "Enable"}</button>
              <button class="secondary-btn toggle-admin-btn" data-id="${u.id}" style="width:auto; padding:8px 12px;">${u.is_admin ? "Remove Admin" : "Make Admin"}</button>
              <button class="secondary-btn reset-password-btn" data-id="${u.id}" style="width:auto; padding:8px 12px;">Reset Password</button>
              <button class="secondary-btn view-history-btn" data-id="${u.id}" style="width:auto; padding:8px 12px;">View History</button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  userList.querySelectorAll(".toggle-active-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleUser(btn.dataset.id, "toggle-active"));
  });
  userList.querySelectorAll(".toggle-admin-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleUser(btn.dataset.id, "toggle-admin"));
  });
  userList.querySelectorAll(".reset-password-btn").forEach((btn) => {
    btn.addEventListener("click", () => resetPassword(btn.dataset.id));
  });
  userList.querySelectorAll(".view-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => viewHistory(btn.dataset.id));
  });
}

async function toggleUser(id, action) {
  try {
    const res = await fetch(`/admin/users/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    const user = users.find((u) => String(u.id) === String(id));
    if (action === "toggle-active") user.active = data.active;
    if (action === "toggle-admin") user.is_admin = data.is_admin;
    renderUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function resetPassword(id) {
  const user = users.find((u) => String(u.id) === String(id));
  if (!confirm(`Reset ${user.username}'s password to a temporary one? They'll be asked to set a new one at next login.`)) return;
  try {
    const res = await fetch(`/admin/users/${id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    user.must_change_password = true;
    renderUsers();
    alert(`${user.username}'s temporary password is: ${data.temp_password}`);
  } catch (err) {
    alert(err.message);
  }
}

async function viewHistory(id) {
  const user = users.find((u) => String(u.id) === String(id));
  historyContent.innerHTML = `<h2>${escapeHtml(user.username)}</h2><p style="color:#889;">Loading history...</p>`;
  historyOverlay.classList.remove("hidden");
  try {
    const res = await fetch(`/admin/users/${id}/history`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't load history");
    const rows = data.history.length
      ? data.history
          .map(
            (h) => `
        <div class="history-row">
          <span class="history-when">${escapeHtml(h.when)}</span>
          <span class="history-desc">${escapeHtml(h.description)}</span>
        </div>`
          )
          .join("")
      : `<p style="color:#889; margin:0;">No recorded actions yet.</p>`;
    historyContent.innerHTML = `<h2>${escapeHtml(data.username)}</h2><div class="history-list">${rows}</div>`;
  } catch (err) {
    historyContent.innerHTML = `<h2>${escapeHtml(user.username)}</h2><p class="status-msg err">${escapeHtml(err.message)}</p>`;
  }
}

addUserBtn.addEventListener("click", async () => {
  const username = newUsername.value.trim();
  if (!username) {
    addUserStatus.textContent = "Enter a name.";
    addUserStatus.className = "status-msg err";
    return;
  }
  addUserBtn.disabled = true;
  try {
    const res = await fetch("/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, is_admin: newUserAdmin.checked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't add staff");
    users.push({
      id: data.id || Date.now(),
      username,
      is_admin: newUserAdmin.checked,
      active: true,
      must_change_password: true,
      last_login_at: null,
    });
    renderUsers();
    newUsername.value = "";
    newUserAdmin.checked = false;
    addUserStatus.textContent = `Added. Temporary password: ${data.temp_password}`;
    addUserStatus.className = "status-msg ok";
  } catch (err) {
    addUserStatus.textContent = err.message;
    addUserStatus.className = "status-msg err";
  } finally {
    addUserBtn.disabled = false;
  }
});

renderUsers();

// ---------------- Monthly spreadsheet ----------------
// A new call log spreadsheet gets generated every month. New intakes
// auto-adopt it on their own the moment anyone actually pulls a new case
// number (see _maybe_auto_adopt_new_month_sheet in app.py) -- this panel
// is only needed as a manual fallback if that automation didn't run or
// the new sheet's share step failed for some reason.
const sheetPanel = document.getElementById("sheetPanel");
const sheetPanelMsg = document.getElementById("sheetPanelMsg");
const sheetUrlInput = document.getElementById("sheetUrlInput");
const sheetSetBtn = document.getElementById("sheetSetBtn");
const sheetSetStatus = document.getElementById("sheetSetStatus");

sheetSetBtn.addEventListener("click", async () => {
  sheetSetStatus.textContent = "Checking access...";
  sheetSetStatus.className = "status-msg";
  sheetSetBtn.disabled = true;
  try {
    const res = await fetch("/api/settings/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sheetUrlInput.value }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Couldn't save that spreadsheet");
    sheetSetStatus.textContent = `Saved. New intakes now go to "${result.label}".`;
    sheetSetStatus.className = "status-msg ok";
    sheetUrlInput.value = "";
    sheetPanel.classList.remove("attention");
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
      sheetPanelMsg.textContent = `Currently set to "${data.current_sheet_label}" (auto-detected). Paste a new link below if you ever need to switch it manually.`;
    } else if (data.needs_new_sheet) {
      sheetPanel.classList.add("attention");
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

// ---------------- Disposition options ----------------
// Feeds the <datalist> suggestions on the Disposition field in the scan
// app (see loadDispositionSuggestions in scan.js) -- the field itself
// stays free-text, so this list is just the common ones worth offering.
let dispositions = window.INITIAL_DISPOSITIONS || [];

const dispositionList = document.getElementById("dispositionList");
const newDisposition = document.getElementById("newDisposition");
const addDispositionBtn = document.getElementById("addDispositionBtn");
const addDispositionStatus = document.getElementById("addDispositionStatus");

function renderDispositions() {
  dispositionList.innerHTML = dispositions
    .map(
      (d) => `
        <div class="inventory-row" data-disposition-id="${d.id}">
          <div class="inventory-info" style="flex:1;">${escapeHtml(d.label)}</div>
          <button class="secondary-btn remove-disposition-btn" data-id="${d.id}" style="width:auto; padding:8px 12px;">Remove</button>
        </div>`
    )
    .join("");

  dispositionList.querySelectorAll(".remove-disposition-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeDisposition(btn.dataset.id));
  });
}

async function removeDisposition(id) {
  const d = dispositions.find((x) => String(x.id) === String(id));
  if (!d || !confirm(`Remove "${d.label}" from the disposition list?`)) return;
  try {
    const res = await fetch(`/admin/dispositions/${id}/delete`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't remove it");
    dispositions = dispositions.filter((x) => String(x.id) !== String(id));
    renderDispositions();
  } catch (err) {
    alert(err.message);
  }
}

addDispositionBtn.addEventListener("click", async () => {
  const label = newDisposition.value.trim();
  if (!label) {
    addDispositionStatus.textContent = "Enter a disposition.";
    addDispositionStatus.className = "status-msg err";
    return;
  }
  addDispositionBtn.disabled = true;
  try {
    const res = await fetch("/admin/dispositions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't add that disposition");
    dispositions.push({ id: data.id, label: data.label });
    renderDispositions();
    newDisposition.value = "";
    addDispositionStatus.textContent = "Added.";
    addDispositionStatus.className = "status-msg ok";
  } catch (err) {
    addDispositionStatus.textContent = err.message;
    addDispositionStatus.className = "status-msg err";
  } finally {
    addDispositionBtn.disabled = false;
  }
});

renderDispositions();

// ---------------- Repair inventory column (Q) ----------------
const repairInventoryBtn = document.getElementById("repairInventoryBtn");
const repairInventoryStatus = document.getElementById("repairInventoryStatus");

repairInventoryBtn.addEventListener("click", async () => {
  repairInventoryBtn.disabled = true;
  repairInventoryStatus.textContent = "Checking every case against the sheet -- this can take a bit...";
  repairInventoryStatus.className = "status-msg";
  try {
    const res = await fetch("/admin/repair-inventory-column", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Repair failed");
    const errorNote = data.errors.length ? ` (${data.errors.length} row(s) couldn't be checked)` : "";
    repairInventoryStatus.textContent = `Checked ${data.checked} case(s), fixed ${data.fixed}.${errorNote}`;
    repairInventoryStatus.className = "status-msg ok";
  } catch (err) {
    repairInventoryStatus.textContent = err.message;
    repairInventoryStatus.className = "status-msg err";
  } finally {
    repairInventoryBtn.disabled = false;
  }
});
