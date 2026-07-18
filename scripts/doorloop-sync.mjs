// ─────────────────────────────────────────────────────────────────────────────
//  DoorLoop → SSH Command Center sync
//  Runs on a schedule (GitHub Actions). Pulls maintenance work orders from the
//  DoorLoop API and writes them into the app's Firestore "tasks" collection so
//  they appear on the dashboard automatically.
//
//  Env (provided as GitHub Actions secrets):
//    DOORLOOP_API_KEY          — from DoorLoop ▸ Settings ▸ Zapier & API Keys
//    FIREBASE_SERVICE_ACCOUNT  — Firebase service-account JSON (one line)
//    DOORLOOP_BASE (optional)  — defaults to https://api.doorloop.com/api
//    DEBUG=1 (optional)        — log a sample task to calibrate field mapping
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const API_KEY = process.env.DOORLOOP_API_KEY;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const BASE = (process.env.DOORLOOP_BASE || "https://api.doorloop.com/api").replace(/\/$/, "");
const DEBUG = process.env.DEBUG === "1";

if (!API_KEY) { console.error("❌ Missing DOORLOOP_API_KEY"); process.exit(1); }
if (!SA) { console.error("❌ Missing FIREBASE_SERVICE_ACCOUNT"); process.exit(1); }

let serviceAccount;
try { serviceAccount = JSON.parse(SA); }
catch (e) { console.error("❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:", e.message); process.exit(1); }

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function dlGet(pathAndQuery) {
  const res = await fetch(BASE + pathAndQuery, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DoorLoop ${res.status} ${res.statusText} on ${pathAndQuery} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

const listOf = (json) => (Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []);

async function fetchAll(path) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const json = await dlGet(`${path}${sep}page_size=100&page_number=${page}`);
    const items = listOf(json);
    out.push(...items);
    const total = json?.total ?? null;
    if (!items.length || items.length < 100 || (total != null && out.length >= total)) break;
  }
  return out;
}

const norm = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadAppProperties() {
  const snap = await db.collection("properties").get();
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, norm: norm(d.data().name) }));
  return arr;
}

function matchProperty(dlName, appProps) {
  const n = norm(dlName);
  if (!n) return "";
  let hit = appProps.find((p) => p.norm === n);
  if (hit) return hit.id;
  hit = appProps.find((p) => p.norm && (n.includes(p.norm) || p.norm.includes(n)));
  if (hit) return hit.id;
  const tokens = n.split(" ").filter((t) => t.length > 2);
  hit = appProps.find((p) => p.norm && tokens.some((t) => p.norm.includes(t)));
  return hit ? hit.id : "";
}

async function loadDlPropertyNames() {
  try {
    const props = await fetchAll("/properties");
    const map = new Map();
    for (const p of props) map.set(String(p.id ?? p._id), p.name || p.address?.street1 || "");
    return map;
  } catch (e) {
    console.warn("⚠️  Could not list DoorLoop properties (will use names embedded in tasks):", e.message);
    return new Map();
  }
}

function taskPropertyName(task, dlProps) {
  const prop = task.property ?? task.propertyId ?? task.property_id;
  if (prop && typeof prop === "object") return prop.name || prop.address?.street1 || "";
  const pid = typeof prop === "string" ? prop : "";
  if (pid && dlProps.has(String(pid))) return dlProps.get(String(pid));
  return task.propertyName || "";
}

function isOpen(task) {
  const s = norm(task.status ?? task.taskStatus ?? "");
  return !(s.includes("done") || s.includes("complete") || s.includes("closed") || s.includes("resolved") || s.includes("cancel"));
}

async function run() {
  console.log("→ Loading app properties from Firestore…");
  const appProps = await loadAppProperties();
  console.log(`  ${appProps.length} properties.`);

  console.log("→ Fetching DoorLoop properties + tasks…");
  const dlProps = await loadDlPropertyNames();
  const tasks = await fetchAll("/tasks");
  console.log(`  DoorLoop returned ${tasks.length} tasks.`);
  if (DEBUG && tasks[0]) console.log("Sample task:\n", JSON.stringify(tasks[0], null, 2));

  let created = 0, updated = 0, kept = 0;
  for (const task of tasks) {
    const dlId = String(task.id ?? task._id ?? "");
    if (!dlId) continue;
    const id = "dl-" + dlId;
    const title = task.subject || task.name || task.title || "(untitled work order)";
    const ref = task.reference || task.number || dlId.slice(-6).toUpperCase();
    const dlName = taskPropertyName(task, dlProps);
    const propertyId = matchProperty(dlName, appProps);
    const submitter = task.requestedByName || task.createdByName || task.requestedBy?.name || "";
    const typeLabel = [task.type, task.subType].filter(Boolean).join(" · ");
    const open = isOpen(task);

    const docRef = db.collection("tasks").doc(id);
    const existing = await docRef.get();
    // Respect a completion the user made inside the app.
    if (existing.exists && existing.data().status === "done" && open) { kept++; continue; }

    const notes = [
      `DoorLoop #${ref}`,
      typeLabel || null,
      dlName ? `Property: ${dlName}` : null,
      submitter ? `Submitted by ${submitter}` : null,
    ].filter(Boolean).join("\n");

    const data = {
      title, notes,
      status: open ? "open" : "done",
      due: "", propertyId, priority: 1,
      tags: ["maintenance"], source: "doorloop", doorloopId: dlId,
      updatedAt: Date.now(),
    };
    if (!existing.exists) data.createdAt = Date.parse(task.createdAt || task.created_at || "") || Date.now();
    await docRef.set(data, { merge: true });
    existing.exists ? updated++ : created++;
  }
  // Marker the dashboard reads to show "auto-sync is on · last synced …".
  await db.collection("meta").doc("doorloopSync").set({
    lastRun: Date.now(),
    lastCount: tasks.length,
    created, updated,
  }, { merge: true });

  console.log(`✓ Sync complete: ${created} new, ${updated} updated, ${kept} left as you had them.`);
}

run().catch((e) => { console.error("❌ Sync failed:", e.message); process.exit(1); });
