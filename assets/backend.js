// Estela Living — Closing Pipeline Forms backend wiring.
//
// TODO (Luis): once you create the Supabase project, paste the two values
// below (Settings -> API in the Supabase dashboard) and this whole app
// switches from local-only (browser storage) to live/shared saving.
const SUPABASE_URL = "https://qoebflylvbkxdkmomstg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZWJmbHlsdmJreGRrbW9tc3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjUzMDEsImV4cCI6MjA5OTUwMTMwMX0.PDYdRHT-ySoK6p65z-EfQin1kJFoH53KRJEfiik2SxU";

// Run once in the Supabase SQL editor to create the tables this app needs:
//
// create table form_submissions (
//   id uuid primary key default gen_random_uuid(),
//   house_id text not null,
//   form_type text not null check (form_type in ('nho', 'closing_checklist')),
//   status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
//   data jsonb not null default '{}'::jsonb,
//   signatures jsonb not null default '{}'::jsonb,
//   submitted_by text,
//   updated_at timestamptz not null default now(),
//   completed_at timestamptz,
//   unique (house_id, form_type)
// );
// alter table form_submissions enable row level security;
// create policy "public read" on form_submissions for select using (true);
// create policy "public write" on form_submissions for insert with check (true);
// create policy "public update" on form_submissions for update using (true);
//
// create table form_activity_log (
//   id uuid primary key default gen_random_uuid(),
//   house_id text not null,
//   form_type text not null check (form_type in ('nho', 'closing_checklist')),
//   action text not null check (action in ('save', 'submit', 'print')),
//   data jsonb not null default '{}'::jsonb,
//   signatures jsonb not null default '{}'::jsonb,
//   performed_by text,
//   created_at timestamptz not null default now()
// );
// alter table form_activity_log enable row level security;
// create policy "public read" on form_activity_log for select using (true);
// create policy "public write" on form_activity_log for insert with check (true);
// -- No update/delete policy on purpose: this is an append-only audit trail.

const isConfigured = !SUPABASE_URL.startsWith("REPLACE_") && !SUPABASE_ANON_KEY.startsWith("REPLACE_");

let client = null;
function getClient() {
  if (!isConfigured) return null;
  if (!client && window.supabase) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

// Local fallback so the app is fully testable before Supabase is wired up.
// Once isConfigured flips to true, this stops being used for new saves.
const LOCAL_KEY = "estela_closing_forms_local_v1";
function localAll() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch (e) { return {}; }
}
function localSave(all) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

function submissionKey(houseId, formType) {
  return houseId + "::" + formType;
}

async function getSubmission(houseId, formType) {
  const sb = getClient();
  if (sb) {
    const { data, error } = await sb
      .from("form_submissions")
      .select("*")
      .eq("house_id", houseId)
      .eq("form_type", formType)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }
  const all = localAll();
  return all[submissionKey(houseId, formType)] || null;
}

async function saveSubmission(houseId, formType, { data, signatures, status, submittedBy }) {
  const sb = getClient();
  const record = {
    house_id: houseId,
    form_type: formType,
    status: status || "in_progress",
    data: data || {},
    signatures: signatures || {},
    submitted_by: submittedBy || null,
    updated_at: new Date().toISOString(),
    completed_at: status === "completed" ? new Date().toISOString() : null
  };
  if (sb) {
    const { error } = await sb
      .from("form_submissions")
      .upsert(record, { onConflict: "house_id,form_type" });
    if (error) { console.error(error); throw error; }
  } else {
    const all = localAll();
    all[submissionKey(houseId, formType)] = record;
    localSave(all);
  }
  await logActivity(houseId, formType, status === "completed" ? "submit" : "save", { data, signatures, performedBy: submittedBy });
  return record;
}

// Append-only audit trail: every Save Progress, Submit & Sign, and Print action
// writes a new row here instead of overwriting anything. Nothing in this app
// ever updates or deletes a log entry.
const LOCAL_LOG_KEY = "estela_closing_forms_log_v1";
function localLogAll() {
  try { return JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || "[]"); } catch (e) { return []; }
}
function localLogSave(entries) {
  localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(entries));
}

async function logActivity(houseId, formType, action, { data, signatures, performedBy } = {}) {
  const entry = {
    house_id: houseId,
    form_type: formType,
    action, // 'save' | 'submit' | 'print'
    data: data || {},
    signatures: signatures || {},
    performed_by: performedBy || null,
    created_at: new Date().toISOString()
  };
  const sb = getClient();
  if (sb) {
    const { error } = await sb.from("form_activity_log").insert(entry);
    if (error) console.error(error);
    return entry;
  }
  const entries = localLogAll();
  entries.push(entry);
  localLogSave(entries);
  return entry;
}

async function logPrint(houseId, formType, { data, signatures, performedBy } = {}) {
  return logActivity(houseId, formType, "print", { data, signatures, performedBy });
}

async function getActivityLog(houseId, formType) {
  const sb = getClient();
  if (sb) {
    const { data, error } = await sb
      .from("form_activity_log")
      .select("*")
      .eq("house_id", houseId)
      .eq("form_type", formType)
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return []; }
    return data || [];
  }
  return localLogAll().filter(e => e.house_id === houseId && e.form_type === formType);
}

// Returns { nho: 'not_started'|'in_progress'|'completed', closing_checklist: ... } for a house.
async function getHouseFormStatuses(houseId) {
  const sb = getClient();
  if (sb) {
    const { data, error } = await sb
      .from("form_submissions")
      .select("form_type,status")
      .eq("house_id", houseId);
    if (error) { console.error(error); return { nho: "not_started", closing_checklist: "not_started" }; }
    const out = { nho: "not_started", closing_checklist: "not_started" };
    (data || []).forEach(r => { out[r.form_type] = r.status; });
    return out;
  }
  const all = localAll();
  const out = { nho: "not_started", closing_checklist: "not_started" };
  ["nho", "closing_checklist"].forEach(ft => {
    const rec = all[submissionKey(houseId, ft)];
    if (rec) out[ft] = rec.status;
  });
  return out;
}

window.ClosingFormsBackend = {
  isConfigured,
  getSubmission,
  saveSubmission,
  getHouseFormStatuses,
  logPrint,
  getActivityLog
};
