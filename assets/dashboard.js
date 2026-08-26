const { houses, developmentNames } = window.HousesData;

// house_id -> {house_id, status, completed_at, updated_at}, one map per form
// type. Loaded once at page load (see loadStatusMaps) so filtering/sorting
// and the status pills all read from the same snapshot instead of firing
// one request per house per render.
let nhoStatusMap = new Map();
let checklistStatusMap = new Map();

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
function statusFromMap(map, houseId) {
  const rec = map.get(houseId);
  return rec ? rec.status : "not_started";
}

async function loadStatusMaps() {
  const [nhoRows, checklistRows] = await Promise.all([
    window.ClosingFormsBackend.getAllSubmissions("nho"),
    window.ClosingFormsBackend.getAllSubmissions("closing_checklist")
  ]);
  nhoStatusMap = new Map(nhoRows.map(r => [r.house_id, r]));
  checklistStatusMap = new Map(checklistRows.map(r => [r.house_id, r]));
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
    checklistStatus: document.getElementById("filterChecklistStatus").value,
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
    if (f.checklistStatus && statusFromMap(checklistStatusMap, h.id) !== f.checklistStatus) return false;
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

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// How long the Closing Checklist has taken (or is taking) relative to the
// house's closing date: "Nd since closing — pending" while unfinished, or
// "Completed in Nd" once signed off. Empty string when there's nothing
// meaningful to show yet (no closing date, or closing hasn't happened).
function checklistTurnaroundHtml(h) {
  if (!h.settDate) return "";
  const sett = new Date(h.settDate + "T00:00:00");
  const rec = checklistStatusMap.get(h.id);
  const status = rec ? rec.status : "not_started";

  if (status === "completed" && rec.completed_at) {
    const days = daysBetween(sett, new Date(rec.completed_at));
    const label = days <= 0 ? "Checklist completed by closing day" : `Checklist completed in ${days}d`;
    return `<div class="turnaround"><span class="pill pill-done">${label}</span></div>`;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (sett > today) return "";

  const days = daysBetween(sett, today);
  const label = status === "in_progress" ? "checklist in progress" : "checklist not started";
  const cls = days > 7 ? "pill-overdue" : "pill-progress";
  return `<div class="turnaround"><span class="pill ${cls}">${days}d since closing — ${label}</span></div>`;
}

function houseRowHtml(h) {
  const devName = developmentNames[h.dev] || h.dev;
  return `
    <div class="house-row" data-house="${h.id}">
      <div class="addr">${h.address}</div>
      <div class="meta">${devName} · ${h.model}${h.elevCode ? " " + h.elevCode : ""} · ${h.buyer}${h.settDate ? " · " + fmtDate(h.settDate) : ""}</div>
      ${checklistTurnaroundHtml(h)}
      <div class="forms-row">
        <a href="nho-form.html?house=${encodeURIComponent(h.id)}" class="nho-link ${statusClass(statusFromMap(nhoStatusMap, h.id))}">${statusLabel(statusFromMap(nhoStatusMap, h.id), "New Home Orientation")}</a>
        <a href="closing-checklist.html?house=${encodeURIComponent(h.id)}" class="checklist-link ${statusClass(statusFromMap(checklistStatusMap, h.id))}">${statusLabel(statusFromMap(checklistStatusMap, h.id), "Closing Checklist")}</a>
      </div>
    </div>`;
}

function render() {
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
}

async function init() {
  populateFilterOptions();
  await loadStatusMaps();
  render();
}

["search", "filterDev", "filterModel", "filterChecklistStatus", "filterDateFrom", "filterDateTo", "sortBy", "sortDir", "viewMode"]
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
  document.getElementById("filterChecklistStatus").value = "";
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  document.getElementById("sortBy").value = "settDate";
  document.getElementById("sortDir").value = "asc";
  document.getElementById("viewMode").value = "grouped";
  render();
});

init();
