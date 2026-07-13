const CANCELLATIONS = [
  "Builder's Risk Insurance", "Utilities — Water", "Utilities — Electric",
  "Waste Dumpster Pickup", "Mowing", "Portable Pickups", "Pest Control"
];

const params = new URLSearchParams(location.search);
const houseId = params.get("house");
const { houses, developmentNames } = window.HousesData;
const house = houses.find(h => h.id === houseId);

if (!house) {
  document.querySelector(".container").innerHTML = '<div class="card">Could not find this property. <a href="index.html">Back to dashboard</a></div>';
  throw new Error("house not found");
}

document.getElementById("propertySubtitle").textContent = house.address;
document.getElementById("propertyTitle").textContent = house.address;
document.getElementById("propertyMeta").textContent = `${developmentNames[house.dev] || house.dev} · ${house.model}${house.elevCode ? " " + house.elevCode : ""} · ${house.buyer}`;

const listEl = document.getElementById("cancellationsList");
CANCELLATIONS.forEach((label, idx) => {
  const row = document.createElement("label");
  row.className = "checklist-item";
  row.innerHTML = `<input type="checkbox" id="f_cxl${idx}"><span class="label">${label}</span>`;
  listEl.appendChild(row);
});

document.getElementById("f_signerSelect").addEventListener("change", (e) => {
  document.getElementById("otherNameField").style.display = e.target.value === "__other__" ? "block" : "none";
});

function updateProgress() {
  let done = 0;
  CANCELLATIONS.forEach((_, idx) => { if (document.getElementById("f_cxl" + idx).checked) done++; });
  const total = CANCELLATIONS.length;
  document.getElementById("progressCount").textContent = `${done} / ${total}`;
  document.getElementById("progressFill").style.width = (done / total * 100) + "%";
}
document.getElementById("f_settlementDate").addEventListener("input", updateProgress);
CANCELLATIONS.forEach((_, idx) => document.getElementById("f_cxl" + idx).addEventListener("change", updateProgress));

function fieldIds() {
  const ids = ["f_settlementDate", "f_notes", "f_signerSelect", "f_signerOther"];
  CANCELLATIONS.forEach((_, idx) => ids.push("f_cxl" + idx));
  return ids;
}

function collectData() {
  const data = {};
  fieldIds().forEach(id => {
    const el = document.getElementById(id);
    data[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return data;
}

function applyData(data) {
  if (!data) return;
  fieldIds().forEach(id => {
    const el = document.getElementById(id);
    if (!(id in data)) return;
    if (el.type === "checkbox") el.checked = !!data[id];
    else el.value = data[id];
  });
  if (data.f_signerSelect === "__other__") document.getElementById("otherNameField").style.display = "block";
  updateProgress();
}

function signerName() {
  const sel = document.getElementById("f_signerSelect").value;
  if (sel === "__other__") return document.getElementById("f_signerOther").value.trim();
  return sel;
}

function setLocked(locked) {
  document.querySelectorAll("input, textarea, select").forEach(el => el.disabled = locked);
  document.getElementById("submitBtn").disabled = locked;
  document.getElementById("saveProgressBtn").disabled = locked;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

(async function init() {
  const existing = await window.ClosingFormsBackend.getSubmission(houseId, "closing_checklist");
  if (existing) {
    applyData(existing.data);
    if (existing.status === "completed") {
      setLocked(true);
      document.getElementById("lockedBanner").style.display = "block";
      document.getElementById("lockedMeta").textContent =
        `Signed off by ${existing.submitted_by || "field team"} on ${new Date(existing.completed_at).toLocaleString()}`;
    }
  }
})();

document.getElementById("saveProgressBtn").addEventListener("click", async () => {
  await window.ClosingFormsBackend.saveSubmission(houseId, "closing_checklist", {
    data: collectData(),
    status: "in_progress"
  });
  showToast("Progress saved");
});

document.getElementById("submitBtn").addEventListener("click", async () => {
  const name = signerName();
  if (!name) {
    showToast("Select or type your name to sign off");
    return;
  }
  await window.ClosingFormsBackend.saveSubmission(houseId, "closing_checklist", {
    data: collectData(),
    status: "completed",
    submittedBy: name
  });
  setLocked(true);
  document.getElementById("lockedBanner").style.display = "block";
  document.getElementById("lockedMeta").textContent = `Signed off by ${name} on ${new Date().toLocaleString()}`;
  showToast("Signed off ✓");
});

document.getElementById("printBtn").addEventListener("click", () => window.print());
