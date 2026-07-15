const PUNCH_LINES = 8;
const SATISFACTION_ITEMS = [
  "Drywall", "Plumbing/Fixtures", "Carpet", "Heat/Cool System",
  "Paint", "Electric/Lighting", "Wood/Lam Floor", "Appliances",
  "Counter Tops", "Ceramic Tile", "Vinyl Floor", "Concrete",
  "Cabinets", "Mirrors & Glass", "Trim Woodwork", "Landscaping**"
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
document.getElementById("f_address").value = house.address;
document.getElementById("f_customerName").value = house.buyer;

const punchListEl = document.getElementById("punchList");
for (let i = 1; i <= PUNCH_LINES; i++) {
  const row = document.createElement("div");
  row.className = "punch-line";
  row.innerHTML = `<div class="num">${i})</div><input type="text" id="f_punch${i}" placeholder="Item to complete / adjust / repair">`;
  punchListEl.appendChild(row);
}

const satListEl = document.getElementById("satisfactionList");
SATISFACTION_ITEMS.forEach((label, idx) => {
  const row = document.createElement("label");
  row.className = "checklist-item";
  row.innerHTML = `<input type="checkbox" id="f_sat${idx}"><span class="label">${label}</span>`;
  satListEl.appendChild(row);
});

const sigIds = ["sig_customer1", "sig_customer2", "sig_cm", "sig_customerFinal"];
const pads = {};
sigIds.forEach(id => { pads[id] = createSignaturePad(document.getElementById(id)); });
document.querySelectorAll(".sig-clear").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.clear;
    pads[id].clear();
    document.getElementById(id + "_status").textContent = "Not signed";
  });
});

function fieldIds() {
  const ids = ["f_date", "f_customerName", "f_address", "f_nhoDate1", "f_nhoDate2",
    "f_initial1", "f_initial2", "f_landInitial1", "f_landInitial2", "f_cmName"];
  for (let i = 1; i <= PUNCH_LINES; i++) ids.push("f_punch" + i);
  SATISFACTION_ITEMS.forEach((_, idx) => ids.push("f_sat" + idx));
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
}

function collectSignatures() {
  const sig = {};
  sigIds.forEach(id => { sig[id] = pads[id].toDataURL(); });
  return sig;
}

function applySignatures(sig) {
  if (!sig) return;
  sigIds.forEach(id => {
    if (sig[id]) {
      pads[id].loadDataURL(sig[id]);
      document.getElementById(id + "_status").textContent = "Signed";
    }
  });
}

function setLocked(locked) {
  document.querySelectorAll("input, textarea").forEach(el => el.disabled = locked);
  document.getElementById("submitBtn").disabled = locked;
  document.getElementById("saveProgressBtn").disabled = locked;
  document.querySelectorAll(".sig-clear").forEach(b => b.disabled = locked);
  document.querySelectorAll(".sig-pad").forEach(c => c.style.pointerEvents = locked ? "none" : "auto");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

(async function init() {
  const existing = await window.ClosingFormsBackend.getSubmission(houseId, "nho");
  if (existing) {
    applyData(existing.data);
    applySignatures(existing.signatures);
    if (existing.status === "completed") {
      setLocked(true);
      document.getElementById("lockedBanner").style.display = "block";
      document.getElementById("lockedMeta").textContent =
        `Submitted by ${existing.submitted_by || "field team"} on ${new Date(existing.completed_at).toLocaleString()}`;
    }
  }
})();

document.getElementById("saveProgressBtn").addEventListener("click", async () => {
  await window.ClosingFormsBackend.saveSubmission(houseId, "nho", {
    data: collectData(),
    signatures: collectSignatures(),
    status: "in_progress",
    submittedBy: document.getElementById("f_cmName").value || null
  });
  showToast("Progress saved");
});

document.getElementById("printBtn").addEventListener("click", async () => {
  await window.ClosingFormsBackend.logPrint(houseId, "nho", {
    data: collectData(),
    signatures: collectSignatures(),
    performedBy: document.getElementById("f_cmName").value || null
  });
  window.print();
});

document.getElementById("submitBtn").addEventListener("click", async () => {
  const finalSig = pads["sig_customerFinal"];
  const cmSig = pads["sig_cm"];
  if (finalSig.isEmpty() || cmSig.isEmpty()) {
    showToast("Construction Manager and Customer Final Acceptance signatures are required");
    return;
  }
  const submittedBy = document.getElementById("f_cmName").value || "Field team";
  await window.ClosingFormsBackend.saveSubmission(houseId, "nho", {
    data: collectData(),
    signatures: collectSignatures(),
    status: "completed",
    submittedBy
  });
  setLocked(true);
  document.getElementById("lockedBanner").style.display = "block";
  document.getElementById("lockedMeta").textContent = `Submitted by ${submittedBy} on ${new Date().toLocaleString()}`;
  showToast("Signed and submitted ✓");
});
