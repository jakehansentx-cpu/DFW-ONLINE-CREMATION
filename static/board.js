function updateClock() {
  document.getElementById("clock").textContent = new Date().toLocaleString();
}
setInterval(updateClock, 1000);
updateClock();

function renderBoard(rows) {
  const grid = document.getElementById("grid");
  const byCooler = {};
  const coolerOrder = [];

  rows.forEach((r) => {
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
            bodyHtml = `<div class="name">${loc.occupants[0].name || loc.occupants[0].case_code}</div>`;
          } else {
            bodyHtml = `<div class="name">${n} occupants</div>`;
          }
          cell.innerHTML = (label ? `<div class="code">${label}</div>` : "") + bodyHtml;
          cell.addEventListener("click", () => showDetail(loc, cooler.name, shelfNum));
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
    content.innerHTML = `<h2>${where}</h2><p>Empty</p>`;
  } else {
    const cards = loc.occupants
      .map(
        (o) => `
      <div style="border-top:1px solid #333; padding-top:10px; margin-top:10px;">
        <p><b>Case:</b> ${o.case_code}</p>
        <p><b>Name:</b> ${o.name || "—"}</p>
        <p><b>Funeral Home:</b> ${o.funeral_home || "—"}</p>
        <p><b>Pickup Date:</b> ${o.pickup_date || "—"}</p>
      </div>`
      )
      .join("");
    content.innerHTML = `<h2>${where}${loc.occupants.length > 1 ? ` (${loc.occupants.length} occupants)` : ""}</h2>${cards}`;
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
    renderBoard(rows);
  } catch (e) {
    console.error("board poll failed", e);
  }
}
poll();
setInterval(poll, 3000);
