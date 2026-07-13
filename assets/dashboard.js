const { houses, developmentNames } = window.HousesData;

function fmtDate(iso) {
  if (!iso) return "No date set";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(list) {
  const groups = {};
  list.forEach(h => {
    const key = h.settDate || "unscheduled";
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });
  return Object.keys(groups).sort().reverse().map(key => ({ key, dateLabel: key === "unscheduled" ? "Unscheduled" : fmtDate(key), items: groups[key] }));
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

async function render(filterText) {
  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("emptyState");
  const filtered = houses.filter(h => {
    if (!filterText) return true;
    const t = filterText.toLowerCase();
    return h.address.toLowerCase().includes(t) || h.buyer.toLowerCase().includes(t) || h.houseNumber.includes(t);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  const groups = groupByDate(filtered);
  let html = "";
  groups.forEach(g => {
    html += `<div class="date-group-label">${g.dateLabel}</div>`;
    g.items.forEach(h => {
      const devName = developmentNames[h.dev] || h.dev;
      html += `
        <div class="house-row" data-house="${h.id}">
          <div class="addr">${h.address}</div>
          <div class="meta">${devName} · ${h.model}${h.elevCode ? " " + h.elevCode : ""} · ${h.buyer}</div>
          <div class="forms-row">
            <a href="nho-form.html?house=${encodeURIComponent(h.id)}" class="nho-link" data-house="${h.id}">New Home Orientation</a>
            <a href="closing-checklist.html?house=${encodeURIComponent(h.id)}" class="checklist-link" data-house="${h.id}">Closing Checklist</a>
          </div>
        </div>`;
    });
  });
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

document.getElementById("search").addEventListener("input", (e) => render(e.target.value));
render("");
