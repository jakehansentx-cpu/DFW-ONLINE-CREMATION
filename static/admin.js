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
