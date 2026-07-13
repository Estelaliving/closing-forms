const { houses, developmentNames } = window.HousesData;

function fmtDate(iso) {
  if (!iso) return "No date set";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status) {
  if (status === "completed") return "is-done";
  if (status === "in_progress") return "is-progress";
  return "";
}
function statusLabel(status, name) {
  if (status === "completed") return "✓ " + name;
  if (status === "in_progress") return "◐ " + name;
  return name;
}

// Populate Development / Model filter dropdowns from whatever's actually in the data.
function populateFilterOptions() {
  const devSelect = document.getElementById("filterDev");
  const devs = [...new Set(houses.map(h => h.dev))].sort((a, b) =>
    (developmentNames[a] || a).localeCompare(developmentNames[b] || b));
  devs.forEach(dev => {
    const opt = document.createElement("option");
    opt.value = dev;
    opt.textContent = developmentNames[dev] || dev;
    devSelect.appendChild(opt);
  });

  const modelSelect = document.getElementById("filterModel");
  const models = [...new Set(houses.map(h => h.model))].sort();
  models.forEach(model => {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model;
    modelSelect.appendChild(opt);
  });
}

function getFilters() {
  return {
    text: document.getElementById("search").value.trim().toLowerCase(),
    dev: document.getElementById("filterDev").value,
    model: document.getElementById("filterModel").value,
    dateFrom: document.getElementById("filterDateFrom").value,
    dateTo: document.getElementById("filterDateTo").value,
    sortBy: document.getElementById("sortBy").value,
    sortDir: document.getElementById("sortDir").value,
    viewMode: document.getElementById("viewMode").value
  };
}

function applyFilters(list, f) {
  return list.filter(h => {
    if (f.text) {
      const hay = (h.address + " " + h.buyer + " " + h.houseNumber).toLowerCase();
      if (!hay.includes(f.text)) return false;
    }
    if (f.dev && h.dev !== f.dev) return false;
    if (f.model && h.model !== f.model) return false;
    if (f.dateFrom && (!h.settDate || h.settDate < f.dateFrom)) return false;
    if (f.dateTo && (!h.settDate || h.settDate > f.dateTo)) return false;
    return true;
  });
}

function sortValue(h, key) {
  if (key === "settDate") return h.settDate || "9999-99-99";
  if (key === "dev") return developmentNames[h.dev] || h.dev;
  return (h[key] || "").toString().toLowerCase();
}

function applySort(list, f) {
  const sorted = [...list].sort((a, b) => {
    const va = sortValue(a, f.sortBy);
    const vb = sortValue(b, f.sortBy);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });
  if (f.sortDir === "desc") sorted.reverse();
  return sorted;
}

function groupByDate(list) {
  const groups = {};
  const order = [];
  list.forEach(h => {
    const key = h.settDate || "unscheduled";
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(h);
  });
  return order.map(key => ({ key, dateLabel: key === "unscheduled" ? "Unscheduled" : fmtDate(key), items: groups[key] }));
}

function houseRowHtml(h) {
  const devName = developmentNames[h.dev] || h.dev;
  return `
    <div class="house-row" data-house="${h.id}">
      <div class="addr">${h.address}</div>
      <div class="meta">${devName} · ${h.model}${h.elevCode ? " " + h.elevCode : ""} · ${h.buyer}${h.settDate ? " · " + fmtDate(h.settDate) : ""}</div>
      <div class="forms-row">
        <a href="nho-form.html?house=${encodeURIComponent(h.id)}" class="nho-link" data-house="${h.id}">New Home Orientation</a>
        <a href="closing-checklist.html?house=${encodeURIComponent(h.id)}" class="checklist-link" data-house="${h.id}">Closing Checklist</a>
      </div>
    </div>`;
}

async function render() {
  const f = getFilters();
  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("emptyState");
  const countEl = document.getElementById("resultsCount");

  const filtered = applySort(applyFilters(houses, f), f);

  countEl.textContent = filtered.length === houses.length
    ? `${filtered.length} homes`
    : `${filtered.length} of ${houses.length} homes`;

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  let html = "";
  if (f.viewMode === "flat" || f.sortBy !== "settDate") {
    filtered.forEach(h => { html += houseRowHtml(h); });
  } else {
    groupByDate(filtered).forEach(g => {
      html += `<div class="date-group-label">${g.dateLabel}</div>`;
      g.items.forEach(h => { html += houseRowHtml(h); });
    });
  }
  listEl.innerHTML = html;

  // Fill in live status pills (async, per house)
  filtered.forEach(async h => {
    const statuses = await window.ClosingFormsBackend.getHouseFormStatuses(h.id);
    const nhoLink = listEl.querySelector(`.nho-link[data-house="${CSS.escape(h.id)}"]`);
    const clLink = listEl.querySelector(`.checklist-link[data-house="${CSS.escape(h.id)}"]`);
    if (nhoLink) {
      nhoLink.textContent = statusLabel(statuses.nho, "New Home Orientation");
      nhoLink.className = "nho-link " + statusClass(statuses.nho);
    }
    if (clLink) {
      clLink.textContent = statusLabel(statuses.closing_checklist, "Closing Checklist");
      clLink.className = "checklist-link " + statusClass(statuses.closing_checklist);
    }
  });
}

populateFilterOptions();

["search", "filterDev", "filterModel", "filterDateFrom", "filterDateTo", "sortBy", "sortDir", "viewMode"]
  .forEach(id => document.getElementById(id).addEventListener("input", render));

document.getElementById("filterToggle").addEventListener("click", () => {
  const panel = document.getElementById("filterPanel");
  const icon = document.getElementById("filterToggleIcon");
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  icon.textContent = isOpen ? "▾" : "▴";
});

document.getElementById("clearFiltersBtn").addEventListener("click", () => {
  document.getElementById("search").value = "";
  document.getElementById("filterDev").value = "";
  document.getElementById("filterModel").value = "";
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  document.getElementById("sortBy").value = "settDate";
  document.getElementById("sortDir").value = "asc";
  document.getElementById("viewMode").value = "grouped";
  render();
});

render();
