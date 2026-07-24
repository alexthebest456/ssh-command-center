// ─────────────────────────────────────────────────────────────────────────────
//  SSH COMMAND CENTER — APP
// ─────────────────────────────────────────────────────────────────────────────
import { DB, genId } from "./db.js";
import { seedIfEmpty, seedPersonalOS, upgradePortfolio, applyPortfolioStatuses, DEFAULT_STAGES } from "./seed.js";
import { reconcileAcademy, TEXTS, EXAM_FACTS } from "./academy-curriculum.js";
import { QUESTIONS } from "./academy-questions.js";
import { buildPlan, sectionRanges, planStatus, fmtWeekday, fmtShort, PLAN_START } from "./academy-plan.js";

// ── State ────────────────────────────────────────────────────────────────────
const COLLECTIONS = [
  "properties", "tasks", "content", "events", "leases",
  "routines", "routineLog", "photos", "reviews", "scorecards", "meta",
  "habits", "habitLog", "goals", "books", "workouts", "academy", "vocab",
  "quizLog",
];
const state = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

// The app always opens on the "Now" front door — one thing at a time, no wall
// of dashboards. Navigation within a session still works normally.
let currentView = "now";
let calMonth = startOfMonth(new Date());

// ── Date helpers ─────────────────────────────────────────────────────────────
const DAY = 86400000;
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function todayDate() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function todayISO() { return toISO(todayDate()); }
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s) { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function fmtDate(s) {
  const d = parseISO(s); if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtLong(d) { return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function daysUntil(s) { const d = parseISO(s); if (!d) return null; return Math.round((d - todayDate()) / DAY); }
function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; }
function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function money0(v) { const n = Number(v); return isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString(); }

function dueMeta(s) {
  const n = daysUntil(s);
  if (n === null) return null;
  if (n < 0) return { text: `${Math.abs(n)}d overdue`, cls: "overdue" };
  if (n === 0) return { text: "today", cls: "soon" };
  if (n === 1) return { text: "tomorrow", cls: "soon" };
  if (n <= 3) return { text: `in ${n}d`, cls: "soon" };
  return { text: fmtDate(s), cls: "" };
}

// ── DOM helpers ──────────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function propName(id) {
  const p = state.properties.find((x) => x.id === id);
  return p ? p.name : "";
}
function activeBuilds() { return state.properties.filter((p) => p.kind === "active-build"); }

// ── Modal / form system ──────────────────────────────────────────────────────
function closeModal() { $("#modalRoot").innerHTML = ""; }

function formModal({ title, sub, fields, values = {}, onSubmit, onDelete }) {
  const fieldHTML = fields.map((f) => renderField(f, values[f.key])).join("");
  $("#modalRoot").innerHTML = `
    <div class="modal-back" data-close>
      <div class="modal">
        <h2>${esc(title)}</h2>
        ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
        <form id="mForm">${fieldHTML}
          <div class="modal-actions">
            ${onDelete ? `<button type="button" class="btn danger ghost" id="mDel">Delete</button>` : ""}
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Cancel</button>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;
  const back = $(".modal-back");
  back.addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  $("#mForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const inp = $(`[name="${f.key}"]`, back);
      out[f.key] = f.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value;
    }
    onSubmit(out);
    closeModal();
  });
  if (onDelete) $("#mDel").addEventListener("click", () => { if (confirm("Delete this item?")) { onDelete(); closeModal(); } });
  const first = $("input,textarea,select", $("#mForm")); if (first) first.focus();
}

function renderField(f, val) {
  val = val ?? f.default ?? "";
  const lab = `<span class="lab">${esc(f.label)}</span>`;
  if (f.type === "textarea")
    return `<label class="field">${lab}<textarea name="${f.key}" placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea></label>`;
  if (f.type === "select") {
    const opts = f.options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`;
    }).join("");
    return `<label class="field">${lab}<select name="${f.key}">${opts}</select></label>`;
  }
  const type = f.type || "text";
  return `<label class="field">${lab}<input type="${type}" name="${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder || "")}" ${f.step ? `step="${f.step}"` : ""}/></label>`;
}

// ── Navigation ───────────────────────────────────────────────────────────────
// The four screens you actually work in, always visible. Everything else is
// tucked under "More" so the sidebar is calm, not a wall of 19 options.
const NAV_ESSENTIALS = [
  { id: "now", label: "⚡ Now" },
  { id: "builds", label: "🏗 Active Projects" },
  { id: "academy", label: "🎓 Academy" },
  { id: "myday", label: "📅 My Day" },
];
const NAV_MORE = [
  { title: "Daily", items: [
    { id: "dailyos", label: "Daily Non-Negotiables" },
    { id: "goals", label: "Goals" },
    { id: "reading", label: "Reading" },
  ]},
  { title: "Tasks", items: [
    { id: "capture", label: "Capture" },
    { id: "horizon", label: "2-Week Horizon" },
    { id: "backlog", label: "Backlog" },
  ]},
  { title: "Properties", items: [
    { id: "calendar", label: "Property Calendar" },
    { id: "maintenance", label: "Maintenance" },
    { id: "leases", label: "Leases & Rent" },
  ]},
  { title: "Marketing", items: [
    { id: "content", label: "Content Calendar" },
  ]},
  { title: "Review", items: [
    { id: "performance", label: "Portfolio Performance" },
    { id: "scorecard", label: "Monthly Scorecard" },
    { id: "weekly", label: "Weekly Review" },
    { id: "productivity", label: "Productivity" },
  ]},
  { title: "System", items: [
    { id: "data", label: "Data & Sync" },
  ]},
];

function badgeFor(id) {
  if (id === "today") return openToday().length || "";
  if (id === "horizon") return horizonTasks().length || "";
  if (id === "backlog") return backlogTasks().length || "";
  if (id === "builds") return activeBuilds().length || "";
  if (id === "maintenance") return maintenanceTasks().length || "";
  if (id === "leases") return leasesNeedingNotice().length || "";
  if (id === "dailyos") { const n = dailyHabits().filter((h) => !habitDone(h)).length; return n || ""; }
  return "";
}

function navBtn(item) {
  const b = badgeFor(item.id);
  return `<button class="nav-item ${item.id === currentView ? "active" : ""}" data-nav="${item.id}">
    <span class="dot"></span>
    <span class="label">${esc(item.label)}</span>
    ${b ? `<span class="badge">${b}</span>` : ""}
  </button>`;
}
function renderNav() {
  const moreActive = NAV_MORE.some((g) => g.items.some((it) => it.id === currentView));
  $("#nav").innerHTML = `
    <div class="nav-group">
      <div class="nav-group-title">Focus</div>
      ${NAV_ESSENTIALS.map(navBtn).join("")}
    </div>
    <details class="nav-more" ${moreActive ? "open" : ""}>
      <summary class="nav-group-title" style="cursor:pointer;list-style:none;user-select:none">More ▾</summary>
      ${NAV_MORE.map((g) => `<div class="nav-group"><div class="nav-group-title">${esc(g.title)}</div>${g.items.map(navBtn).join("")}</div>`).join("")}
    </details>`;
  $("#nav").querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.nav)));
}

function go(id) {
  currentView = id;
  localStorage.setItem("sshcc:view", id);
  closeSidebar();
  render();
}

// ── Task selectors ───────────────────────────────────────────────────────────
const openTasks = () => state.tasks.filter((t) => t.status !== "done");
function openToday() {
  return openTasks().filter((t) => { const n = daysUntil(t.due); return n !== null && n <= 0; })
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}
function horizonTasks() {
  return openTasks().filter((t) => { const n = daysUntil(t.due); return n !== null && n >= 0 && n <= 14; })
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}
function backlogTasks() {
  return openTasks().filter((t) => !t.due).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) === 0 ? (b.createdAt || 0) - (a.createdAt || 0) : (b.priority ?? 0) - (a.priority ?? 0));
}
function isMaintenance(t) { return (t.tags || []).includes("maintenance") || t.source === "doorloop"; }
function maintenanceTasks() {
  return openTasks().filter(isMaintenance).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// ── "The ONE Thing" — importance-ranked daily focus ──────────────────────────
function taskScore(t) {
  let s = (t.priority || 0) * 100; // importance dominates
  const n = daysUntil(t.due);
  if (n !== null) { if (n < 0) s += 80 + Math.min(40, -n); else if (n <= 1) s += 60; else if (n <= 3) s += 40; else if (n <= 7) s += 20; else s += 8; }
  const age = t.createdAt ? (Date.now() - t.createdAt) / DAY : 0; // nothing rots
  s += Math.min(20, age * 0.4);
  return s;
}
function rankedTasks() { return openTasks().slice().sort((a, b) => taskScore(b) - taskScore(a)); }
function focusPin() { try { const f = JSON.parse(localStorage.getItem("sshcc:focus") || "null"); return (f && f.date === todayISO()) ? f.taskId : null; } catch { return null; } }
function setFocusPin(id) { localStorage.setItem("sshcc:focus", JSON.stringify({ date: todayISO(), taskId: id })); }
function oneThingTask() {
  const pid = focusPin();
  const pinned = pid && state.tasks.find((t) => t.id === pid && t.status !== "done");
  return pinned || rankedTasks()[0] || null;
}
function whyOneThing(t) {
  if (!t) return "";
  const n = daysUntil(t.due);
  if (n !== null && n < 0) return `${-n}d overdue`;
  if (n === 0) return "Due today";
  if (t.priority >= 2) return "High priority";
  if (n !== null && n <= 3) return `Due in ${n}d`;
  if (t.priority >= 1) return "Important";
  return "Top of your list";
}
function oneThingCard() {
  const one = oneThingTask();
  if (!one) return `<div class="panel mb"><div class="panel-title"><span class="n">🎯</span> Today's ONE Thing</div><div class="empty">No open tasks — clear runway. ✈ Add one to focus on.</div></div>`;
  const p = propName(one.propertyId), dm = dueMeta(one.due);
  return `<div class="panel mb" style="border:1.5px solid var(--amber-line);background:var(--amber-soft)">
    <div class="flex between wrap"><div class="panel-title" style="margin:0"><span class="n">🎯</span> Today's ONE Thing</div>
      <span class="tag amber">${esc(whyOneThing(one))}</span></div>
    <div style="font-size:21px;font-weight:700;line-height:1.25;margin-top:8px">${esc(one.title)}</div>
    <div class="mono muted" style="margin-top:5px;font-size:12px">${p ? "▦ " + esc(p) : ""}${p && dm ? " · " : ""}${dm ? dm.text : (p ? "" : "no due date")}</div>
    ${one.notes ? `<div class="muted mt" style="font-size:13px;white-space:pre-wrap">${esc(one.notes)}</div>` : ""}
    <div class="flex mt" style="gap:8px"><button class="btn primary sm" data-one-done="${one.id}">✓ Done — load next</button>
      <button class="btn sm ghost" data-one-edit="${one.id}">✎ Details</button></div>
  </div>`;
}
function focusRow(t) {
  const dm = dueMeta(t.due), p = propName(t.propertyId);
  return `<div class="row">
    <div class="check ${t.status === "done" ? "done" : ""}" data-toggle="${t.id}">✓</div>
    <div class="body"><div class="t">${esc(t.title)}</div>
      <div class="m">${t.priority >= 2 ? `<span class="tag amber">high</span>` : t.priority >= 1 ? `<span class="tag">med</span>` : ""}${dm ? `<span class="pill-due ${dm.cls}">${dm.text}</span>` : ""}${p ? `<span>▦ ${esc(p)}</span>` : ""}</div></div>
    <div class="actions"><button class="icon-btn" data-set-focus="${t.id}" title="Make this today's ONE Thing">➤</button></div>
  </div>`;
}
function focusQueueHTML() {
  const one = oneThingTask();
  const q = rankedTasks().filter((t) => !one || t.id !== one.id).slice(0, 7);
  return q.length ? q.map(focusRow).join("") : `<div class="empty">Nothing else queued. 🎯</div>`;
}

// ── "Now" — one cross-domain focus queue (tasks + lesson + non-negotiables) ───
// Skipped items are sent to the back of the line for the session (not persisted).
const nowSkips = new Set();
function fqTask(t) {
  const dm = dueMeta(t.due), p = propName(t.propertyId);
  return { kind: "task", id: t.id, icon: "✓", eyebrow: p ? "▦ " + p : "Task", title: t.title,
    sub: dm ? dm.text : "no due date", why: whyOneThing(t), notes: t.notes || "",
    done: `data-now-done-task="${t.id}"`, side: `data-now-edit="${t.id}"`, sideLabel: "✎ Details" };
}
function fqLesson(l) {
  return { kind: "lesson", id: l.id, icon: "📚", eyebrow: `Academy · §${l.sec}`, title: l.title,
    sub: l.objective || "Today's lesson toward your license", why: "Keeps Dec 15 on track", notes: l.content || "",
    done: `data-now-done-lesson="${l.id}"`, side: `data-goto="academy"`, sideLabel: "Open Academy" };
}
function fqHabit(h) {
  return { kind: "habit", id: h.id, icon: h.icon || "☀", eyebrow: "Non-negotiable", title: h.name,
    sub: h.time || "part of your daily routine", why: "Daily", notes: "",
    done: `data-now-done-habit="${h.id}"`, side: "", sideLabel: "" };
}
// A task tied to a not-yet-closed (pipeline) deal shouldn't nag you up front —
// there's nothing to do on it until the deal actually closes.
function isPipelineTask(t) {
  if (!t.propertyId) return false;
  const p = state.properties.find((x) => x.id === t.propertyId);
  return !!p && p.kind === "pipeline";
}
function focusQueue() {
  const q = [], seen = new Set();
  for (const t of openToday().filter((t) => !isPipelineTask(t)).sort((a, b) => taskScore(b) - taskScore(a))) { q.push(fqTask(t)); seen.add(t.id); }
  const lesson = academyNext();
  if (lesson) q.push(fqLesson(lesson));
  for (const h of dailyHabits()) if (!habitDone(h)) q.push(fqHabit(h));
  for (const t of rankedTasks()) if (!seen.has(t.id) && !isPipelineTask(t)) { q.push(fqTask(t)); seen.add(t.id); }
  const pid = focusPin();
  if (pid) { const i = q.findIndex((x) => x.kind === "task" && x.id === pid); if (i > 0) q.unshift(q.splice(i, 1)[0]); }
  const key = (x) => x.kind + ":" + x.id;
  return [...q.filter((x) => !nowSkips.has(key(x))), ...q.filter((x) => nowSkips.has(key(x)))];
}
function doneTodayCount() {
  const t0 = todayDate().getTime(), t1 = t0 + DAY, within = (ms) => ms >= t0 && ms < t1;
  const tasks = state.tasks.filter((x) => x.status === "done" && x.doneAt && within(x.doneAt)).length;
  const lessons = (state.academy || []).filter((x) => x.status === "done" && x.doneAt && within(x.doneAt)).length;
  const habits = dailyHabits().filter((h) => habitDone(h)).length;
  return tasks + lessons + habits;
}

// ── Lease / rent-increase math ────────────────────────────────────────────────
// Default cap follows California AB 1482: max annual increase = 5% + regional
// CPI, capped at 10%. Both the CPI and the cap are editable per lease.
function leaseCalc(l) {
  const rent = Number(l.currentRent) || 0;
  const cpi = (l.cpiPct === "" || l.cpiPct == null) ? null : Number(l.cpiPct);
  const capExplicit = (l.capPct !== "" && l.capPct != null) ? Number(l.capPct) : null;
  const cap = capExplicit != null ? capExplicit : (cpi != null ? Math.min(10, 5 + cpi) : 5);
  const interval = Number(l.intervalMonths) || 12;
  const noticeDays = Number(l.noticeDays) || 60;
  const base = parseISO(l.lastIncreaseDate) || parseISO(l.leaseStart);

  let next = null, noticeBy = null, status = "none", daysToNotice = null, daysToNext = null;
  if (base && rent) {
    next = addMonths(base, interval);
    while (next < todayDate()) next = addMonths(next, interval);
    noticeBy = new Date(next.getTime() - noticeDays * DAY);
    daysToNext = daysUntil(toISO(next));
    daysToNotice = daysUntil(toISO(noticeBy));
    if (daysToNext <= 0) status = "due";
    else if (daysToNotice <= 0) status = "notice";   // inside the notice window now
    else if (daysToNotice <= 14) status = "soon";
    else status = "ok";
  }

  // 5-increase forecast at the max allowable each cycle, starting at next increase.
  const forecast = [];
  let r = rent, d = next ? new Date(next) : null;
  for (let i = 0; i < 5; i++) {
    r = Math.round(r * (1 + cap / 100));
    forecast.push({ date: d ? new Date(d) : null, rent: r });
    if (d) d = addMonths(d, interval);
  }
  const nextRent = rent ? Math.round(rent * (1 + cap / 100)) : 0;
  return { rent, cpi, cap, interval, noticeDays, next, noticeBy, status, daysToNotice, daysToNext, forecast, nextRent };
}

function leasesNeedingNotice() {
  return state.leases.filter((l) => { const s = leaseCalc(l).status; return s === "notice" || s === "due"; });
}

// ── Task row + editor (shared) ───────────────────────────────────────────────
function taskRow(t) {
  const dm = dueMeta(t.due);
  const pn = propName(t.propertyId);
  const tags = (t.tags || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("");
  return `<div class="row ${t.status === "done" ? "done" : ""}">
    <div class="check ${t.status === "done" ? "done" : ""}" data-toggle="${t.id}">✓</div>
    <div class="body">
      <div class="t">${esc(t.title)}</div>
      <div class="m">
        ${dm ? `<span class="pill-due ${dm.cls}">${dm.text}</span>` : ""}
        ${pn ? `<span>▦ ${esc(pn)}</span>` : ""}
        ${t.priority >= 2 ? `<span class="tag amber">high</span>` : ""}
        ${tags}
      </div>
    </div>
    <div class="actions"><button class="icon-btn" data-edit-task="${t.id}">✎</button></div>
  </div>`;
}

function wireTaskRows(root) {
  root.querySelectorAll("[data-toggle]").forEach((el) =>
    el.addEventListener("click", () => toggleTask(el.dataset.toggle)));
  root.querySelectorAll("[data-edit-task]").forEach((el) =>
    el.addEventListener("click", () => editTask(el.dataset.editTask)));
}

function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const done = t.status === "done";
  DB.upsert("tasks", { ...t, status: done ? "open" : "done", doneAt: done ? null : Date.now() });
}

function propOptions() {
  return [["", "— none —"], ...state.properties.map((p) => [p.id, p.name])];
}

function editTask(id) {
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  formModal({
    title: t ? "Edit Task" : "New Task",
    fields: [
      { key: "title", label: "Task", placeholder: "What needs doing?" },
      { key: "due", label: "Due date", type: "date" },
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "priority", label: "Priority", type: "select", options: [[0, "Normal"], [1, "Medium"], [2, "High"]] },
      { key: "tags", label: "Tags (comma-separated)" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    values: t ? { ...t, tags: (t.tags || []).join(", ") } : { priority: 0 },
    onSubmit: (v) => {
      const tags = v.tags ? v.tags.split(",").map((x) => x.trim()).filter(Boolean) : [];
      DB.upsert("tasks", { ...(t || {}), id: t?.id, title: v.title, due: v.due, propertyId: v.propertyId, priority: Number(v.priority), tags, notes: v.notes, status: t?.status || "open" });
      toast(t ? "Task updated" : "Task added");
    },
    onDelete: t ? () => DB.remove("tasks", t.id) : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  VIEWS
// ─────────────────────────────────────────────────────────────────────────────
const VIEWS = {};

// ─────────────────────────────────────────────────────────────────────────────
//  PERSONAL OPERATING SYSTEM — habits, daily score, goals, reading
// ─────────────────────────────────────────────────────────────────────────────
function dailyHabits() { return state.habits.filter((h) => h.cadence === "daily").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function everyNHabit() { return state.habits.find((h) => h.cadence === "everyN") || null; }
function habitCount(hid, iso = todayISO()) { const l = state.habitLog.find((x) => x.habitId === hid && x.date === iso); return l ? (l.count || 0) : 0; }
function habitDone(h, iso = todayISO()) { return habitCount(h.id, iso) >= (h.target || 1); }
function cycleHabit(h, iso = todayISO()) {
  const cur = habitCount(h.id, iso);
  const next = (cur + 1) % ((h.target || 1) + 1); // 0→…→target→0
  DB.upsert("habitLog", { id: `${h.id}__${iso}`, habitId: h.id, date: iso, count: next });
}
function dayScore(iso = todayISO()) {
  const hs = dailyHabits();
  if (!hs.length) return 0;
  let got = 0, tot = 0;
  for (const h of hs) { const w = h.weight || 1; tot += w; got += Math.min(habitCount(h.id, iso) / (h.target || 1), 1) * w; }
  return Math.round((got / tot) * 100);
}
function habitStreak(h) {
  let s = 0;
  for (let i = 0; i < 400; i++) {
    const iso = toISO(new Date(todayDate().getTime() - i * DAY));
    if (habitDone(h, iso)) s++;
    else if (i === 0) continue; // today not done yet — streak still alive
    else break;
  }
  return s;
}
function habitPct(h, days = 30) {
  let d = 0; for (let i = 0; i < days; i++) { if (habitDone(h, toISO(new Date(todayDate().getTime() - i * DAY)))) d++; }
  return Math.round((d / days) * 100);
}
function avgScore(days = 30) { let s = 0; for (let i = 0; i < days; i++) s += dayScore(toISO(new Date(todayDate().getTime() - i * DAY))); return Math.round(s / days); }
function bestStreakAll() { return Math.max(0, ...dailyHabits().map(habitStreak)); }
function mealPrepStatus(h) {
  const done = state.habitLog.filter((x) => x.habitId === h.id && x.count > 0).map((x) => x.date).sort();
  const last = done.length ? parseISO(done[done.length - 1]) : null;
  const every = Number(h.everyDays) || 5;
  const nextDue = last ? new Date(last.getTime() + every * DAY) : todayDate();
  const daysToDue = Math.round((nextDue - todayDate()) / DAY);
  return { last, nextDue, daysToDue, due: daysToDue <= 0 };
}
function goalPct(g) { const m = g.milestones || []; return m.length ? Math.round(m.filter((x) => x.done).length / m.length * 100) : 0; }

// ── Workout split ─────────────────────────────────────────────────────────────
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function todaysWorkout() { return state.workouts.find((w) => w.dow === todayDate().getDay()) || null; }
function workoutSplitPanel() {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun
  const todayDow = todayDate().getDay();
  return `<div class="panel mb">
    <div class="panel-title"><span class="n">🏋</span> This Week — Workout Split</div>
    ${order.map((d) => {
      const w = state.workouts.find((x) => x.dow === d), isToday = d === todayDow;
      return `<div class="row" data-workout="${d}" style="cursor:pointer;${isToday ? "border-color:var(--amber-line);background:var(--amber-soft)" : ""}">
        <div class="body"><div class="t"><span class="mono" style="display:inline-block;min-width:38px;color:var(--ink-faint)">${DOW_NAMES[d].slice(0, 3)}</span> ${esc(w ? w.focus : "Rest")} ${isToday ? `<span class="tag amber">today</span>` : ""}</div></div>
        <div class="actions"><button class="icon-btn">✎</button></div></div>`;
    }).join("")}
    <div class="mono muted mt" style="font-size:11px">Repeats weekly · tap any day to change it</div>
  </div>`;
}
function editWorkout(dow) {
  const w = state.workouts.find((x) => x.dow === Number(dow)) || { id: "wo-" + dow, dow: Number(dow) };
  const focus = prompt(`${DOW_NAMES[Number(dow)]} workout focus:`, w.focus || "");
  if (focus === null) return;
  DB.upsert("workouts", { ...w, id: "wo-" + dow, dow: Number(dow), focus: focus.trim() });
  toast("Split updated");
}

// ── Personal · My Day (unified morning command screen) ───────────────────────
VIEWS.myday = {
  render() {
    const hs = dailyHabits();
    const score = dayScore();
    const doneH = hs.filter((h) => habitDone(h)).length;
    const mp = everyNHabit();
    const mps = mp ? mealPrepStatus(mp) : null;
    const tasks = openToday();
    const events = state.events.filter((e) => e.date === todayISO());
    const notices = leasesNeedingNotice();
    const permits = activeBuilds().map((p) => ({ p, c: permitStatus(p) })).filter((x) => ["warn", "late"].includes(x.c.cls));
    const maint = maintenanceTasks().length;
    const headsUp = notices.length + permits.length + (maint ? 1 : 0);

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Your Command Center</div><h1>My Day</h1></div>
        <div class="meta">${esc(fmtLong(todayDate()))}</div>
      </div>

      <div class="grid cols-3 mb">
        <div class="stat"><div class="k">Daily Score</div><div class="v ${score >= 90 ? "green" : score >= 60 ? "amber" : "red"}" style="font-size:34px">${score}</div><div class="sub">/100 · non-negotiables</div></div>
        <div class="stat"><div class="k">Habits</div><div class="v ${doneH === hs.length && hs.length ? "green" : ""}">${doneH}/${hs.length}</div><div class="sub">done today</div></div>
        <div class="stat"><div class="k">Priorities</div><div class="v ${tasks.length ? "amber" : "green"}">${tasks.length}</div><div class="sub">tasks due today</div></div>
      </div>

      ${oneThingCard()}

      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">☀</span> Non-Negotiables — your schedule</div>
          ${hs.map(habitRow).join("")}
          ${mp ? mealPrepRow(mp, mps) : ""}
        </div>
        <div class="panel">
          <div class="flex between"><div class="panel-title" style="margin:0"><span class="n">✓</span> Focus Queue — by importance</div>
            <button class="btn sm" data-add-today>+ Task</button></div>
          <div class="mt">${focusQueueHTML()}</div>
          <div class="mono muted mt" style="font-size:11px">Tap ➤ to make any task today's ONE Thing.</div>
        </div>
      </div>

      ${(events.length || headsUp) ? `<div class="grid cols-2 mt">
        <div class="panel">
          <div class="panel-title"><span class="n">▦</span> On Your Calendar Today</div>
          ${events.length ? events.map(eventRow).join("") : `<div class="empty">Nothing scheduled today.</div>`}
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n" style="color:${headsUp ? "var(--red)" : "var(--amber)"}">!</span> Heads-Up</div>
          ${notices.map((l) => { const c = leaseCalc(l); return `<div class="row" data-goto="leases" style="cursor:pointer"><div class="body"><div class="t">Rent notice — ${esc(propName(l.propertyId) || "lease")}</div><div class="m"><span class="tag ${c.status === "due" ? "red" : "amber"}">${LEASE_STATUS[c.status].label}</span><span>by ${c.noticeBy ? fmtDate(toISO(c.noticeBy)) : "—"}</span></div></div></div>`; }).join("")}
          ${permits.map((x) => `<div class="row" data-goto="builds" style="cursor:pointer"><div class="body"><div class="t">Permit clock — ${esc(x.p.name)}</div><div class="m"><span class="clock ${x.c.cls}" style="font-size:12px">${x.c.label}</span></div></div></div>`).join("")}
          ${maint ? `<div class="row" data-goto="maintenance" style="cursor:pointer"><div class="body"><div class="t">${maint} open maintenance ${maint === 1 ? "ticket" : "tickets"}</div><div class="m"><span class="tag blue">DoorLoop</span></div></div></div>` : ""}
          ${!headsUp ? `<div class="empty">All clear. ✈</div>` : ""}
        </div>
      </div>` : ""}
    </div>`;
  },
  mount(root) {
    wireTaskRows(root);
    root.querySelectorAll("[data-habit]").forEach((el) => el.addEventListener("click", () => { const h = state.habits.find((x) => x.id === el.dataset.habit); if (h) cycleHabit(h); }));
    root.querySelectorAll("[data-mealprep]").forEach((el) => el.addEventListener("click", () => { const h = state.habits.find((x) => x.id === el.dataset.mealprep); if (h) DB.upsert("habitLog", { id: `${h.id}__${todayISO()}`, habitId: h.id, date: todayISO(), count: 1 }); toast("Meal prep logged — resets in 5 days"); }));
    root.querySelectorAll("[data-add-today]").forEach((el) => el.addEventListener("click", () => editTaskPrefill({ due: todayISO() })));
    root.querySelectorAll("[data-event]").forEach((el) => el.addEventListener("click", () => editEvent(el.dataset.event)));
    root.querySelectorAll("[data-goto]").forEach((el) => el.addEventListener("click", () => go(el.dataset.goto)));
    root.querySelectorAll("[data-one-done]").forEach((el) => el.addEventListener("click", () => { toggleTask(el.dataset.oneDone); localStorage.removeItem("sshcc:focus"); toast("Done. Next one loaded. 🎯"); }));
    root.querySelectorAll("[data-one-edit]").forEach((el) => el.addEventListener("click", () => editTask(el.dataset.oneEdit)));
    root.querySelectorAll("[data-set-focus]").forEach((el) => el.addEventListener("click", () => { setFocusPin(el.dataset.setFocus); render(); toast("Set as today's ONE Thing 🎯"); }));
  },
};

// ── The front door · "Now" — one thing at a time ─────────────────────────────
VIEWS.now = {
  render() {
    const q = focusQueue();
    const one = q[0], rest = q.slice(1, 6), done = doneTodayCount();
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";

    if (!one) {
      return `<div class="view"><div style="max-width:620px;margin:0 auto">
        <div class="muted" style="font-size:15px;font-weight:600">${greet}.</div>
        <div class="panel mt" style="text-align:center;padding:42px 20px">
          <div style="font-size:44px">🎉</div>
          <div style="font-size:20px;font-weight:800;margin-top:8px">You're clear.</div>
          <div class="muted mt">Everything for today is handled${done ? ` — ${done} done` : ""}. Rest, or line up the next thing.</div>
          <div class="flex mt" style="gap:8px;justify-content:center"><button class="btn primary sm" data-now-add>+ Add a task</button><button class="btn sm ghost" data-goto="myday">See everything →</button></div>
        </div></div></div>`;
    }

    const big = `<div class="panel" style="border:1.5px solid var(--amber-line);background:var(--amber-soft);padding:22px">
      <div class="flex between wrap"><div class="mono muted" style="font-size:11px">${one.icon} ${esc(one.eyebrow)}</div><span class="tag amber">${esc(one.why)}</span></div>
      <div style="font-size:24px;font-weight:800;line-height:1.2;margin-top:10px">${esc(one.title)}</div>
      ${one.sub ? `<div class="mono muted" style="font-size:12px;margin-top:6px">${esc(one.sub)}</div>` : ""}
      ${one.notes ? `<div class="muted mt" style="font-size:13px;white-space:pre-wrap;max-height:150px;overflow:auto">${esc(one.notes)}</div>` : ""}
      <div class="flex" style="gap:8px;margin-top:18px;flex-wrap:wrap">
        <button class="btn primary" ${one.done}>✓ Done — load next</button>
        <button class="btn sm ghost" data-now-skip="${one.kind}:${one.id}">skip for now</button>
        ${one.side ? `<button class="btn sm ghost" ${one.side}>${esc(one.sideLabel)}</button>` : ""}
      </div></div>`;

    const mini = (i) => `<div class="row" style="opacity:.8"><div class="body"><div class="t" style="font-size:13px">${i.icon} ${esc(i.title)}</div><div class="m">${esc(i.eyebrow)}${i.sub ? ` · ${esc(i.sub)}` : ""}</div></div></div>`;

    return `<div class="view"><div style="max-width:620px;margin:0 auto">
      <div class="flex between" style="align-items:baseline">
        <div style="font-size:15px;font-weight:600">${greet}.</div>
        <div class="mono muted" style="font-size:11px">${done ? `🔥 ${done} done today` : "let's begin"}</div>
      </div>
      <div class="muted" style="font-size:11.5px;margin:2px 0 12px">Just this one thing. Finish it and the next loads automatically.</div>
      ${big}
      ${rest.length ? `<details style="margin-top:14px"><summary class="muted" style="cursor:pointer;font-size:12px">▾ ${rest.length} more in line</summary><div class="mt">${rest.map(mini).join("")}</div></details>` : ""}
      <div style="text-align:center;margin-top:20px"><button class="btn sm ghost" data-goto="myday">See everything →</button></div>
    </div></div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-now-done-task]").forEach((el) => el.addEventListener("click", () => {
      const id = el.dataset.nowDoneTask; nowSkips.delete("task:" + id);
      if (focusPin() === id) localStorage.removeItem("sshcc:focus");
      toggleTask(id); toast("Done. Next one up. 🎯");
    }));
    root.querySelectorAll("[data-now-done-lesson]").forEach((el) => el.addEventListener("click", () => {
      const id = el.dataset.nowDoneLesson; const l = state.academy.find((x) => x.id === id); if (!l) return;
      DB.upsert("academy", { ...l, status: "done", doneAt: Date.now() }); toast("Lesson complete 🎓");
    }));
    root.querySelectorAll("[data-now-done-habit]").forEach((el) => el.addEventListener("click", () => {
      const h = state.habits.find((x) => x.id === el.dataset.nowDoneHabit); if (h) { cycleHabit(h); toast("Nice — that's a non-negotiable done. 🔥"); }
    }));
    root.querySelectorAll("[data-now-skip]").forEach((el) => el.addEventListener("click", () => { nowSkips.add(el.dataset.nowSkip); render(); }));
    root.querySelectorAll("[data-now-edit]").forEach((el) => el.addEventListener("click", () => editTask(el.dataset.nowEdit)));
    root.querySelectorAll("[data-now-add]").forEach((el) => el.addEventListener("click", () => editTaskPrefill({ due: todayISO() })));
    root.querySelectorAll("[data-goto]").forEach((el) => el.addEventListener("click", () => go(el.dataset.goto)));
  },
};

// ── Personal · Contractor Academy (CSLB "B" apprenticeship curriculum) ───────
function academyLessons() { return state.academy.slice().sort((a, b) => (a.sec - b.sec) || (a.order - b.order)); }
function academyNext() { return academyLessons().find((l) => l.status !== "done") || null; }

// Practice-exam UI state (not persisted; only the score log in `quizLog` is).
const quizState = { sec: null, answers: {} }; // answers: { [questionId]: choiceIndex }
function quizSecScore(sec) {
  const qs = QUESTIONS.filter((q) => q.sec === sec);
  const logs = state.quizLog || [];
  let answered = 0, correct = 0;
  for (const q of qs) { const lg = logs.find((x) => x.qid === q.id); if (lg) { answered++; if (lg.correct) correct++; } }
  return { total: qs.length, answered, correct };
}
function quizOverall() {
  const logs = state.quizLog || [];
  const correct = logs.filter((x) => x.correct).length;
  return { answered: logs.length, correct, total: QUESTIONS.length };
}

VIEWS.academy = {
  render() {
    const all = academyLessons();
    const done = all.filter((l) => l.status === "done").length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const next = academyNext();
    const dd = daysUntil("2026-12-15");
    const plan = buildPlan(all);
    const ps = planStatus(plan, todayISO(), done);
    const sections = {};
    for (const l of all) { (sections[l.sec] = sections[l.sec] || { title: l.section, sec: l.sec, wk: l.wk, read: l.read, topics: l.topics || [], lessons: [] }).lessons.push(l); }
    const secList = Object.values(sections).sort((a, b) => a.sec - b.sec);
    const vocab = state.vocab.slice().sort((a, b) => (a.term || "").localeCompare(b.term || ""));

    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">CSLB “B” Apprenticeship</div><h1>Contractor Academy</h1></div>
        <div class="mono muted" style="font-size:11px">${done}/${all.length} lessons · ${dd}d to Dec 15</div></div>

      <div class="grid cols-3 mb">
        <div class="stat"><div class="k">Program Progress</div><div class="v ${pct >= 100 ? "green" : "amber"}">${pct}%</div><div class="sub">${done}/${all.length} lessons</div></div>
        <div class="stat"><div class="k">Current Section</div><div class="v" style="font-size:16px">${next ? "§" + next.sec : "Done"}</div><div class="sub">${next ? esc(next.section) : "Exam time"}</div></div>
        <div class="stat"><div class="k">Target</div><div class="v" style="font-size:16px">Dec 15</div><div class="sub">${dd} days out</div></div>
      </div>

      ${next ? `<div class="panel mb" style="border:1.5px solid var(--amber-line);background:var(--amber-soft)">
        <div class="flex between wrap"><div class="panel-title" style="margin:0"><span class="n">🎓</span> ${ps.phase === "pre" ? "Next Up" : "Today's Lesson"}</div>
          ${(() => {
            if (ps.phase === "pre") return `<span class="tag">📅 Plan starts ${esc(fmtWeekday(plan.start))}</span>`;
            const badge = ps.onTrack
              ? (ps.delta > 0 ? `<span class="tag" style="background:var(--ok-soft,rgba(40,180,120,.14));color:var(--ok,#28b478)">🚀 ${ps.delta} ahead</span>`
                              : `<span class="tag" style="background:var(--ok-soft,rgba(40,180,120,.14));color:var(--ok,#28b478)">✅ On track</span>`)
              : `<span class="tag amber">⚠️ ${-ps.delta} behind</span>`;
            return `<span class="mono muted" style="font-size:11px">Pace: lesson ${Math.min(ps.expected, ps.total)}/${ps.total}</span> ${badge}`;
          })()}</div>
        <div class="mono muted" style="font-size:11px;margin-top:2px">📅 ${esc(fmtWeekday(todayISO()))}${ps.isReviewDay && ps.phase === "active" ? " · Review & practice-exam day — no new lesson scheduled, so drill what you've learned" : ""}</div>
        <div style="font-size:19px;font-weight:700;margin-top:6px">${esc(next.title)}</div>
        <div class="mono muted" style="font-size:11px;margin-top:3px">${esc(next.section)}</div>
        ${next.objective ? `<div class="mt" style="font-size:13px"><strong>Objective:</strong> ${esc(next.objective)}</div>` : ""}
        ${next.content ? `<div class="mt" style="font-size:13px;white-space:pre-wrap">${esc(next.content)}</div>` : `<div class="muted mt" style="font-size:12.5px">Ask me — “Claude, teach me today's lesson” — and I'll explain it end to end until it clicks, then mark it complete.</div>`}
        ${next.cite ? `<div class="mono muted mt" style="font-size:10.5px">📖 Source: ${esc(next.cite)}</div>` : ""}
        <div class="mt"><button class="btn primary sm" data-lesson-done="${next.id}">✓ Complete lesson → next</button></div>
      </div>` : `<div class="panel mb"><div class="empty">🎉 Curriculum complete — you're ready for the exam.</div></div>`}

      ${(() => {
        const ranges = sectionRanges(plan);
        const doneBySec = {}; for (const l of all) { doneBySec[l.sec] = doneBySec[l.sec] || { d: 0, t: 0 }; doneBySec[l.sec].t++; if (l.status === "done") doneBySec[l.sec].d++; }
        const t = todayISO();
        const milestone = (icon, label, when, sub) => `<div class="flex between" style="padding:5px 0;border-bottom:1px dashed var(--line)"><div style="font-size:12.5px"><strong>${icon} ${esc(label)}</strong>${sub ? ` <span class="muted" style="font-size:11px">${esc(sub)}</span>` : ""}</div><div class="mono" style="font-size:11.5px">${esc(when)}</div></div>`;
        const perDayTxt = plan.perDay === 1 ? "one lesson every weekday" : `${plan.perDay} lessons every weekday`;
        const secLabel = (part) => { const rs = ranges.filter((r) => r.part === part); return rs.length ? `§${rs[0].sec}–§${rs[rs.length - 1].sec}` : ""; };
        return `<div class="panel mb">
        <div class="panel-title"><span class="n">📅</span> Your Study Plan — ${perDayTxt}, starting ${esc(fmtShort(plan.start))}</div>
        <div class="muted" style="font-size:11.5px;margin:-2px 0 8px">Paced to finish all ${plan.total} lessons by ${esc(fmtShort(plan.finish))} — that's ${perDayTxt} — leaving a buffer to drill to 80%+, sit both CSLB exams, and get licensed by ${esc(fmtShort(plan.examTarget))}. Weekends are for review + practice questions. Move faster anytime — “Complete lesson” always jumps you to the next one.</div>
        <div class="mb" style="font-size:11.5px">
          ${plan.hasSplit ? `
          ${milestone("📘", "Law & Business lessons", `${fmtShort(plan.lbStart)} – ${fmtShort(plan.lbEnd)}`, secLabel("L&B"))}
          ${milestone("🎯", "Take the L&B exam", fmtWeekday(plan.lbExam), "target")}
          ${milestone("🔨", "Trade lessons", `${fmtShort(plan.trStart)} – ${fmtShort(plan.trEnd)}`, secLabel("Trade"))}
          ${milestone("🎯", "Take the Trade exam", fmtWeekday(plan.trExam), "target")}` : `
          ${milestone("📚", "All lessons", `${fmtShort(plan.start)} – ${fmtShort(plan.finish)}`, `${plan.total} lessons`)}
          ${milestone("🎯", "Take the Trade exam", fmtWeekday(plan.trExam), "target")}
          ${milestone("🎯", "Take the L&B exam", fmtWeekday(plan.lbExam), "target")}`}
          ${milestone("🎓", "Review buffer → licensed", `by ${fmtShort(plan.examTarget)}`, "practice exams + application")}
        </div>
        <div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin-bottom:4px">SECTION-BY-SECTION CALENDAR</div>
        ${ranges.map((r) => { const dc = doneBySec[r.sec] || { d: 0, t: r.count }; const p = Math.round(dc.d / dc.t * 100); const nowHere = t >= r.start && t <= r.end; const cur = next && next.sec === r.sec;
          return `<div class="flex between" style="padding:4px 0;${cur ? "border-left:2px solid var(--amber);padding-left:8px;margin-left:-2px" : ""}">
            <div style="font-size:12px"><span class="mono muted" style="font-size:10px">${r.part === "L&B" ? "📘" : "🔨"}</span> §${r.sec} ${esc(r.title.split(" · ")[1] || r.title)}${nowHere ? ` <span class="tag amber" style="font-size:9px">◀ now</span>` : ""}</div>
            <div class="mono muted" style="font-size:10.5px">${fmtShort(r.start)}–${fmtShort(r.end)} · ${dc.d}/${dc.t}</div>
          </div>`; }).join("")}
      </div>`; })()}

      <div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> Curriculum roadmap — 6 months to your B license</div>
        <div class="muted" style="font-size:11.5px;margin:-2px 0 8px">Built from the official CSLB exam blueprint. Two exams: <strong>L&amp;B</strong> (Law &amp; Business) then <strong>Trade</strong> (General Building B). Each section is weighted by its real share of the exam (shown as %).</div>
        <div class="mb" style="font-size:11.5px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2,transparent)">
          <div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin-bottom:4px">📚 YOUR TWO TEXTS</div>
          ${TEXTS.map((t) => `<div style="margin-bottom:2px"><strong>${esc(t.title)}</strong> <span class="muted">— ${esc(t.author)} · ${esc(t.use)}</span></div>`).join("")}
          <div class="muted" style="font-size:10.5px;margin-top:6px">📝 ${esc(EXAM_FACTS)}</div>
        </div>
        ${secList.map((s) => { const d = s.lessons.filter((l) => l.status === "done").length, p = Math.round(d / s.lessons.length * 100), cur = next && next.sec === s.sec;
          return `<div class="mb" style="${cur ? "border-left:2px solid var(--amber);padding-left:10px" : ""}">
            <div class="flex between"><div style="font-weight:600;font-size:13px">§${s.sec} — ${esc(s.title)} ${cur ? `<span class="tag amber">now</span>` : ""}</div><div class="mono muted" style="font-size:11px">${d}/${s.lessons.length}</div></div>
            <div class="bar" style="margin-top:4px"><span class="${p >= 100 ? "ok" : ""}" style="width:${p}%"></span></div>
            ${s.read ? `<div class="muted" style="font-size:10.5px;margin-top:4px">📖 ${esc(s.read)}</div>` : ""}
            ${s.topics && s.topics.length ? `<div class="mt" style="display:flex;flex-wrap:wrap;gap:4px">${s.topics.map((t) => `<span class="tag" style="font-size:10px">${esc(t)}</span>`).join("")}</div>` : ""}
            <div class="mt">${s.lessons.map((l) => `<div class="row" style="padding:6px 10px;margin-bottom:4px"><div class="check ${l.status === "done" ? "done" : ""}" data-lesson-toggle="${l.id}" style="width:18px;height:18px;font-size:11px">✓</div><div class="body"><div class="t" style="font-size:12.5px">${esc(l.title)}</div></div></div>`).join("")}</div>
          </div>`; }).join("")}
      </div>

      ${(() => {
        const ov = quizOverall();
        const opct = ov.answered ? Math.round((ov.correct / ov.answered) * 100) : 0;
        const secMeta = {}; for (const s of secList) secMeta[s.sec] = s.title;
        const secNums = [...new Set(QUESTIONS.map((q) => q.sec))].sort((a, b) => a - b);
        const activeQs = quizState.sec != null ? QUESTIONS.filter((q) => q.sec === quizState.sec) : [];
        return `<div class="panel mb">
        <div class="flex between wrap"><div class="panel-title" style="margin:0"><span class="n">📝</span> Practice Exam</div>
          <span class="mono muted" style="font-size:11px">${ov.correct}/${ov.answered} correct · ${opct}% · ${QUESTIONS.length} questions</span></div>
        <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Official CSLB format — four choices, one BEST answer, no penalty for guessing. Pick a section to drill; your score is saved and syncs across devices. Aim for 80%+ before the exam.</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
          ${secNums.map((n) => { const sc = quizSecScore(n); const on = quizState.sec === n; const rate = sc.answered ? Math.round((sc.correct / sc.answered) * 100) : null;
            return `<button class="btn sm ${on ? "primary" : ""}" data-quiz-sec="${n}" style="font-size:11px">§${n}${rate != null ? ` · ${rate}%` : ""}</button>`; }).join("")}
          ${quizState.sec != null ? `<button class="btn sm" data-quiz-sec="close" style="font-size:11px">✕ close</button>` : ""}
        </div>
        ${activeQs.length ? `<div style="font-weight:600;font-size:12.5px;margin:6px 0 4px">§${quizState.sec} — ${esc(secMeta[quizState.sec] || "")}</div>
          ${activeQs.map((q) => { const picked = quizState.answers[q.id]; const revealed = picked != null;
            return `<div class="mb" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px">
              <div style="font-size:12.5px;font-weight:600;margin-bottom:6px">${esc(q.q)}</div>
              ${q.choices.map((c, i) => { let bg = "transparent", bd = "var(--line)";
                if (revealed && i === q.answer) { bg = "var(--ok-soft,rgba(40,180,120,.14))"; bd = "var(--ok,#28b478)"; }
                else if (revealed && i === picked) { bg = "rgba(220,80,80,.12)"; bd = "#dc5050"; }
                return `<button class="quiz-choice" data-quiz-q="${q.id}" data-quiz-choice="${i}" ${revealed ? "disabled" : ""} style="display:block;width:100%;text-align:left;font-size:12px;padding:6px 9px;margin-bottom:4px;border:1px solid ${bd};border-radius:6px;background:${bg};cursor:${revealed ? "default" : "pointer"}">${String.fromCharCode(97 + i)}. ${esc(c)}</button>`; }).join("")}
              ${revealed ? `<div class="muted" style="font-size:11px;margin-top:4px">${picked === q.answer ? "✅ Correct." : "❌ Incorrect."} ${esc(q.explain)} <span class="mono">(${esc(q.cite)})</span></div>` : ""}
            </div>`; }).join("")}` : `<div class="muted" style="font-size:11.5px">Select a section above to start a set.</div>`}
      </div>`; })()}

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> Knowledge Base — vocabulary (${vocab.length})</div>
        ${vocab.length ? vocab.map((v) => `<div class="row" style="padding:8px 10px"><div class="body"><div class="t" style="font-size:13px">${esc(v.term)}</div><div class="m" style="white-space:normal">${esc(v.def || "")}</div></div></div>`).join("") : `<div class="empty">Terms you learn get saved here for spaced-repetition review.</div>`}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-lesson-done],[data-lesson-toggle]").forEach((el) => el.addEventListener("click", () => {
      const id = el.dataset.lessonDone || el.dataset.lessonToggle;
      const l = state.academy.find((x) => x.id === id); if (!l) return;
      DB.upsert("academy", { ...l, status: l.status === "done" ? "todo" : "done", doneAt: l.status === "done" ? null : Date.now() });
      if (el.dataset.lessonDone) toast("Lesson complete 🎓");
    }));

    // Practice-exam: pick / close a section (UI-only state → re-render directly).
    root.querySelectorAll("[data-quiz-sec]").forEach((el) => el.addEventListener("click", () => {
      const v = el.dataset.quizSec;
      quizState.sec = v === "close" ? null : Number(v);
      render();
    }));

    // Practice-exam: answer a question — record UI pick + persist score to quizLog.
    root.querySelectorAll(".quiz-choice").forEach((el) => el.addEventListener("click", () => {
      const qid = el.dataset.quizQ, idx = Number(el.dataset.quizChoice);
      if (quizState.answers[qid] != null) return; // already answered
      const q = QUESTIONS.find((x) => x.id === qid); if (!q) return;
      quizState.answers[qid] = idx;
      const correct = idx === q.answer;
      DB.upsert("quizLog", { id: "ql-" + qid, qid, sec: q.sec, choice: idx, correct, at: Date.now() });
      toast(correct ? "✅ Correct" : "❌ Not quite — read the explanation");
    }));
  },
};

// ── Personal · Daily Non-Negotiables ─────────────────────────────────────────
VIEWS.dailyos = {
  render() {
    const hs = dailyHabits();
    const score = dayScore();
    const doneCount = hs.filter((h) => habitDone(h)).length;
    const mp = everyNHabit();
    const mps = mp ? mealPrepStatus(mp) : null;
    const avg = avgScore();

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Personal Operating System</div><h1>Daily Non-Negotiables</h1></div>
        <div class="meta">${esc(fmtLong(todayDate()))}</div>
      </div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Today's Score</div><div class="v ${score >= 90 ? "green" : score >= 60 ? "amber" : "red"}" style="font-size:36px">${score}</div><div class="sub">/ 100 · ${doneCount}/${hs.length} done</div></div>
        <div class="stat"><div class="k">30-Day Consistency</div><div class="v ${avg >= 80 ? "green" : avg >= 60 ? "amber" : "red"}">${avg}<span style="font-size:16px">%</span></div><div class="sub">avg daily score</div></div>
        <div class="stat"><div class="k">Best Streak</div><div class="v amber">${bestStreakAll()}<span style="font-size:16px">d</span></div><div class="sub">across habits</div></div>
        <div class="stat"><div class="k">Meal Prep</div><div class="v ${mps ? (mps.due ? "amber" : "green") : ""}" style="font-size:20px">${mps ? (mps.due ? "Due now" : "in " + mps.daysToDue + "d") : "—"}</div><div class="sub">${mps && mps.last ? "last " + fmtDate(toISO(mps.last)) : "5-day cycle"}</div></div>
      </div>

      ${workoutSplitPanel()}

      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">▸</span> Today's checklist — tap to complete</div>
          ${hs.map(habitRow).join("")}
          ${mp ? mealPrepRow(mp, mps) : ""}
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n">▸</span> Streaks &amp; 30-day consistency</div>
          ${hs.map(habitBar).join("")}
          <div class="mono muted mt" style="font-size:11px">🔥 = current streak · bar = last-30-day completion</div>
        </div>
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-habit]").forEach((el) => el.addEventListener("click", () => { const h = state.habits.find((x) => x.id === el.dataset.habit); if (h) cycleHabit(h); }));
    root.querySelectorAll("[data-mealprep]").forEach((el) => el.addEventListener("click", () => { const h = state.habits.find((x) => x.id === el.dataset.mealprep); if (h) DB.upsert("habitLog", { id: `${h.id}__${todayISO()}`, habitId: h.id, date: todayISO(), count: 1 }); toast("Meal prep logged — resets in 5 days"); }));
    root.querySelectorAll("[data-workout]").forEach((el) => el.addEventListener("click", () => editWorkout(el.dataset.workout)));
  },
};

function habitRow(h) {
  const cnt = habitCount(h.id), target = h.target || 1, done = cnt >= target, streak = habitStreak(h);
  const wo = /workout/i.test(h.name) ? todaysWorkout() : null;
  return `<div class="row ${done ? "done" : ""}" data-habit="${h.id}" style="cursor:pointer">
    <div class="check ${done ? "done" : ""}">${done ? "✓" : (target > 1 ? cnt : "")}</div>
    <div class="body"><div class="t">${esc(h.icon || "")} ${esc(h.name)}${wo ? ` <span class="tag green">🏋 ${esc(wo.focus)}</span>` : ""}</div>
      <div class="m">${h.time ? `<span class="mono">${esc(h.time)}</span>` : ""}${target > 1 ? `<span class="mono">${cnt}/${target}</span>` : ""}${streak > 0 ? `<span class="tag amber">🔥 ${streak}d</span>` : ""}</div></div>
  </div>`;
}
function mealPrepRow(h, s) {
  return `<div class="row ${s.due ? "" : "done"}" data-mealprep="${h.id}" style="cursor:pointer">
    <div class="check ${s.due ? "" : "done"}">${s.due ? "" : "✓"}</div>
    <div class="body"><div class="t">${esc(h.icon || "")} ${esc(h.name)}</div>
      <div class="m"><span class="tag ${s.due ? "amber" : "green"}">${s.due ? "Due now" : "next in " + s.daysToDue + "d"}</span></div></div>
  </div>`;
}
function habitBar(h) {
  const pct = habitPct(h), cls = pct >= 80 ? "high" : pct < 50 ? "low" : "";
  return `<div class="fbar-row"><div class="fname">${esc(h.icon || "")} ${esc(h.name)}</div>
    <div class="fbar-track"><div class="fbar-fill ${cls}" style="width:${pct}%"></div></div>
    <div class="fbar-meta">${pct}% · 🔥${habitStreak(h)}</div></div>`;
}

// ── Personal · Goals ─────────────────────────────────────────────────────────
VIEWS.goals = {
  render() {
    const goals = [...state.goals].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Long-Term Objectives</div><h1>Goals</h1></div>
        <button class="btn primary" data-add-goal>+ Goal</button></div>
      ${goals.length ? goals.map(goalCard).join("") : `<div class="empty">No goals yet.</div>`}
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-milestone]").forEach((el) => el.addEventListener("click", () => toggleMilestone(el.dataset.milestone)));
    root.querySelectorAll("[data-edit-goal]").forEach((el) => el.addEventListener("click", () => editGoal(el.dataset.editGoal)));
    root.querySelectorAll("[data-add-goal]").forEach((el) => el.addEventListener("click", () => editGoal()));
    root.querySelectorAll("[data-add-milestone]").forEach((el) => el.addEventListener("click", () => addMilestone(el.dataset.addMilestone)));
  },
};

function goalCard(g) {
  const pct = goalPct(g), dd = g.targetDate ? daysUntil(g.targetDate) : null;
  const done = (g.milestones || []).filter((m) => m.done).length;
  return `
  <div class="panel mb">
    <div class="flex between wrap" style="align-items:flex-start">
      <div><div class="panel-title" style="margin:0"><span class="n">◎</span> ${esc(g.title)}</div>
        ${g.why ? `<div class="mono muted" style="font-size:11px;margin-top:4px;max-width:640px">${esc(g.why)}</div>` : ""}</div>
      <div style="text-align:right"><div class="clock ${pct >= 100 ? "ok" : pct >= 50 ? "warn" : "late"}">${pct}%</div>
        ${g.targetDate ? `<div class="mono muted" style="font-size:10px">${fmtDate(g.targetDate)}${dd != null ? " · " + dd + "d" : ""}</div>` : ""}</div>
    </div>
    <div class="bar mt"><span class="${pct >= 100 ? "ok" : ""}" style="width:${pct}%"></span></div>
    <div class="mono muted" style="font-size:10px;margin-top:5px">${done}/${(g.milestones || []).length} milestones</div>
    <div class="mt">${(g.milestones || []).map((m, i) => `<div class="row ${m.done ? "done" : ""}" style="margin-bottom:6px">
      <div class="check ${m.done ? "done" : ""}" data-milestone="${g.id}:${i}" style="cursor:pointer">✓</div>
      <div class="body"><div class="t" style="font-size:13px">${esc(m.t)}</div></div></div>`).join("")}</div>
    <div class="flex mt" style="gap:8px"><button class="btn sm ghost" data-add-milestone="${g.id}">+ Milestone</button>
      <button class="btn sm ghost" data-edit-goal="${g.id}">✎ Edit goal</button></div>
  </div>`;
}
function toggleMilestone(ref) {
  const [gid, idx] = ref.split(":"); const g = state.goals.find((x) => x.id === gid); if (!g) return;
  const ms = [...(g.milestones || [])]; ms[Number(idx)] = { ...ms[Number(idx)], done: !ms[Number(idx)].done };
  DB.upsert("goals", { ...g, milestones: ms });
}
function addMilestone(gid) {
  const g = state.goals.find((x) => x.id === gid); if (!g) return;
  const t = prompt("New milestone:"); if (!t) return;
  DB.upsert("goals", { ...g, milestones: [...(g.milestones || []), { t, done: false }] });
}
function editGoal(id) {
  const g = id ? state.goals.find((x) => x.id === id) : null;
  formModal({
    title: g ? "Edit Goal" : "New Goal",
    fields: [
      { key: "title", label: "Goal" },
      { key: "why", label: "Why it matters", type: "textarea" },
      { key: "targetDate", label: "Target date", type: "date" },
    ],
    values: g || {},
    onSubmit: (v) => { DB.upsert("goals", { ...(g || { milestones: [] }), ...v }); toast("Saved"); },
    onDelete: g ? () => DB.remove("goals", g.id) : null,
  });
}

// ── Personal · Reading ───────────────────────────────────────────────────────
VIEWS.reading = {
  render() {
    const books = [...state.books].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const reading = books.find((b) => b.status === "reading");
    const finished = books.filter((b) => b.status === "finished");
    const queue = books.filter((b) => b.status === "queued");
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">15 minutes a day</div><h1>Reading</h1></div>
        <button class="btn primary" data-add-book>+ Book</button></div>

      ${reading ? `<div class="panel mb" style="border-color:var(--amber-line);background:var(--amber-soft)">
        <div class="panel-title"><span class="n">▸</span> Reading now</div>
        <div style="font-size:20px;font-weight:700">${esc(reading.title)}</div>
        <div class="mono muted" style="margin-top:2px">${esc(reading.author || "")}</div>
        ${reading.note ? `<div class="muted mt" style="font-size:13px">${esc(reading.note)}</div>` : ""}
        <div class="mt"><button class="btn primary sm" data-finish="${reading.id}">✓ Finished — recommend my next book</button></div>
      </div>` : `<div class="panel mb"><div class="empty">No book in progress. Start the next one below. 👇</div></div>`}

      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">▸</span> Up next — ranked by impact</div>
          ${queue.length ? queue.map((b, i) => `<div class="row"><div class="body">
            <div class="t">${i === 0 ? "➡️ " : ""}${esc(b.title)}</div>
            <div class="m"><span>${esc(b.author || "")}</span>${b.note ? `<span class="muted">${esc(b.note)}</span>` : ""}</div></div>
            <div class="actions">${!reading && i === 0 ? `<button class="btn sm" data-start="${b.id}">Start</button>` : ""}<button class="icon-btn" data-edit-book="${b.id}">✎</button></div></div>`).join("") : `<div class="empty">Queue empty — add your next reads.</div>`}
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n">▸</span> Finished (${finished.length})</div>
          ${finished.length ? finished.map((b) => `<div class="row"><div class="body"><div class="t">✓ ${esc(b.title)}</div><div class="m">${esc(b.author || "")}${b.finishedDate ? ` · ${fmtDate(b.finishedDate)}` : ""}</div></div></div>`).join("") : `<div class="empty">—</div>`}
        </div>
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-finish]").forEach((el) => el.addEventListener("click", () => finishBook(el.dataset.finish)));
    root.querySelectorAll("[data-start]").forEach((el) => el.addEventListener("click", () => { const b = state.books.find((x) => x.id === el.dataset.start); if (b) DB.upsert("books", { ...b, status: "reading" }); }));
    root.querySelectorAll("[data-edit-book]").forEach((el) => el.addEventListener("click", () => editBook(el.dataset.editBook)));
    root.querySelectorAll("[data-add-book]").forEach((el) => el.addEventListener("click", () => editBook()));
  },
};
function finishBook(id) {
  const b = state.books.find((x) => x.id === id); if (!b) return;
  DB.upsert("books", { ...b, status: "finished", finishedDate: todayISO() });
  const next = [...state.books].filter((x) => x.status === "queued").sort((a, b2) => (a.order ?? 0) - (b2.order ?? 0))[0];
  if (next) { DB.upsert("books", { ...next, status: "reading" }); toast(`Nice. Next up: ${next.title}`); }
  else toast("Finished! Add your next book.");
}
function editBook(id) {
  const b = id ? state.books.find((x) => x.id === id) : null;
  formModal({
    title: b ? "Edit Book" : "Add Book",
    fields: [
      { key: "title", label: "Title" },
      { key: "author", label: "Author" },
      { key: "status", label: "Status", type: "select", options: [["queued", "Up next"], ["reading", "Reading now"], ["finished", "Finished"]] },
      { key: "note", label: "Why / focus area" },
    ],
    values: b || { status: "queued", order: 99 },
    onSubmit: (v) => { DB.upsert("books", { ...(b || { order: 99 }), ...v }); toast("Saved"); },
    onDelete: b ? () => DB.remove("books", b.id) : null,
  });
}

// ── 01 TODAY ─────────────────────────────────────────────────────────────────
VIEWS.today = {
  render() {
    const today = openToday();
    const routines = todaysRoutines();
    const doneR = routines.filter((r) => r.done).length;
    const upcoming = state.events
      .filter((e) => { const n = daysUntil(e.date); return n !== null && n >= 0 && n <= 14; })
      .sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 6);
    const builds = activeBuilds();
    const contentToday = state.content.filter((c) => c.date === todayISO());

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Command Center</div><h1>Today</h1></div>
        <div class="meta">${esc(fmtLong(todayDate()))}</div>
      </div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Due Today</div><div class="v ${today.length ? "amber" : "green"}">${today.length}</div><div class="sub">open tasks</div></div>
        <div class="stat"><div class="k">Routines</div><div class="v ${doneR === routines.length && routines.length ? "green" : ""}">${doneR}/${routines.length}</div><div class="sub">done</div></div>
        <div class="stat"><div class="k">Active Builds</div><div class="v">${builds.length}</div><div class="sub">in progress</div></div>
        <div class="stat"><div class="k">Next 14d Events</div><div class="v ${upcoming.length ? "amber" : ""}">${upcoming.length}</div><div class="sub">property calendar</div></div>
      </div>

      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">01</span> Due Today &amp; Overdue</div>
          <div id="todayTasks">${today.length ? today.map(taskRow).join("") : `<div class="empty">Nothing due. Clear runway. ✈</div>`}</div>
          <button class="btn sm mt" data-add-task>+ Add task</button>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n">02</span> Daily Routines</div>
          <div id="todayRoutines">${routines.map(routineRow).join("") || `<div class="empty">No routines yet.</div>`}</div>
        </div>
      </div>

      <div class="grid cols-2 mt">
        <div class="panel">
          <div class="panel-title"><span class="n">03</span> Permit Clocks</div>
          ${builds.length ? builds.map(permitMini).join("") : `<div class="empty">No active builds.</div>`}
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n">04</span> Upcoming — Property Calendar</div>
          ${upcoming.length ? upcoming.map(eventRow).join("") : `<div class="empty">Nothing in the next two weeks.</div>`}
          ${contentToday.length ? `<div class="panel-title mt"><span class="n">05</span> Content Due Today</div>${contentToday.map(contentRow).join("")}` : ""}
        </div>
      </div>

      ${(() => {
        const notices = leasesNeedingNotice();
        if (!notices.length) return "";
        return `<div class="panel mt" style="border-color:var(--red);background:rgba(255,107,107,0.06)">
          <div class="panel-title"><span class="n" style="color:var(--red)">!</span> Rent Increases — Action Needed</div>
          ${notices.map((l) => { const c = leaseCalc(l); return `<div class="row" data-lease-today="${l.id}" style="cursor:pointer"><div class="body">
            <div class="t">${esc(propName(l.propertyId) || l.propertyName || "Lease")}${l.unit ? " · " + esc(l.unit) : ""}</div>
            <div class="m"><span class="tag ${c.status === "due" ? "red" : "amber"}">${LEASE_STATUS[c.status].label}</span>
            <span>notice by ${c.noticeBy ? fmtDate(toISO(c.noticeBy)) : "—"}</span>
            <span>→ ${money0(c.nextRent)} (${c.cap}%)</span></div></div></div>`; }).join("")}
        </div>`;
      })()}
    </div>`;
  },
  mount(root) {
    wireTaskRows(root);
    root.querySelectorAll("[data-lease-today]").forEach((el) => el.addEventListener("click", () => go("leases")));
    root.querySelectorAll("[data-routine-toggle]").forEach((el) =>
      el.addEventListener("click", () => toggleRoutine(el.dataset.routineToggle)));
    root.querySelectorAll("[data-add-task]").forEach((el) => el.addEventListener("click", () => editTask()));
    root.querySelectorAll("[data-event]").forEach((el) => el.addEventListener("click", () => editEvent(el.dataset.event)));
    root.querySelectorAll("[data-edit-content]").forEach((el) => el.addEventListener("click", () => editContent(el.dataset.editContent)));
    root.querySelectorAll("[data-build]").forEach((el) => el.addEventListener("click", () => { go("builds"); }));
  },
};

function permitMini(p) {
  const c = permitStatus(p);
  return `<div class="row" data-build="${p.id}" style="cursor:pointer">
    <div class="body">
      <div class="t">${esc(p.name)}</div>
      <div class="m"><span>${esc(p.stage || "—")}</span></div>
    </div>
    <div class="clock ${c.cls}" style="font-size:16px">${c.label}</div>
  </div>`;
}

function eventRow(e) {
  const dm = dueMeta(e.date);
  return `<div class="row" data-event="${e.id}" style="cursor:pointer">
    <div class="body">
      <div class="t">${esc(e.title)}</div>
      <div class="m">
        <span class="tag ${eventTagCls(e.type)}">${esc(e.type)}</span>
        ${propName(e.propertyId) ? `<span>▦ ${esc(propName(e.propertyId))}</span>` : ""}
        ${dm ? `<span class="pill-due ${dm.cls}">${dm.text}</span>` : ""}
      </div>
    </div>
  </div>`;
}
function eventTagCls(t) { return { build: "violet", maintenance: "blue", "lease-end": "red", vacancy: "amber", inspection: "green" }[t] || ""; }

// ── 02 CAPTURE ───────────────────────────────────────────────────────────────
VIEWS.capture = {
  render() {
    const supported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Inbox</div><h1>Capture</h1></div>
        <div class="meta">voice or type → route it</div></div>
      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">01</span> Quick Capture</div>
          <div style="text-align:center;margin:10px 0 16px">
            <button class="mic-btn" id="micBtn" title="${supported ? "Tap to dictate" : "Voice not supported in this browser"}">🎙</button>
            <div class="mono muted" id="micState" style="font-size:11px;margin-top:8px">${supported ? "Tap mic to dictate" : "Type below (voice unsupported here)"}</div>
          </div>
          <textarea id="capText" placeholder="Type or dictate… e.g. 'Call Painter inspector Friday'"></textarea>
          <div class="form-row mt">
            <label class="field"><span class="lab">Route to</span>
              <select id="capDest">
                <option value="task">Task / To-do</option>
                <option value="backlog">Backlog (no date)</option>
                <option value="content">Content idea</option>
                <option value="event">Property calendar event</option>
              </select></label>
            <label class="field"><span class="lab">Property</span>
              <select id="capProp">${propOptions().map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label>
          </div>
          <div class="flex" style="gap:8px">
            <button class="btn primary" id="capSave">Capture ↵</button>
            <button class="btn ghost" id="capClear">Clear</button>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="n">02</span> Just Captured</div>
          <div id="recentCap">${recentCaptures()}</div>
        </div>
      </div>
    </div>`;
  },
  mount(root) {
    const ta = $("#capText", root);
    const destSel = $("#capDest", root);
    const propSel = $("#capProp", root);
    const save = () => {
      const text = ta.value.trim();
      if (!text) { toast("Nothing to capture"); return; }
      routeCapture(text, destSel.value, propSel.value);
      ta.value = "";
      ta.focus();
    };
    $("#capSave", root).addEventListener("click", save);
    $("#capClear", root).addEventListener("click", () => { ta.value = ""; ta.focus(); });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); });

    // Voice
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $("#micBtn", root);
    const stateEl = $("#micState", root);
    if (SR) {
      let rec = null, listening = false;
      btn.addEventListener("click", () => {
        if (listening) { rec && rec.stop(); return; }
        rec = new SR();
        rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
        let base = ta.value ? ta.value + " " : "";
        rec.onstart = () => { listening = true; btn.classList.add("rec"); stateEl.textContent = "Listening… tap to stop"; };
        rec.onerror = (e) => { stateEl.textContent = "Mic error: " + e.error; };
        rec.onend = () => { listening = false; btn.classList.remove("rec"); stateEl.textContent = "Tap mic to dictate"; };
        rec.onresult = (ev) => {
          let interim = "", final = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
          }
          if (final) base += final;
          ta.value = (base + interim).trim();
        };
        rec.start();
      });
    } else {
      btn.addEventListener("click", () => ta.focus());
    }
  },
};

function recentCaptures() {
  const items = [...state.tasks, ...state.content, ...state.events]
    .filter((x) => x.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  if (!items.length) return `<div class="empty">Captured items show up here.</div>`;
  return items.map((x) => {
    const kind = x.title != null && x.platform ? "content" : x.type ? "event" : "task";
    return `<div class="row"><div class="body"><div class="t">${esc(x.title)}</div>
      <div class="m"><span class="tag ${kind === "content" ? "blue" : kind === "event" ? "amber" : ""}">${kind}</span>
      ${propName(x.propertyId) ? `<span>▦ ${esc(propName(x.propertyId))}</span>` : ""}</div></div></div>`;
  }).join("");
}

function routeCapture(text, dest, propId) {
  if (dest === "content") {
    DB.upsert("content", { id: undefined, title: text, platform: "Instagram", status: "idea", date: "", notes: "", propertyId: propId });
  } else if (dest === "event") {
    DB.upsert("events", { id: undefined, title: text, type: "maintenance", date: todayISO(), propertyId: propId, notes: "" });
  } else {
    const due = dest === "task" ? guessDate(text) : "";
    DB.upsert("tasks", { id: undefined, title: text, due, status: "open", propertyId: propId, priority: 0, tags: [] });
  }
  toast("Captured → " + dest);
}

// Extremely light natural-date guess for capture convenience.
function guessDate(text) {
  const t = text.toLowerCase();
  const base = todayDate();
  const add = (n) => toISO(new Date(base.getTime() + n * DAY));
  if (/\btoday\b/.test(t)) return add(0);
  if (/\btomorrow\b/.test(t)) return add(1);
  const dows = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${dows[i]}\\b`).test(t)) {
      let diff = (i - base.getDay() + 7) % 7; if (diff === 0) diff = 7;
      return add(diff);
    }
  }
  const m = t.match(/\bin (\d+) days?\b/); if (m) return add(Number(m[1]));
  if (/\bnext week\b/.test(t)) return add(7);
  return "";
}

// ── 03 CONTENT CALENDAR ──────────────────────────────────────────────────────
const CONTENT_STAGES = ["idea", "scripted", "filmed", "scheduled", "posted"];
VIEWS.content = {
  render() {
    const byStage = Object.fromEntries(CONTENT_STAGES.map((s) => [s, []]));
    state.content.forEach((c) => (byStage[c.status] || byStage.idea).push(c));
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Marketing</div><h1>Content Calendar</h1></div>
        <button class="btn primary" data-add-content>+ New content</button></div>
      <div class="grid cols-4" style="grid-template-columns:repeat(5,1fr);align-items:start">
        ${CONTENT_STAGES.map((s) => `
          <div class="panel" style="padding:12px">
            <div class="panel-title" style="margin-bottom:8px"><span class="n">▸</span> ${esc(s)} <span class="badge" style="margin-left:auto">${byStage[s].length}</span></div>
            ${byStage[s].sort((a,b)=>(a.date||"~").localeCompare(b.date||"~")).map(contentCard).join("") || `<div class="empty" style="padding:14px;font-size:11px">—</div>`}
          </div>`).join("")}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-add-content]").forEach((el) => el.addEventListener("click", () => editContent()));
    root.querySelectorAll("[data-edit-content]").forEach((el) => el.addEventListener("click", () => editContent(el.dataset.editContent)));
  },
};

function contentCard(c) {
  return `<div class="row" data-edit-content="${c.id}" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:5px">
    <div class="t" style="font-size:13px">${esc(c.title)}</div>
    <div class="m" style="margin:0">
      <span class="tag blue">${esc(c.platform || "—")}</span>
      ${c.date ? `<span class="pill-due">${fmtDate(c.date)}</span>` : ""}
    </div>
    ${propName(c.propertyId) ? `<div class="m" style="margin:0"><span>▦ ${esc(propName(c.propertyId))}</span></div>` : ""}
  </div>`;
}
function contentRow(c) {
  return `<div class="row" data-edit-content="${c.id}" style="cursor:pointer"><div class="body">
    <div class="t">${esc(c.title)}</div><div class="m"><span class="tag blue">${esc(c.platform)}</span>
    <span class="tag">${esc(c.status)}</span>${c.date ? `<span class="pill-due">${fmtDate(c.date)}</span>` : ""}</div></div></div>`;
}

function editContent(id) {
  const c = id ? state.content.find((x) => x.id === id) : null;
  formModal({
    title: c ? "Edit Content" : "New Content",
    fields: [
      { key: "title", label: "Title / hook" },
      { key: "platform", label: "Platform", type: "select", options: ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "X / Twitter", "Blog", "Email"] },
      { key: "status", label: "Stage", type: "select", options: CONTENT_STAGES },
      { key: "date", label: "Target / post date", type: "date" },
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "notes", label: "Script / notes", type: "textarea" },
    ],
    values: c || { platform: "Instagram", status: "idea" },
    onSubmit: (v) => { DB.upsert("content", { ...(c || {}), ...v }); toast("Saved"); },
    onDelete: c ? () => DB.remove("content", c.id) : null,
  });
}

// ── 04 HORIZON ───────────────────────────────────────────────────────────────
VIEWS.horizon = {
  render() {
    const tasks = horizonTasks();
    // group by day offset buckets
    const groups = {};
    tasks.forEach((t) => { const k = t.due; (groups[k] = groups[k] || []).push(t); });
    const keys = Object.keys(groups).sort();
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Execution</div><h1>2-Week Horizon</h1></div>
        <button class="btn primary" data-add-task>+ Add task</button></div>
      ${keys.length ? keys.map((k) => {
        const dm = dueMeta(k);
        const d = parseISO(k);
        return `<div class="panel mb">
          <div class="panel-title"><span class="n">${dm?.cls === "overdue" ? "⚠" : "▸"}</span>
            ${d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            <span class="badge" style="margin-left:auto ${dm?.cls === "overdue" ? "" : ""}">${dm ? dm.text : ""}</span></div>
          ${groups[k].map(taskRow).join("")}
        </div>`;
      }).join("") : `<div class="empty">No tasks in the next 14 days. Add one or pull from the backlog.</div>`}
    </div>`;
  },
  mount(root) { wireTaskRows(root); root.querySelectorAll("[data-add-task]").forEach((el) => el.addEventListener("click", () => editTask())); },
};

// ── 05 ACTIVE BUILDS ─────────────────────────────────────────────────────────
function permitStatus(p) {
  const start = parseISO(p.permitStart);
  const days = Number(p.permitDays);
  if (!start || !days) return { label: "no clock", cls: "", pct: 0, remaining: null };
  const elapsed = Math.round((todayDate() - start) / DAY);
  const remaining = days - elapsed;
  const pct = Math.min(100, Math.max(0, (elapsed / days) * 100));
  let cls = "ok";
  if (remaining <= 14) cls = "warn";
  if (remaining <= 0) cls = "late";
  const label = remaining <= 0 ? `${Math.abs(remaining)}d over` : `${remaining}d left`;
  return { label, cls, pct, remaining };
}

function pipelineDeals() { return state.properties.filter((p) => p.kind === "pipeline"); }

// ── Portfolio phases — the visual snapshot on Active Projects ─────────────────
const PHASES = [
  { key: "active",    label: "Active build",           color: "#3b82f6" },
  { key: "pipeline",  label: "Pipeline / acquiring",   color: "#a855f7" },
  { key: "land",      label: "Land — ready to build",  color: "#f5a623" },
  { key: "completed", label: "Completed / stabilized", color: "#28b478" },
];
function propPhase(p) {
  if (p.phase && PHASES.some((x) => x.key === p.phase)) return p.phase;
  if (p.kind === "pipeline") return "pipeline";
  if (p.kind === "active-build") return "active";
  return "completed";
}
function phaseMeta(key) { return PHASES.find((x) => x.key === key) || { label: key, color: "var(--line)" }; }
let projFilter = null;   // which phase segment is selected on Active Projects
let selectedProp = null; // which property is opened for detail

function portfolioDonut(segs) {
  const total = segs.reduce((s, x) => s + x.count, 0);
  const r = 54, C = 2 * Math.PI * r; let off = 0;
  const arcs = total
    ? segs.filter((s) => s.count > 0).map((s) => { const dash = (s.count / total) * C; const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += dash; return el; }).join("")
    : `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--line)" stroke-width="20"/>`;
  return `<svg width="140" height="140" viewBox="0 0 140 140" style="flex:0 0 auto">${arcs}
    <text x="70" y="66" text-anchor="middle" font-size="26" font-weight="800" fill="currentColor">${total}</text>
    <text x="70" y="84" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">PROPERTIES</text></svg>`;
}
function phaseLegend(segs) {
  return segs.map((s) => `<button data-proj-filter="${s.key}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:${projFilter === s.key ? "var(--panel-2,rgba(127,127,127,.10))" : "transparent"};border:1px solid ${projFilter === s.key ? s.color : "var(--line)"};border-radius:8px;padding:7px 10px;margin-bottom:5px;cursor:pointer;color:inherit">
    <span style="width:12px;height:12px;border-radius:3px;background:${s.color};flex:0 0 auto"></span>
    <span style="flex:1;font-size:12.5px">${esc(s.label)}</span>
    <span class="mono" style="font-weight:800;font-size:13px">${s.count}</span></button>`).join("");
}
function propSelectRow(p) {
  const ph = phaseMeta(propPhase(p)); const m = dealMetrics(p);
  return `<div class="row" data-open-prop="${p.id}" style="cursor:pointer">
    <div class="body"><div class="t">${esc(p.name)}</div>
      <div class="m"><span class="tag" style="border-color:${ph.color}">${esc(ph.label)}</span>${p.address ? `<span>▦ ${esc(p.address)}</span>` : ""}${m.hasReturns ? `<span class="mono" style="color:var(--ok,#28b478)">${money0(m.profit)}</span>` : ""}</div></div>
    <div class="actions"><span class="mono muted" style="font-size:14px">›</span></div>
  </div>`;
}

VIEWS.builds = {
  render() {
    const segs = PHASES.map((ph) => ({ ...ph, count: state.properties.filter((p) => propPhase(p) === ph.key).length }));
    const sel = selectedProp ? state.properties.find((p) => p.id === selectedProp) : null;
    const filtered = projFilter ? state.properties.filter((p) => propPhase(p) === projFilter).sort((a, b) => (a.name || "").localeCompare(b.name || "")) : null;
    const activeBudget = () => {
      const bAll = state.properties.filter((p) => propPhase(p) === "active").map(budgetMetrics);
      const tB = bAll.reduce((s, x) => s + x.budget, 0), tS = bAll.reduce((s, x) => s + x.spent, 0), tE = bAll.reduce((s, x) => s + x.eac, 0), tV = bAll.reduce((s, x) => s + x.variance, 0);
      if (!tB) return "";
      return `<div class="grid cols-4 mb">
        <div class="stat"><div class="k">Total Budget</div><div class="v" style="font-size:19px">${money0(tB)}</div><div class="sub">projected</div></div>
        <div class="stat"><div class="k">Spent</div><div class="v" style="font-size:19px">${money0(tS)}</div><div class="sub">${Math.round(tS / tB * 100)}% of budget</div></div>
        <div class="stat"><div class="k">Projected Final</div><div class="v" style="font-size:19px">${money0(tE)}</div><div class="sub">at completion</div></div>
        <div class="stat"><div class="k">Over / Under</div><div class="v ${tV < 0 ? "red" : "green"}" style="font-size:19px">${tV < 0 ? "−" + money0(-tV) : money0(tV)}</div><div class="sub">vs budget</div></div>
      </div>`;
    };
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Portfolio</div><h1>Active Projects</h1></div>
        <button class="btn primary" data-new-build>+ New project</button></div>

      <div class="panel mb">
        <div class="panel-title"><span class="n">◑</span> Portfolio at a glance</div>
        <div class="flex" style="gap:20px;align-items:center;flex-wrap:wrap">
          ${portfolioDonut(segs)}
          <div style="flex:1;min-width:200px">${phaseLegend(segs)}</div>
        </div>
        <div class="muted" style="font-size:11px;margin-top:4px">Tap a category above to open those projects.</div>
      </div>

      ${sel ? `
        <div class="flex between mb" style="align-items:center">
          <button class="btn sm ghost" data-open-prop="back">← ${esc(phaseMeta(propPhase(sel)).label)}</button>
          <button class="btn sm ghost" data-edit-prop="${sel.id}">✎ Edit deal</button>
        </div>
        ${projectCard(sel)}`
      : projFilter ? `
        <div class="flex between mb" style="align-items:center">
          <div class="panel-title" style="margin:0">${esc(phaseMeta(projFilter).label)} · ${filtered.length}</div>
          <button class="btn sm ghost" data-proj-filter="clear">← all</button>
        </div>
        ${projFilter === "active" ? activeBudget() : ""}
        <div class="panel">
          ${filtered.length ? filtered.map(propSelectRow).join("") : `<div class="empty">Nothing in this category yet.</div>`}
        </div>`
      : `<div class="muted" style="text-align:center;padding:6px;font-size:12px">Pick a category to dive in.</div>`}
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-edit-prop]").forEach((el) => el.addEventListener("click", () => editProperty(el.dataset.editProp)));
    root.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => setStage(el.dataset.propId, Number(el.dataset.stage))));
    root.querySelectorAll("[data-photo-input]").forEach((el) =>
      el.addEventListener("change", (e) => handlePhotoUpload(el.dataset.photoInput, e.target.files)));
    root.querySelectorAll("[data-del-photo]").forEach((el) => el.addEventListener("click", () => { if (confirm("Delete photo?")) DB.remove("photos", el.dataset.delPhoto); }));
    root.querySelectorAll("[data-new-build]").forEach((el) => el.addEventListener("click", () => newBuild()));
    root.querySelectorAll("[data-add-build-task]").forEach((el) => el.addEventListener("click", () => quickTaskFor(el.dataset.addBuildTask)));
    root.querySelectorAll("[data-proj-filter]").forEach((el) => el.addEventListener("click", () => { const v = el.dataset.projFilter; projFilter = v === "clear" ? null : (projFilter === v ? null : v); selectedProp = null; render(); }));
    root.querySelectorAll("[data-open-prop]").forEach((el) => el.addEventListener("click", () => { const v = el.dataset.openProp; selectedProp = v === "back" ? null : v; render(); }));
  },
};

// Deal economics — the investor-facing returns, computed from entered numbers.
function dealMetrics(p) {
  const num = (x) => { const n = Number(String(x ?? "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const purchase = num(p.purchasePrice), rehab = num(p.rehabBudget), other = num(p.otherCosts), arv = num(p.arv);
  const allIn = purchase + rehab + other;
  const profit = arv - allIn;
  const roi = allIn ? (profit / allIn) * 100 : 0;
  const margin = arv ? (profit / arv) * 100 : 0;
  return { purchase, rehab, other, arv, allIn, profit, roi, margin, hasReturns: arv > 0 && allIn > 0 };
}
// Budget control — projected cost vs. actual spent vs. estimate-at-completion.
// Budget baseline = the rehab/construction budget you set when underwriting.
function budgetMetrics(p) {
  const num = (x) => { const n = Number(String(x ?? "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const budget = num(p.rehabBudget), spent = num(p.spentToDate), toComplete = num(p.costToComplete);
  const eac = toComplete > 0 ? spent + toComplete : Math.max(budget, spent); // estimate at completion
  const remaining = Math.max(0, eac - spent);
  const variance = budget - eac;                    // + = under budget, − = over
  const pctSpent = budget ? Math.round((spent / budget) * 100) : 0;
  return { budget, spent, toComplete, eac, remaining, variance, pctSpent, hasBudget: budget > 0, over: variance < 0 };
}
function budgetLine(b) {
  const col = b.over ? "#dc5050" : "var(--ok,#28b478)";
  const tag = b.over ? `▲ over ${money0(-b.variance)}` : `▼ under ${money0(b.variance)}`;
  return `<div class="mono" style="margin-top:8px;font-size:11.5px">💰 Budget ${money0(b.budget)} · Spent ${money0(b.spent)} (${b.pctSpent}%) · Final <span style="font-weight:700;color:${col}">${money0(b.eac)}</span> <span style="color:${col}">${tag}</span></div>`;
}
function budgetBlock(b) {
  const col = b.over ? "#dc5050" : "var(--ok,#28b478)";
  const denom = Math.max(b.budget, b.eac, 1);
  const spentW = Math.min(100, (b.spent / denom) * 100), remW = Math.min(100 - spentW, (b.remaining / denom) * 100);
  const budgetMark = Math.min(100, (b.budget / denom) * 100);
  const cell = (k, v, cls = "") => `<div><div class="mono muted" style="font-size:9.5px">${k}</div><div style="font-size:14px;font-weight:800;${cls}">${v}</div></div>`;
  return `<div style="padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2,transparent)">
    <div class="grid cols-4" style="gap:10px">
      ${cell("PROJECTED", money0(b.budget))}
      ${cell("SPENT", money0(b.spent))}
      ${cell("EST. TO FINISH", money0(b.remaining))}
      ${cell("PROJECTED FINAL", money0(b.eac), "color:" + col)}
    </div>
    <div style="display:flex;height:9px;border-radius:6px;overflow:hidden;background:var(--line);margin-top:10px;position:relative">
      <div style="width:${spentW}%;background:${col}"></div>
      <div style="width:${remW}%;background:${col};opacity:.35"></div>
      <div style="position:absolute;left:${budgetMark}%;top:-2px;bottom:-2px;width:2px;background:var(--ink,#333)" title="budget"></div>
    </div>
    <div class="mono muted" style="font-size:9.5px;margin-top:4px">Solid = spent · faded = still to spend · line = budget · ${b.over ? `over by ${money0(-b.variance)}` : `${money0(b.variance)} under`}</div>
  </div>`;
}
function returnsBlock(m) {
  const cell = (k, v, cls = "") => `<div><div class="mono muted" style="font-size:9.5px;letter-spacing:.03em">${k}</div><div style="font-size:15px;font-weight:800;${cls}">${v}</div></div>`;
  const good = m.profit >= 0 ? "color:var(--ok,#28b478)" : "color:#dc5050";
  return `<div class="grid cols-4" style="gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2,transparent)">
    ${cell("ALL-IN COST", money0(m.allIn))}
    ${cell("VALUE / ARV", money0(m.arv))}
    ${cell("PROJECTED PROFIT", money0(m.profit), good)}
    ${cell("ROI · MARGIN", `${m.roi.toFixed(0)}% · ${m.margin.toFixed(0)}%`, good)}
  </div>`;
}

// One clean, investor-readable project card: returns up top, a timeline with the
// current step, and the next steps — with the busy detail tucked into an expander.
// Schedule — per-phase dates (interpolated from start→finish unless set) plus a
// health read (on track / behind / overdue) comparing today's progress to plan.
function scheduleMetrics(p) {
  const stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES;
  const idx = p.stageIndex ?? 0;
  const n = stages.length;
  const start = parseISO(p.startDate);
  const done = parseISO(p.targetDate);
  let phaseDates = [];
  if (p.stageDates && p.stageDates.length === n) phaseDates = p.stageDates.slice();
  else if (start && done && n > 1) { const span = done - start; phaseDates = stages.map((s, i) => toISO(new Date(start.getTime() + (i / (n - 1)) * span))); }
  const actualFrac = n > 1 ? idx / (n - 1) : 1;
  let status = null;
  if (start && done && done > start) {
    const plannedFrac = Math.min(1, Math.max(0, (todayDate() - start) / (done - start)));
    const complete = idx >= n - 1;
    const overdue = todayDate() > done && !complete;
    let behind = 0;
    if (phaseDates.length) { const dueLeave = parseISO(phaseDates[Math.min(idx + 1, n - 1)]); if (dueLeave) behind = Math.round((todayDate() - dueLeave) / DAY); }
    let label, color;
    if (complete) { label = "Complete"; color = "var(--ok,#28b478)"; }
    else if (overdue) { label = `Overdue ${Math.round((todayDate() - done) / DAY)}d`; color = "#dc5050"; }
    else if (behind > 3) { label = `${behind}d behind`; color = "#e0913a"; }
    else { label = "On track"; color = "var(--ok,#28b478)"; }
    status = { label, color, plannedFrac, actualFrac };
  }
  return { stages, idx, n, start, done, phaseDates, actualFrac, status };
}
function scheduleStrip(sc) {
  const { stages, idx, phaseDates, start, done } = sc;
  const seg = stages.map((s, i) => `<div style="flex:1;min-width:0" title="${esc(s)}${phaseDates[i] ? " · " + fmtDate(phaseDates[i]) : ""}"><div style="height:8px;border-radius:3px;background:${i < idx ? "var(--ok,#28b478)" : i === idx ? "#f5a623" : "var(--line)"}"></div></div>`).join("");
  return `<div style="display:flex;gap:3px;margin-top:6px">${seg}</div>
    <div class="flex between mono muted" style="font-size:9.5px;margin-top:4px">
      <span>${start ? fmtDate(toISO(start)) : "start —"}</span>
      <span style="color:#f5a623">${esc(stages[idx] || "")}${phaseDates[idx] ? " · " + fmtDate(phaseDates[idx]) : ""}</span>
      <span>done ${done ? fmtDate(toISO(done)) : "—"}</span>
    </div>`;
}
function statusBar(sc) {
  if (!sc.status) return `<div class="mono muted" style="font-size:10px;margin-top:6px">Add a start date + finish date (Edit deal) to track schedule health.</div>`;
  const s = sc.status, fill = Math.round(s.actualFrac * 100), plan = Math.round(s.plannedFrac * 100);
  return `<div style="position:relative;height:22px;border-radius:6px;background:var(--line);overflow:hidden;margin-top:6px">
      <div style="position:absolute;top:0;bottom:0;left:0;width:${fill}%;background:${s.color};opacity:.30"></div>
      <div style="position:absolute;top:-1px;bottom:-1px;left:${plan}%;width:2px;background:var(--ink,#888)"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${s.color}">${esc(s.label)}</div>
    </div>
    <div class="mono muted" style="font-size:9px;margin-top:3px;text-align:right">fill = your progress · line = where you should be today</div>`;
}

function projectCard(p) {
  const sc = scheduleMetrics(p);
  const c = permitStatus(p);
  const stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES;
  const idx = p.stageIndex ?? 0;
  const pct = Math.round((idx / Math.max(1, stages.length - 1)) * 100);
  const m = dealMetrics(p);
  const b = budgetMetrics(p);
  const photos = state.photos.filter((ph) => ph.propertyId === p.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const tasks = openTasks().filter((t) => t.propertyId === p.id);
  const nextStep = p.nextStep || (tasks[0] && tasks[0].title) || "Set the next step in Edit deal";
  const tgt = p.targetDate ? dueMeta(p.targetDate) : null;
  return `
  <div class="panel mb" style="padding:16px">
    <div class="flex between wrap" style="align-items:flex-start;gap:10px">
      <div>
        <div style="font-size:17px;font-weight:800">${esc(p.name)}</div>
        <div class="mono muted" style="font-size:11px;margin-top:2px">${esc(p.address || "no address")}</div>
      </div>
      <div style="text-align:right">
        ${m.hasReturns
          ? `<div style="font-size:19px;font-weight:800;${m.profit >= 0 ? "color:var(--ok,#28b478)" : "color:#dc5050"}">${money0(m.profit)}</div><div class="mono muted" style="font-size:10px">projected profit · ${m.roi.toFixed(0)}% ROI</div>`
          : `<button class="btn sm ghost" data-edit-prop="${p.id}">+ Add returns</button>`}
      </div>
    </div>

    <div class="flex between" style="margin-top:12px;align-items:baseline;gap:8px">
      <span class="tag amber">Now: ${esc(stages[idx] || "—")}</span>
      <div class="mono muted" style="font-size:10.5px">Step ${idx + 1} of ${stages.length}${tgt ? ` · done ${tgt.text}` : ""}</div>
    </div>

    <div class="mono muted" style="font-size:9px;letter-spacing:.04em;margin-top:10px">SCHEDULE</div>
    ${scheduleStrip(sc)}
    <div class="mono muted" style="font-size:9px;letter-spacing:.04em;margin-top:10px">STATUS</div>
    ${statusBar(sc)}

    <div style="margin-top:12px;font-size:12.5px"><strong>Next:</strong> ${esc(nextStep)}</div>
    ${b.hasBudget ? budgetLine(b) : `<button class="btn sm ghost" data-edit-prop="${p.id}" style="margin-top:8px">+ Add budget</button>`}

    <details style="margin-top:10px">
      <summary class="muted" style="cursor:pointer;font-size:12px">▾ Full timeline, budget, returns &amp; tasks</summary>
      <div class="mt">
        ${b.hasBudget ? `<div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin-bottom:4px">BUDGET — PROJECTED vs ACTUAL</div>${budgetBlock(b)}` : ""}
        ${m.hasReturns ? `<div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin:12px 0 4px">RETURNS</div>` + returnsBlock(m) + `<div class="mono muted" style="font-size:10px;margin-top:6px">All-in = purchase ${money0(m.purchase)} + rehab ${money0(m.rehab)}${m.other ? " + costs " + money0(m.other) : ""}.</div>` : `<div class="empty" style="padding:12px">No deal numbers yet. <button class="btn sm" data-edit-prop="${p.id}">Add returns</button></div>`}

        <div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin:12px 0 4px">TIMELINE — tap a step to set where you are</div>
        <div class="stages">${stages.map((s, i) => `<span class="stage-chip ${i < idx ? "done" : i === idx ? "current" : ""}" data-stage="${i}" data-prop-id="${p.id}">${esc(s)}</span>`).join("")}</div>
        ${sc.phaseDates.length ? `<div style="margin-top:8px">${stages.map((s, i) => `<div class="flex between" style="font-size:11.5px;padding:3px 0;border-bottom:1px dashed var(--line)"><span>${i < idx ? "✓ " : i === idx ? "▶ " : "· "}${esc(s)}</span><span class="mono ${i === idx ? "" : "muted"}">${sc.phaseDates[i] ? fmtDate(sc.phaseDates[i]) : "—"}</span></div>`).join("")}</div>` : `<div class="mono muted" style="font-size:10px;margin-top:6px">Set a start + finish date (Edit deal) to date each phase.</div>`}

        <div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin:12px 0 4px">NEXT STEPS / TASKS</div>
        ${tasks.length ? tasks.slice(0, 6).map(taskRow).join("") : `<div class="empty" style="padding:10px">No open tasks</div>`}
        <button class="btn sm mt" data-add-build-task="${p.id}">+ Add task</button>

        ${photos.length ? `<div class="mono muted" style="font-size:10px;letter-spacing:.04em;margin:12px 0 4px">JOB-SITE PHOTOS</div>
          <div class="photo-grid">${photos.map((ph) => `<div class="photo"><img src="${ph.dataUrl}" alt="${esc(ph.caption || "")}"/><button class="del" data-del-photo="${ph.id}">✕</button></div>`).join("")}</div>` : ""}
        <div class="flex mt" style="gap:8px"><label class="btn sm ghost" style="cursor:pointer">📷 Photo<input type="file" accept="image/*" capture="environment" multiple class="hide" data-photo-input="${p.id}"></label>
          <button class="btn sm ghost" data-edit-prop="${p.id}">✎ Edit deal</button></div>
      </div>
    </details>
  </div>`;
}

function pipelineRow(p) {
  const stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES;
  const idx = p.stageIndex ?? 0;
  const dm = p.targetDate ? dueMeta(p.targetDate) : null;
  const m = dealMetrics(p);
  return `<div class="row" data-edit-prop="${p.id}" style="cursor:pointer">
    <div class="body"><div class="t">${esc(p.name)}</div>
      <div class="m"><span class="tag">${esc(stages[idx] || "Pipeline")}</span>${p.nextStep ? `<span>${esc(p.nextStep)}</span>` : ""}${dm ? `<span class="pill-due ${dm.cls}">${dm.text}</span>` : ""}${m.hasReturns ? `<span class="mono" style="color:var(--ok,#28b478)">${money0(m.profit)}</span>` : ""}</div></div>
  </div>`;
}

function setStage(propId, idx) {
  const p = state.properties.find((x) => x.id === propId); if (!p) return;
  const stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES;
  DB.upsert("properties", { ...p, stageIndex: idx, stage: stages[idx] });
  toast(`${p.name} → ${stages[idx]}`);
}

function quickTaskFor(propId) {
  const p = state.properties.find((x) => x.id === propId);
  editTaskPrefill({ propertyId: propId, title: "" });
}
function editTaskPrefill(prefill) {
  formModal({
    title: "New Task", fields: [
      { key: "title", label: "Task" },
      { key: "due", label: "Due date", type: "date" },
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "priority", label: "Priority", type: "select", options: [[0, "Normal"], [1, "Medium"], [2, "High"]] },
    ],
    values: prefill,
    onSubmit: (v) => { DB.upsert("tasks", { id: undefined, ...v, priority: Number(v.priority), status: "open", tags: [] }); toast("Task added"); },
  });
}

function newBuild() {
  formModal({
    title: "New Project",
    sub: "Adds a deal to Active Projects (or Pipeline). You can fill returns in later.",
    fields: [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "kind", label: "Type", type: "select", options: [["active-build", "Active project"], ["pipeline", "Pipeline (coming up)"]] },
      { key: "nextStep", label: "Next step" },
      { key: "targetDate", label: "Target / key date", type: "date" },
      { key: "arv", label: "Finished value / ARV ($)" },
      { key: "purchasePrice", label: "Purchase price ($)" },
      { key: "rehabBudget", label: "Rehab / construction budget ($)" },
    ],
    values: { kind: "active-build" },
    onSubmit: (v) => { DB.upsert("properties", { id: undefined, name: v.name, address: v.address, kind: v.kind || "active-build", nextStep: v.nextStep || "", targetDate: v.targetDate || "", arv: v.arv || "", purchasePrice: v.purchasePrice || "", rehabBudget: v.rehabBudget || "", stage: DEFAULT_STAGES[0], stageIndex: 0, stages: DEFAULT_STAGES, order: 100 }); toast(`${v.kind === "pipeline" ? "Pipeline deal" : "Project"} created`); },
  });
}

function editProperty(id) {
  const p = state.properties.find((x) => x.id === id);
  formModal({
    title: "Deal / Property Details",
    sub: p.kind === "active-build" ? "Active project" : p.kind === "pipeline" ? "Pipeline deal" : "Portfolio property",
    fields: [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "kind", label: "Type", type: "select", options: [["active-build", "Active project"], ["pipeline", "Pipeline (coming up)"], ["rental", "Rental"], ["other", "Other"]] },
      { key: "phase", label: "Phase (portfolio chart)", type: "select", options: [["", "Auto (from type)"], ["active", "Active build"], ["pipeline", "Pipeline / acquiring"], ["land", "Land — ready to build"], ["completed", "Completed / stabilized"]] },
      { key: "nextStep", label: "Next step (shown on the card)" },
      { key: "startDate", label: "Start date (for the schedule bar)", type: "date" },
      { key: "targetDate", label: "Finish / target date", type: "date" },
      { key: "purchasePrice", label: "Purchase price ($)" },
      { key: "rehabBudget", label: "Projected cost / construction budget ($)" },
      { key: "spentToDate", label: "Actually spent to date ($)" },
      { key: "costToComplete", label: "Est. cost to complete ($)" },
      { key: "otherCosts", label: "Other costs — holding, closing, financing ($)" },
      { key: "arv", label: "Finished value / ARV / sellout ($)" },
      { key: "permitStart", label: "Permit clock start", type: "date" },
      { key: "permitDays", label: "Permit length (days)", type: "number" },
      { key: "tenant", label: "Tenant" },
      { key: "rent", label: "Monthly rent" },
      { key: "leaseEnd", label: "Lease end", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    values: p,
    onSubmit: (v) => { DB.upsert("properties", { ...p, ...v, blank: false }); toast("Saved"); },
    onDelete: () => { DB.remove("properties", p.id); },
  });
}

// ── Photo upload with client-side compression ────────────────────────────────
function handlePhotoUpload(propId, files) {
  [...files].forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r); height = Math.round(height * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        DB.upsert("photos", { id: undefined, propertyId: propId, dataUrl, caption: "", date: todayISO() });
        toast("Photo added");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── 06 PROPERTY CALENDAR (NEW) ───────────────────────────────────────────────
const EVENT_TYPES = ["build", "maintenance", "lease-end", "vacancy", "inspection", "other"];
VIEWS.calendar = {
  render() {
    const first = calMonth;
    const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const gridStart = new Date(first); gridStart.setDate(1 - ((first.getDay() + 6) % 7)); // Monday start
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getTime() + i * DAY);
      cells.push(d);
    }
    const byDate = {};
    state.events.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const upcoming = state.events.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Portfolio · All Properties</div><h1>Property Calendar</h1></div>
        <button class="btn primary" data-add-event>+ Add event</button></div>

      <div class="panel mb">
        <div class="cal-head">
          <div class="flex"><button class="btn sm" data-cal="-1">‹</button>
            <div style="font-weight:600;min-width:170px;text-align:center">${monthLabel}</div>
            <button class="btn sm" data-cal="1">›</button>
            <button class="btn sm ghost" data-cal="0">Today</button></div>
          <div class="flex wrap mono" style="font-size:10px;gap:12px">
            <span><span class="tag violet">build</span></span>
            <span><span class="tag blue">maintenance</span></span>
            <span><span class="tag red">lease-end</span></span>
            <span><span class="tag amber">vacancy</span></span>
            <span><span class="tag green">inspection</span></span>
          </div>
        </div>
        <div class="cal-grid">${dows.map((d) => `<div class="cal-dow">${d}</div>`).join("")}</div>
        <div class="cal-grid mt" style="margin-top:6px">
          ${cells.map((d) => {
            const iso = toISO(d);
            const other = d.getMonth() !== first.getMonth();
            const isToday = iso === todayISO();
            const evs = (byDate[iso] || []);
            return `<div class="cal-cell ${other ? "other" : ""} ${isToday ? "today" : ""}">
              <div class="d">${d.getDate()}</div>
              ${evs.map((e) => `<div class="cal-ev ${e.type}" data-event="${e.id}" title="${esc(e.title)}">${esc(propName(e.propertyId) ? propName(e.propertyId) + " · " : "")}${esc(e.title)}</div>`).join("")}
            </div>`;
          }).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> Upcoming across portfolio</div>
        ${upcoming.length ? upcoming.map(eventRow).join("") : `<div class="empty">No upcoming events.</div>`}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-cal]").forEach((el) => el.addEventListener("click", () => {
      const v = Number(el.dataset.cal);
      if (v === 0) calMonth = startOfMonth(new Date());
      else calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + v, 1);
      render();
    }));
    root.querySelectorAll("[data-event]").forEach((el) => el.addEventListener("click", () => editEvent(el.dataset.event)));
    root.querySelectorAll("[data-add-event]").forEach((el) => el.addEventListener("click", () => editEvent()));
  },
};

function editEvent(id) {
  const e = id ? state.events.find((x) => x.id === id) : null;
  formModal({
    title: e ? "Edit Event" : "New Calendar Event",
    fields: [
      { key: "title", label: "Title" },
      { key: "type", label: "Type", type: "select", options: EVENT_TYPES },
      { key: "date", label: "Date", type: "date" },
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    values: e || { type: "maintenance", date: todayISO() },
    onSubmit: (v) => { DB.upsert("events", { ...(e || {}), ...v }); toast("Saved"); },
    onDelete: e ? () => DB.remove("events", e.id) : null,
  });
}

// ── 07 MAINTENANCE ───────────────────────────────────────────────────────────
VIEWS.maintenance = {
  render() {
    const tasks = maintenanceTasks();
    const doneRecently = state.tasks.filter((t) => isMaintenance(t) && t.status === "done").length;
    const fromDoorloop = tasks.filter((t) => t.source === "doorloop").length;

    // group by property
    const groups = {};
    for (const t of tasks) { const k = t.propertyId || "__none"; (groups[k] = groups[k] || []).push(t); }
    const keys = Object.keys(groups).sort((a, b) => propName(a).localeCompare(propName(b)));

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Work Orders</div><h1>Maintenance</h1></div>
        <button class="btn primary" data-add-maint>+ Add work order</button>
      </div>

      <div class="grid cols-3 mb">
        <div class="stat"><div class="k">Open</div><div class="v ${tasks.length ? "amber" : "green"}">${tasks.length}</div><div class="sub">work orders</div></div>
        <div class="stat"><div class="k">From DoorLoop</div><div class="v">${fromDoorloop}</div><div class="sub">auto-synced</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v green">${doneRecently}</div><div class="sub">all-time</div></div>
      </div>

      ${(() => {
        const sync = state.meta.find((m) => m.id === "doorloopSync");
        const on = !!(sync && sync.lastRun);
        return `<div class="panel mb" style="border-color:var(--amber-line);background:var(--amber-soft)">
          <div class="flex" style="gap:10px;align-items:flex-start">
            <span style="font-size:18px">🔗</span>
            <div>
              <strong>DoorLoop auto-sync ${on ? "is on" : "not set up yet"}</strong>
              <div class="muted" style="font-size:12.5px;margin-top:3px">
                ${on
                  ? `New DoorLoop maintenance tickets appear here automatically. Last synced ${relTime(sync.lastRun)}.`
                  : "These were imported manually. To have new DoorLoop tickets pull in on their own, set up auto-sync (see README) — you add two keys and it runs hourly."}
              </div>
            </div>
          </div>
        </div>`;
      })()}

      ${tasks.length ? keys.map((k) => `
        <div class="panel mb">
          <div class="panel-title"><span class="n">▦</span> ${esc(propName(k) || "Unassigned")}
            <span class="badge" style="margin-left:auto">${groups[k].length}</span></div>
          ${groups[k].map(maintRow).join("")}
        </div>`).join("")
        : `<div class="empty">No open maintenance work orders. 🎉</div>`}
    </div>`;
  },
  mount(root) {
    wireTaskRows(root);
    root.querySelectorAll("[data-add-maint]").forEach((el) => el.addEventListener("click", () => addMaintenance()));
  },
};

function addMaintenance() {
  formModal({
    title: "New Work Order",
    fields: [
      { key: "title", label: "What needs fixing?" },
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "priority", label: "Priority", type: "select", options: [[0, "Normal"], [1, "Medium"], [2, "High"]] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    values: { priority: 1 },
    onSubmit: (v) => {
      DB.upsert("tasks", { id: undefined, title: v.title, propertyId: v.propertyId, priority: Number(v.priority), notes: v.notes, status: "open", due: "", tags: ["maintenance"] });
      toast("Work order added");
    },
  });
}

function maintRow(t) {
  const dm = dueMeta(t.due);
  const ref = (t.notes || "").match(/#([A-Z0-9]{5,})/);
  const submitter = (t.notes || "").match(/Submitted by ([^\n(]+)/);
  return `<div class="row ${t.status === "done" ? "done" : ""}">
    <div class="check ${t.status === "done" ? "done" : ""}" data-toggle="${t.id}">✓</div>
    <div class="body">
      <div class="t">${esc(t.title)}</div>
      <div class="m">
        ${t.source === "doorloop" ? `<span class="tag blue">DoorLoop</span>` : `<span class="tag amber">maintenance</span>`}
        ${ref ? `<span class="mono">#${esc(ref[1])}</span>` : ""}
        ${submitter ? `<span>👤 ${esc(submitter[1].trim())}</span>` : ""}
        ${dm ? `<span class="pill-due ${dm.cls}">${dm.text}</span>` : ""}
      </div>
    </div>
    <div class="actions"><button class="icon-btn" data-edit-task="${t.id}">✎</button></div>
  </div>`;
}

// ── 08 LEASES & RENT ─────────────────────────────────────────────────────────
const LEASE_STATUS = {
  due: { cls: "red", label: "Increase due" },
  notice: { cls: "amber", label: "Send notice now" },
  soon: { cls: "blue", label: "Notice window soon" },
  ok: { cls: "green", label: "On track" },
  none: { cls: "", label: "Set rent + dates" },
};

VIEWS.leases = {
  render() {
    const leases = [...state.leases].sort((a, b) => {
      const order = { due: 0, notice: 1, soon: 2, ok: 3, none: 4 };
      return order[leaseCalc(a).status] - order[leaseCalc(b).status];
    });
    const totalRent = leases.reduce((a, l) => a + (Number(l.currentRent) || 0), 0);
    const in5 = leases.reduce((a, l) => { const f = leaseCalc(l).forecast; return a + (f[4]?.rent || Number(l.currentRent) || 0); }, 0);
    const needNotice = leasesNeedingNotice().length;
    const fromDl = leases.filter((l) => l.source === "doorloop").length;

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Rent Roll</div><h1>Leases &amp; Rent</h1></div>
        <button class="btn primary" data-add-lease>+ Add lease</button>
      </div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Leases</div><div class="v">${leases.length}</div><div class="sub">${fromDl} from DoorLoop</div></div>
        <div class="stat"><div class="k">Monthly Rent</div><div class="v" style="font-size:21px">${money0(totalRent)}</div><div class="sub">current roll</div></div>
        <div class="stat"><div class="k">Need Notice</div><div class="v ${needNotice ? "red" : "green"}">${needNotice}</div><div class="sub">≤60-day window</div></div>
        <div class="stat"><div class="k">Roll in 5 Yrs</div><div class="v green" style="font-size:21px">${money0(in5)}</div><div class="sub">at max increases</div></div>
      </div>

      ${leases.length ? leases.map(leaseCard).join("") : `<div class="empty">
        No leases yet. Add one, or set up DoorLoop sync to pull them in.<br>
        Each lease tracks the next increase date, your 60-day notice deadline, the CPI cap, and a 5-year forecast.</div>`}
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-add-lease]").forEach((el) => el.addEventListener("click", () => editLease()));
    root.querySelectorAll("[data-edit-lease]").forEach((el) => el.addEventListener("click", () => editLease(el.dataset.editLease)));
  },
};

function leaseCard(l) {
  const c = leaseCalc(l);
  const st = LEASE_STATUS[c.status];
  const who = [propName(l.propertyId) || l.propertyName, l.unit].filter(Boolean).join(" · ");
  return `
  <div class="panel mb">
    <div class="flex between wrap" style="align-items:flex-start">
      <div>
        <div class="panel-title" style="margin:0"><span class="n">▦</span> ${esc(who || "Unassigned")}
          ${l.source === "doorloop" ? `<span class="tag blue">DoorLoop</span>` : ""}</div>
        <div class="mono muted" style="font-size:11px;margin-top:4px">
          ${l.tenant ? esc(l.tenant) + " · " : ""}${c.rent ? money0(c.rent) + "/mo" : "no rent set"}
          ${l.leaseEnd ? " · lease ends " + fmtDate(l.leaseEnd) : ""}</div>
      </div>
      <span class="tag ${st.cls}">${st.label}</span>
    </div>

    <div class="grid cols-3 mt">
      <div class="stat"><div class="k">Next increase</div><div class="v" style="font-size:16px">${c.next ? fmtDate(toISO(c.next)) : "—"}</div>
        <div class="sub">${c.next ? c.daysToNext + " days" : "set last-increase date"}</div></div>
      <div class="stat"><div class="k">Notice by (${c.noticeDays}d)</div>
        <div class="v ${c.status === "notice" || c.status === "due" ? "red" : c.status === "soon" ? "amber" : ""}" style="font-size:16px">${c.noticeBy ? fmtDate(toISO(c.noticeBy)) : "—"}</div>
        <div class="sub">${c.noticeBy ? (c.daysToNotice <= 0 ? "window open" : "in " + c.daysToNotice + "d") : ""}</div></div>
      <div class="stat"><div class="k">Max increase</div><div class="v amber" style="font-size:16px">${c.cap}%</div>
        <div class="sub">${c.cpi != null ? "5% + " + c.cpi + "% CPI, cap 10%" : "cap"} → ${money0(c.nextRent)}</div></div>
    </div>

    <div class="mt">
      <div class="panel-title" style="font-size:10px"><span class="n">▸</span> 5-Year forecast (at ${c.cap}%/yr)</div>
      <div class="cal-grid" style="grid-template-columns:repeat(6,1fr);gap:6px">
        <div class="stat" style="padding:8px 10px"><div class="k">Now</div><div class="mono" style="font-size:14px;margin-top:3px">${money0(c.rent)}</div></div>
        ${c.forecast.map((f, i) => `<div class="stat" style="padding:8px 10px"><div class="k">Yr ${i + 1}${f.date ? " · " + (f.date.getFullYear()) : ""}</div><div class="mono ${i === 4 ? "" : ""}" style="font-size:14px;margin-top:3px;color:var(--green)">${money0(f.rent)}</div></div>`).join("")}
      </div>
    </div>
    <div class="mt"><button class="btn sm ghost" data-edit-lease="${l.id}">✎ Edit lease</button></div>
  </div>`;
}

function editLease(id) {
  const l = id ? state.leases.find((x) => x.id === id) : null;
  formModal({
    title: l ? "Edit Lease" : "New Lease",
    sub: "Rent-increase tracking + forecast",
    fields: [
      { key: "propertyId", label: "Property", type: "select", options: propOptions() },
      { key: "unit", label: "Unit" },
      { key: "tenant", label: "Tenant" },
      { key: "currentRent", label: "Current rent ($/mo)", type: "number" },
      { key: "leaseStart", label: "Lease start", type: "date" },
      { key: "leaseEnd", label: "Lease end", type: "date" },
      { key: "lastIncreaseDate", label: "Last increase date (drives the clock)", type: "date" },
      { key: "cpiPct", label: "Regional CPI % (cap = 5% + this, max 10%)", type: "number", step: "0.1" },
      { key: "capPct", label: "Override max increase % (optional)", type: "number", step: "0.1" },
      { key: "intervalMonths", label: "Months between increases", type: "number", default: 12 },
      { key: "noticeDays", label: "Advance notice required (days)", type: "number", default: 60 },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    values: l || { intervalMonths: 12, noticeDays: 60 },
    onSubmit: (v) => { DB.upsert("leases", { ...(l || {}), ...v }); toast(l ? "Lease updated" : "Lease added"); },
    onDelete: l ? () => DB.remove("leases", l.id) : null,
  });
}

// ── 09 BACKLOG ───────────────────────────────────────────────────────────────
VIEWS.backlog = {
  render() {
    const tasks = backlogTasks();
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Someday / Unscheduled</div><h1>Backlog</h1></div>
        <button class="btn primary" data-add-task>+ Add to backlog</button></div>
      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> ${tasks.length} unscheduled ${tasks.length === 1 ? "item" : "items"}</div>
        ${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty">Backlog is empty. 🎉</div>`}
      </div>
    </div>`;
  },
  mount(root) { wireTaskRows(root); root.querySelectorAll("[data-add-task]").forEach((el) => el.addEventListener("click", () => editTaskPrefill({ due: "" }))); },
};

// ── Portfolio Performance (6mo / 1yr / 5yr returns + projections) ────────────
function getAssumptions() {
  const m = state.meta.find((x) => x.id === "assumptions");
  return { rentGrowthPct: Number(m?.rentGrowthPct ?? 4), avgUnitRent: Number(m?.avgUnitRent ?? 2500) };
}
function propMonthlyRent(pid) { return state.leases.filter((l) => l.propertyId === pid).reduce((a, l) => a + (Number(l.currentRent) || 0), 0); }
function portfolioRent() { return state.leases.reduce((a, l) => a + (Number(l.currentRent) || 0), 0); }
function currentDoors() { return state.properties.reduce((a, p) => a + (Number(p.units) || 0), 0); }

function projectIncome(monthsAhead) {
  const a = getAssumptions();
  const yrs = monthsAhead / 12;
  const base = portfolioRent() * Math.pow(1 + a.rentGrowthPct / 100, yrs);
  const H = addMonths(todayDate(), monthsAhead);
  let newUnits = 0;
  for (const p of state.properties) {
    if (p.plannedUnits && p.unitsReadyDate && parseISO(p.unitsReadyDate) <= H) newUnits += Number(p.plannedUnits) || 0;
  }
  const newIncome = newUnits * a.avgUnitRent;
  return { monthly: Math.round(base + newIncome), newUnits, doors: currentDoors() + newUnits };
}

function propReturns(p) {
  const rent = propMonthlyRent(p.id);
  const exp = Number(p.monthlyExpenses) || 0;
  const noiA = (rent - exp) * 12;
  const debt = Number(p.loanPayment) || 0;
  const cfM = rent - exp - debt;
  const price = Number(p.purchasePrice) || 0;
  const invested = Number(p.cashInvested) || 0;
  const val = Number(p.currentValue) || 0, bal = Number(p.loanBalance) || 0;
  return {
    rent, exp, debt, noiA, cfM, cfA: cfM * 12,
    cap: price ? (noiA / price) * 100 : null,
    coc: invested ? (cfM * 12 / invested) * 100 : null,
    equity: (val || bal) ? val - bal : null,
    hasFin: !!(price || exp || debt || val),
  };
}

VIEWS.performance = {
  render() {
    const a = getAssumptions();
    const rentNow = portfolioRent();
    const proj6 = projectIncome(6), proj12 = projectIncome(12), proj60 = projectIncome(60);
    // portfolio returns roll-up (only from properties with financials entered)
    const rets = state.properties.map((p) => ({ p, r: propReturns(p) }));
    const withFin = rets.filter((x) => x.r.hasFin);
    const totCfM = withFin.reduce((s, x) => s + x.r.cfM, 0);
    const totNoiA = withFin.reduce((s, x) => s + x.r.noiA, 0);
    const totPrice = withFin.reduce((s, x) => s + (Number(x.p.purchasePrice) || 0), 0);
    const totEquity = rets.reduce((s, x) => s + (x.r.equity || 0), 0);
    const portCap = totPrice ? (totNoiA / totPrice) * 100 : null;
    // rentals with rent, sorted by rent desc
    const rows = rets.filter((x) => x.r.rent > 0 || x.r.hasFin).sort((x, y) => y.r.rent - x.r.rent);

    const projCol = (label, pr) => `<div class="stat"><div class="k">${label}</div>
      <div class="v" style="font-size:20px">${money0(pr.monthly)}</div>
      <div class="sub">${money0(pr.monthly * 12)}/yr · ${pr.doors} doors</div></div>`;

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Portfolio</div><h1>Performance</h1></div>
        <div class="mono muted" style="font-size:11px">rent +${a.rentGrowthPct}%/yr · new unit ${money0(a.avgUnitRent)}/mo <button class="btn sm ghost" data-edit-assump>✎</button></div>
      </div>

      <div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> Income projection — where the portfolio is headed</div>
        <div class="grid cols-4">
          ${projCol("Now", { monthly: rentNow, doors: currentDoors() })}
          ${projCol("+6 months", proj6)}
          ${projCol("+1 year", proj12)}
          ${projCol("+5 years", proj60)}
        </div>
        <div class="mono muted mt" style="font-size:11px">Grows current rent at +${a.rentGrowthPct}%/yr and adds ${money0(a.avgUnitRent)}/mo per ADU/unit as each build leases up. 5-yr rent roll ≈ ${money0(proj60.monthly)}/mo.</div>
      </div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Gross Rent (now)</div><div class="v green" style="font-size:22px">${money0(rentNow)}</div><div class="sub">/mo · ${money0(rentNow * 12)}/yr</div></div>
        <div class="stat"><div class="k">Cash Flow</div><div class="v ${totCfM >= 0 ? "green" : "red"}" style="font-size:22px">${withFin.length ? money0(totCfM) : "—"}</div><div class="sub">${withFin.length ? "/mo (entered props)" : "add financials"}</div></div>
        <div class="stat"><div class="k">Portfolio Cap</div><div class="v amber" style="font-size:22px">${portCap != null ? portCap.toFixed(1) + "%" : "—"}</div><div class="sub">NOI / price</div></div>
        <div class="stat"><div class="k">Equity</div><div class="v" style="font-size:22px">${totEquity ? money0(totEquity) : "—"}</div><div class="sub">value − loans</div></div>
      </div>

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> Returns by property <span class="mono muted" style="margin-left:auto;font-weight:400">tap a row to add price / loan / expenses</span></div>
        <div class="fbar-row" style="grid-template-columns:1.4fr 1fr 1fr 0.8fr 0.9fr;font-family:var(--mono);font-size:10px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;border:none;margin-bottom:4px">
          <div>Property</div><div>Rent/mo</div><div>Cash flow/mo</div><div>Cap</div><div>CoC</div>
        </div>
        ${rows.length ? rows.map(({ p, r }) => `<div class="fbar-row" data-fin="${p.id}" style="grid-template-columns:1.4fr 1fr 1fr 0.8fr 0.9fr;cursor:pointer;border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:6px">
          <div class="fname" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="mono">${r.rent ? money0(r.rent) : "—"}</div>
          <div class="mono ${r.hasFin ? (r.cfM >= 0 ? "" : "") : ""}" style="color:${r.hasFin ? (r.cfM >= 0 ? "var(--green)" : "var(--red)") : "var(--ink-faint)"}">${r.hasFin ? money0(r.cfM) : "add +"}</div>
          <div class="mono">${r.cap != null ? r.cap.toFixed(1) + "%" : "—"}</div>
          <div class="mono">${r.coc != null ? r.coc.toFixed(1) + "%" : "—"}</div>
        </div>`).join("") : `<div class="empty">No rent data yet.</div>`}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-fin]").forEach((el) => el.addEventListener("click", () => editFinancials(el.dataset.fin)));
    root.querySelectorAll("[data-edit-assump]").forEach((el) => el.addEventListener("click", () => editAssumptions()));
  },
};

function editFinancials(pid) {
  const p = state.properties.find((x) => x.id === pid); if (!p) return;
  formModal({
    title: "Financials — " + p.name,
    sub: `Rent (${money0(propMonthlyRent(pid))}/mo) comes from DoorLoop. Enter the rest for returns.`,
    fields: [
      { key: "purchasePrice", label: "Purchase price ($)", type: "number" },
      { key: "currentValue", label: "Current value ($)", type: "number" },
      { key: "loanBalance", label: "Loan balance ($)", type: "number" },
      { key: "loanPayment", label: "Loan payment ($/mo, P&I)", type: "number" },
      { key: "monthlyExpenses", label: "Operating expenses ($/mo — tax, ins, maint, mgmt)", type: "number" },
      { key: "cashInvested", label: "Cash invested / down payment ($)", type: "number" },
    ],
    values: p,
    onSubmit: (v) => { DB.upsert("properties", { ...p, ...v }); toast("Financials saved"); },
  });
}
function editAssumptions() {
  const a = getAssumptions();
  formModal({
    title: "Projection assumptions",
    fields: [
      { key: "rentGrowthPct", label: "Annual rent growth (%)", type: "number", step: "0.1" },
      { key: "avgUnitRent", label: "Avg rent per new ADU/unit ($/mo)", type: "number" },
    ],
    values: a,
    onSubmit: (v) => { DB.upsert("meta", { id: "assumptions", rentGrowthPct: Number(v.rentGrowthPct), avgUnitRent: Number(v.avgUnitRent) }); toast("Assumptions updated"); },
  });
}

// ── 08 MONTHLY SCORECARD ─────────────────────────────────────────────────────
VIEWS.scorecard = {
  render() {
    const cards = [...state.scorecards].sort((a, b) => b.month.localeCompare(a.month));
    const cur = cards[0];
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Portfolio</div><h1>Monthly Scorecard</h1></div>
        <button class="btn primary" data-edit-score="${cur ? cur.month : ""}">${cur ? "Edit current" : "+ Start this month"}</button></div>
      ${cur ? scorecardBlock(cur) : `<div class="empty">No scorecard yet — start one.</div>`}
      ${cards.length > 1 ? `<div class="panel mt"><div class="panel-title"><span class="n">▸</span> History</div>
        ${cards.slice(1).map((c) => `<div class="row" data-edit-score="${c.month}" style="cursor:pointer"><div class="body">
          <div class="t">${monthName(c.month)}</div>
          <div class="m"><span>${occ(c)}% occ</span><span>NOI ${money(c.noi)}</span></div></div></div>`).join("")}</div>` : ""}
    </div>`;
  },
  mount(root) { root.querySelectorAll("[data-edit-score]").forEach((el) => el.addEventListener("click", () => editScore(el.dataset.editScore))); },
};

function occ(c) { const d = Number(c.doors) || 0, o = Number(c.occupied) || 0; return d ? Math.round((o / d) * 100) : 0; }
function money(v) { if (v === "" || v == null || isNaN(Number(v))) return "—"; return "$" + Number(v).toLocaleString(); }
function monthName(ym) { const [y, m] = ym.split("-"); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }

function scorecardBlock(c) {
  return `<div class="grid cols-4 mb">
    <div class="stat"><div class="k">Doors</div><div class="v">${esc(c.doors || 0)}</div></div>
    <div class="stat"><div class="k">Occupancy</div><div class="v ${occ(c) >= 90 ? "green" : occ(c) >= 75 ? "amber" : "red"}">${occ(c)}%</div><div class="sub">${esc(c.occupied || 0)}/${esc(c.doors || 0)} occupied</div></div>
    <div class="stat"><div class="k">Gross Rent</div><div class="v" style="font-size:20px">${money(c.grossRent)}</div></div>
    <div class="stat"><div class="k">NOI</div><div class="v green" style="font-size:20px">${money(c.noi)}</div><div class="sub">exp ${money(c.expenses)}</div></div>
  </div>
  <div class="panel"><div class="panel-title"><span class="n">▸</span> ${monthName(c.month)} notes</div>
    <div style="white-space:pre-wrap;color:var(--ink-dim);font-size:13.5px">${esc(c.notes || "No notes.")}</div></div>`;
}

function editScore(month) {
  if (!month) month = todayISO().slice(0, 7);
  const c = state.scorecards.find((x) => x.month === month) || { month, id: month };
  formModal({
    title: "Monthly Scorecard", sub: monthName(month),
    fields: [
      { key: "doors", label: "Total doors", type: "number" },
      { key: "occupied", label: "Occupied doors", type: "number" },
      { key: "grossRent", label: "Gross rent ($)", type: "number" },
      { key: "expenses", label: "Expenses ($)", type: "number" },
      { key: "noi", label: "NOI ($)", type: "number" },
      { key: "notes", label: "Notes / wins / misses", type: "textarea" },
    ],
    values: c,
    onSubmit: (v) => { DB.upsert("scorecards", { ...c, ...v, id: month, month }); toast("Scorecard saved"); },
  });
}

// ── 09 WEEKLY REVIEW & PACE ──────────────────────────────────────────────────
VIEWS.weekly = {
  render() {
    const wkStart = mondayOf(todayDate());
    const wkId = toISO(wkStart);
    const review = state.reviews.find((r) => r.id === wkId);
    const doneThisWeek = state.tasks.filter((t) => t.doneAt && t.doneAt >= wkStart.getTime()).length;
    const planned = review?.planned ? Number(review.planned) : 0;
    const pace = planned ? Math.round((doneThisWeek / planned) * 100) : null;
    const history = [...state.reviews].sort((a, b) => b.id.localeCompare(a.id));

    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Cadence</div><h1>Weekly Review &amp; Pace</h1></div>
        <button class="btn primary" data-edit-review="${wkId}">${review ? "Edit this week" : "Start this week"}</button></div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Week of</div><div class="v" style="font-size:18px">${fmtDate(wkId)}</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v green">${doneThisWeek}</div><div class="sub">tasks this week</div></div>
        <div class="stat"><div class="k">Planned</div><div class="v">${planned || "—"}</div></div>
        <div class="stat"><div class="k">Pace</div><div class="v ${pace >= 100 ? "green" : pace >= 60 ? "amber" : pace === null ? "" : "red"}">${pace === null ? "—" : pace + "%"}</div><div class="sub">of plan</div></div>
      </div>

      ${review ? `<div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> This week</div>
        <div class="grid cols-2">
          <div><div class="mono muted" style="font-size:10px">FOCUS</div><div style="white-space:pre-wrap">${esc(review.focus || "—")}</div>
            ${review.forecast ? `<div class="mono muted mt" style="font-size:10px">FORECAST DATE</div><div class="clock warn" style="font-size:16px">${fmtDate(review.forecast)} <span class="muted mono" style="font-size:11px">(${daysUntil(review.forecast)}d)</span></div>` : ""}</div>
          <div><div class="mono muted" style="font-size:10px">WINS</div><div style="white-space:pre-wrap;color:var(--green)">${esc(review.wins || "—")}</div>
            <div class="mono muted mt" style="font-size:10px">BLOCKERS</div><div style="white-space:pre-wrap;color:var(--red)">${esc(review.blockers || "—")}</div></div>
        </div>
      </div>` : `<div class="empty mb">No review logged for this week yet.</div>`}

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> Pace history</div>
        ${history.length ? history.map((r) => {
          const done = state.tasks.filter((t) => { const wk = mondayOf(parseISO(r.id)); return t.doneAt && t.doneAt >= wk.getTime() && t.doneAt < wk.getTime() + 7 * DAY; }).length;
          const p = r.planned ? Math.round((done / Number(r.planned)) * 100) : null;
          return `<div class="row" data-edit-review="${r.id}" style="cursor:pointer"><div class="body">
            <div class="t">Week of ${fmtDate(r.id)}</div>
            <div class="m"><span>${done} done${r.planned ? " / " + r.planned + " planned" : ""}</span>
            ${p !== null ? `<span class="tag ${p >= 100 ? "green" : p >= 60 ? "amber" : "red"}">${p}% pace</span>` : ""}
            ${r.forecast ? `<span class="pill-due">forecast ${fmtDate(r.forecast)}</span>` : ""}</div></div></div>`;
        }).join("") : `<div class="empty">No history yet.</div>`}
      </div>
    </div>`;
  },
  mount(root) { root.querySelectorAll("[data-edit-review]").forEach((el) => el.addEventListener("click", () => editReview(el.dataset.editReview))); },
};

function editReview(wkId) {
  const r = state.reviews.find((x) => x.id === wkId) || { id: wkId };
  formModal({
    title: "Weekly Review", sub: "Week of " + fmtDate(wkId),
    fields: [
      { key: "planned", label: "Tasks planned this week", type: "number" },
      { key: "focus", label: "Primary focus", type: "textarea" },
      { key: "forecast", label: "Forecast / target date (e.g. build completion)", type: "date" },
      { key: "wins", label: "Wins", type: "textarea" },
      { key: "blockers", label: "Blockers", type: "textarea" },
    ],
    values: r,
    onSubmit: (v) => { DB.upsert("reviews", { ...r, ...v, id: wkId }); toast("Review saved"); },
    onDelete: state.reviews.find((x) => x.id === wkId) ? () => DB.remove("reviews", wkId) : null,
  });
}

// ── 10 PRODUCTIVITY (charts) ─────────────────────────────────────────────────
let prodRange = localStorage.getItem("sshcc:prodRange") || "week";
let prodStatsCache = [];

function scheduledOn(r, iso) {
  if (r.schedule === "weekdays") { const d = parseISO(iso).getDay(); return d >= 1 && d <= 5; }
  return true;
}

function prodDays() {
  if (prodRange === "week") {
    const mon = mondayOf(todayDate());
    return Array.from({ length: 7 }, (_, i) => toISO(new Date(mon.getTime() + i * DAY)));
  }
  const first = startOfMonth(todayDate());
  const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => toISO(new Date(first.getFullYear(), first.getMonth(), i + 1)));
}

function dayStats(days) {
  const nowMs = todayDate().getTime();
  return days.map((iso) => {
    const start = parseISO(iso).getTime();
    const end = start + DAY;
    const completed = state.tasks.filter((t) => t.doneAt && t.doneAt >= start && t.doneAt < end).length;
    const isPast = start < nowMs;
    const missed = state.tasks.filter((t) => t.due === iso && t.status !== "done" && isPast).length;
    const sched = state.routines.filter((r) => scheduledOn(r, iso));
    const rDone = sched.filter((r) => routineDone(r.id, iso)).length;
    return { iso, completed, missed, rSched: sched.length, rDone };
  });
}

function fieldStats(days) {
  const set = new Set(days);
  const rel = state.tasks.filter((t) => {
    if (t.due && set.has(t.due)) return true;
    if (t.doneAt) { const iso = toISO(new Date(t.doneAt)); return set.has(iso); }
    return false;
  });
  const buckets = {};
  const bump = (name, done) => {
    const k = name || "untagged";
    buckets[k] = buckets[k] || { name: k, done: 0, total: 0 };
    buckets[k].total++; if (done) buckets[k].done++;
  };
  rel.forEach((t) => {
    const done = t.status === "done";
    const tags = (t.tags || []).filter(Boolean);
    if (tags.length) tags.forEach((tag) => bump(tag, done));
    else bump(t.propertyId ? propName(t.propertyId) : "untagged", done);
  });
  return Object.values(buckets)
    .map((b) => ({ ...b, rate: b.total ? Math.round((b.done / b.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || b.rate - a.rate);
}

function topRoundPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function tasksByDayChart(stats) {
  const W = 720, H = 230, padL = 26, padR = 10, padT = 20, padB = 26;
  const n = stats.length;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxV = Math.max(4, ...stats.map((s) => s.completed + s.missed));
  const step = plotW / n;
  const bw = Math.min(44, step * 0.6);
  const base = padT + plotH;
  const yOf = (v) => base - (v / maxV) * plotH;
  const isWeek = prodRange === "week";

  // gridlines / y ticks (0, mid, max)
  const ticks = [0, Math.round(maxV / 2), maxV].filter((v, i, a) => a.indexOf(v) === i);
  let grid = ticks.map((v) => `<line class="grid" x1="${padL}" y1="${yOf(v)}" x2="${W - padR}" y2="${yOf(v)}"/>
    <text class="ticktext" x="${padL - 6}" y="${yOf(v) + 3}" text-anchor="end">${v}</text>`).join("");

  const bars = stats.map((s, i) => {
    const total = s.completed + s.missed;
    const cx = padL + step * i + step / 2;
    const x0 = cx - bw / 2;
    const cH = (s.completed / maxV) * plotH;
    const mH = (s.missed / maxV) * plotH;
    let shapes = "";
    if (s.completed) {
      const yc = base - cH;
      shapes += s.missed
        ? `<rect class="seg-done" x="${x0}" y="${yc}" width="${bw}" height="${cH}"/>`
        : `<path class="seg-done" d="${topRoundPath(x0, yc, bw, cH, 4)}"/>`;
    }
    if (s.missed) {
      const gap = s.completed ? 2 : 0;
      const ym = base - cH - gap - mH;
      shapes += `<path fill="url(#hatch)" d="${topRoundPath(x0, ym, bw, mH, 4)}"/>`;
    }
    const label = isWeek && total ? `<text class="vlabel" x="${cx}" y="${base - Math.max(cH + mH, 0) - 6}" text-anchor="middle">${total}</text>` : "";
    const xlab = isWeek
      ? fmtDow(s.iso)
      : ([1, 5, 10, 15, 20, 25, 30].includes(parseISO(s.iso).getDate()) ? String(parseISO(s.iso).getDate()) : "");
    const tick = xlab ? `<text class="ticktext" x="${cx}" y="${base + 15}" text-anchor="middle">${xlab}</text>` : "";
    return `<g class="barg" data-i="${i}">${shapes}${label}${tick}
      <rect class="hit" x="${padL + step * i}" y="${padT}" width="${step}" height="${plotH}"/></g>`;
  }).join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tasks completed and missed per day">
    <defs><pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#ff6b6b"/><rect width="4" height="8" fill="#b93a3a"/>
    </pattern></defs>
    <line class="axis" x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}"/>
    ${grid}${bars}</svg>`;
}

function routineSparkline(stats) {
  const W = 720, H = 90, padL = 26, padR = 10, padT = 10, padB = 18;
  const n = stats.length, plotW = W - padL - padR, plotH = H - padT - padB;
  const step = plotW / n, base = padT + plotH;
  const pct = (s) => (s.rSched ? s.rDone / s.rSched : 0);
  const pts = stats.map((s, i) => [padL + step * i + step / 2, base - pct(s) * plotH]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  const dots = prodRange === "week" ? pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--amber)" stroke="var(--navy-900)" stroke-width="2"/>`).join("") : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Routine adherence per day">
    <line class="grid" x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}"/>
    <text class="ticktext" x="${padL - 6}" y="${padT + 3}" text-anchor="end">100%</text>
    <line class="axis" x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}"/>
    <path d="${area}" fill="var(--amber)" fill-opacity="0.1"/>
    <path d="${line}" fill="none" stroke="var(--amber)" stroke-width="2"/>${dots}</svg>`;
}

function fmtDow(iso) { return parseISO(iso).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1); }

VIEWS.productivity = {
  render() {
    const days = prodDays();
    const stats = dayStats(days);
    prodStatsCache = stats;
    const completed = stats.reduce((a, s) => a + s.completed, 0);
    const missed = stats.reduce((a, s) => a + s.missed, 0);
    const rate = completed + missed ? Math.round((completed / (completed + missed)) * 100) : null;
    const rTot = stats.reduce((a, s) => a + s.rSched, 0);
    const rDone = stats.reduce((a, s) => a + s.rDone, 0);
    const rAdh = rTot ? Math.round((rDone / rTot) * 100) : null;
    const fields = fieldStats(days);
    const rangeLabel = prodRange === "week"
      ? `Week of ${fmtDate(days[0])}`
      : startOfMonth(todayDate()).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    return `
    <div class="view">
      <div class="view-head">
        <div><div class="eyebrow">Analytics</div><h1>Productivity</h1></div>
        <div class="seg-toggle">
          <button class="${prodRange === "week" ? "on" : ""}" data-range="week">This Week</button>
          <button class="${prodRange === "month" ? "on" : ""}" data-range="month">This Month</button>
        </div>
      </div>

      <div class="grid cols-4 mb">
        <div class="stat"><div class="k">Completion rate</div><div class="v ${rate >= 80 ? "green" : rate >= 50 ? "amber" : rate === null ? "" : "red"}">${rate === null ? "—" : rate + "%"}</div><div class="sub">done vs missed</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v green">${completed}</div><div class="sub">tasks · ${rangeLabel}</div></div>
        <div class="stat"><div class="k">Missed / overdue</div><div class="v ${missed ? "red" : "green"}">${missed}</div><div class="sub">unfinished past due</div></div>
        <div class="stat"><div class="k">Routine adherence</div><div class="v ${rAdh >= 80 ? "green" : rAdh >= 50 ? "amber" : rAdh === null ? "" : "red"}">${rAdh === null ? "—" : rAdh + "%"}</div><div class="sub">of scheduled</div></div>
      </div>

      <div class="panel mb chart-wrap">
        <div class="flex between">
          <div class="panel-title" style="margin:0"><span class="n">▸</span> Tasks done vs. missed — by day</div>
          <div class="legend"><span class="li"><span class="sw done"></span>Completed</span><span class="li"><span class="sw miss"></span>Missed / overdue</span></div>
        </div>
        <div class="mt">${tasksByDayChart(stats)}</div>
        <div class="chart-tip" id="chartTip"></div>
        ${completed + missed === 0 ? `<div class="empty mt">No task activity in this ${prodRange}. Complete or schedule tasks to see your pace here.</div>` : ""}
      </div>

      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-title"><span class="n">▸</span> Productivity by field</div>
          ${fields.length ? fields.map((f) => {
            const cls = f.rate >= 80 ? "high" : f.rate < 50 ? "low" : "";
            return `<div class="fbar-row">
              <div class="fname" title="${esc(f.name)}">${esc(f.name)}</div>
              <div class="fbar-track"><div class="fbar-fill ${cls}" style="width:${f.rate}%"></div></div>
              <div class="fbar-meta">${f.done}/${f.total} · ${f.rate}%</div></div>`;
          }).join("") : `<div class="empty">No tagged tasks in range. Add tags like “build”, “content”, “ops” to tasks to break productivity down by area.</div>`}
        </div>
        <div class="panel chart-wrap">
          <div class="panel-title"><span class="n">▸</span> Routine adherence — by day</div>
          ${routineSparkline(stats)}
          <div class="mono muted mt" style="font-size:11px">${rDone}/${rTot} routine check-ins completed this ${prodRange}.</div>
        </div>
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-range]").forEach((el) => el.addEventListener("click", () => {
      prodRange = el.dataset.range; localStorage.setItem("sshcc:prodRange", prodRange); render();
    }));
    // Bar hover tooltip
    const tip = root.querySelector("#chartTip");
    const wrap = tip?.closest(".chart-wrap");
    root.querySelectorAll(".barg").forEach((g) => {
      g.addEventListener("mousemove", (e) => {
        const s = prodStatsCache[Number(g.dataset.i)];
        if (!s || !tip || !wrap) return;
        const r = wrap.getBoundingClientRect();
        tip.innerHTML = `<div class="tt-d">${parseISO(s.iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          <div class="tt-r"><span style="color:var(--green)">Completed</span><span>${s.completed}</span></div>
          <div class="tt-r"><span style="color:var(--red)">Missed</span><span>${s.missed}</span></div>
          <div class="tt-r"><span class="muted">Routines</span><span>${s.rDone}/${s.rSched}</span></div>`;
        tip.style.left = (e.clientX - r.left) + "px";
        tip.style.top = (e.clientY - r.top - 12) + "px";
        tip.classList.add("show");
      });
      g.addEventListener("mouseleave", () => tip?.classList.remove("show"));
    });
  },
};

// ── 11 DAILY ROUTINES ────────────────────────────────────────────────────────
function isScheduledToday(r) {
  if (r.schedule === "weekdays") { const d = todayDate().getDay(); return d >= 1 && d <= 5; }
  return true; // daily / default
}
function routineDone(rid, iso = todayISO()) {
  return state.routineLog.some((l) => l.routineId === rid && l.date === iso && l.done);
}
function todaysRoutines() {
  return state.routines.filter(isScheduledToday).map((r) => ({ ...r, done: routineDone(r.id) }));
}
function routineRow(r) {
  return `<div class="row ${r.done ? "done" : ""}">
    <div class="check ${r.done ? "done" : ""}" data-routine-toggle="${r.id}">✓</div>
    <div class="body"><div class="t">${esc(r.icon || "")} ${esc(r.name)}</div>
    <div class="m"><span>${esc(r.schedule)}</span></div></div></div>`;
}
function toggleRoutine(rid, iso = todayISO()) {
  const id = `${rid}__${iso}`;
  const existing = state.routineLog.find((l) => l.id === id);
  if (existing) DB.upsert("routineLog", { ...existing, done: !existing.done });
  else DB.upsert("routineLog", { id, routineId: rid, date: iso, done: true });
}

VIEWS.routines = {
  render() {
    const routines = state.routines;
    const streaks = routines.map((r) => ({ r, streak: streakFor(r.id), rate: rate7(r.id) }));
    const todays = todaysRoutines();
    const doneCount = todays.filter((t) => t.done).length;
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Discipline</div><h1>Daily Routines</h1></div>
        <button class="btn primary" data-add-routine>+ New routine</button></div>

      <div class="grid cols-2 mb">
        <div class="stat"><div class="k">Today</div><div class="v ${doneCount === todays.length && todays.length ? "green" : "amber"}">${doneCount}/${todays.length}</div><div class="sub">completed</div></div>
        <div class="stat"><div class="k">Active Routines</div><div class="v">${routines.length}</div></div>
      </div>

      <div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> Today's checklist</div>
        ${todays.map(routineRow).join("") || `<div class="empty">Add your first routine.</div>`}
      </div>

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> Last 7 days</div>
        ${streaks.length ? streaks.map(({ r, streak, rate }) => `
          <div class="row"><div class="body"><div class="t">${esc(r.icon || "")} ${esc(r.name)}</div>
            <div class="m">${last7Dots(r.id)}<span>${rate}% · ${streak}d streak</span></div></div>
            <div class="actions"><button class="icon-btn" data-edit-routine="${r.id}">✎</button></div></div>`).join("") : `<div class="empty">—</div>`}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-routine-toggle]").forEach((el) => el.addEventListener("click", () => toggleRoutine(el.dataset.routineToggle)));
    root.querySelectorAll("[data-edit-routine]").forEach((el) => el.addEventListener("click", () => editRoutine(el.dataset.editRoutine)));
    root.querySelectorAll("[data-add-routine]").forEach((el) => el.addEventListener("click", () => editRoutine()));
    root.querySelectorAll("[data-dot]").forEach((el) => el.addEventListener("click", () => toggleRoutine(el.dataset.rid, el.dataset.dot)));
  },
};

function last7Dots(rid) {
  let out = "";
  for (let i = 6; i >= 0; i--) {
    const iso = toISO(new Date(todayDate().getTime() - i * DAY));
    const done = routineDone(rid, iso);
    out += `<span data-dot="${iso}" data-rid="${rid}" title="${iso}" style="cursor:pointer;display:inline-block;width:13px;height:13px;border-radius:3px;margin-right:3px;background:${done ? "var(--green)" : "var(--navy-700)"};border:1px solid var(--line)"></span>`;
  }
  return `<span class="flex" style="gap:0">${out}</span>`;
}
function rate7(rid) {
  let d = 0; for (let i = 0; i < 7; i++) { const iso = toISO(new Date(todayDate().getTime() - i * DAY)); if (routineDone(rid, iso)) d++; }
  return Math.round((d / 7) * 100);
}
function streakFor(rid) {
  let s = 0;
  for (let i = 0; i < 365; i++) { const iso = toISO(new Date(todayDate().getTime() - i * DAY)); if (routineDone(rid, iso)) s++; else break; }
  return s;
}

function editRoutine(id) {
  const r = id ? state.routines.find((x) => x.id === id) : null;
  formModal({
    title: r ? "Edit Routine" : "New Routine",
    fields: [
      { key: "name", label: "Name" },
      { key: "icon", label: "Emoji (optional)" },
      { key: "schedule", label: "Schedule", type: "select", options: [["daily", "Every day"], ["weekdays", "Weekdays only"]] },
    ],
    values: r || { schedule: "daily", icon: "✅" },
    onSubmit: (v) => { DB.upsert("routines", { ...(r || {}), ...v }); toast("Saved"); },
    onDelete: r ? () => DB.remove("routines", r.id) : null,
  });
}

// ── 12 DATA & SYNC ───────────────────────────────────────────────────────────
VIEWS.data = {
  render() {
    const live = DB.mode === "firestore";
    const props = [...state.properties].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">System</div><h1>Data &amp; Sync</h1></div></div>

      <div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> Sync status</div>
        <div class="flex" style="gap:10px"><span class="sync-dot ${live ? "live" : "local"}"></span>
          <strong>${live ? "Firestore — syncing across devices" : "Local only (this browser)"}</strong></div>
        <div class="muted mt" style="font-size:13px">
          ${live
            ? "Your data lives in Firebase Firestore and syncs to every device you sign into this URL from."
            : "Firebase isn't configured yet, so data is saved in this browser only. Paste your config into <span class='mono'>firebase-config.js</span> and redeploy to turn on cross-device sync. Nothing you enter now is lost — it uploads once configured."}
        </div>
      </div>

      <div class="panel mb">
        <div class="panel-title"><span class="n">▸</span> Backup &amp; restore</div>
        <div class="muted mb" style="font-size:13px">Export a full JSON snapshot, or restore/seed from a backup file (e.g. your old dashboard export).</div>
        <div class="flex wrap">
          <button class="btn" data-export>⬇ Export backup JSON</button>
          <label class="btn" style="cursor:pointer">⬆ Import / restore<input type="file" accept="application/json,.json" class="hide" data-import></label>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title"><span class="n">▸</span> All properties (${props.length}) <button class="btn sm" data-add-prop style="margin-left:auto">+ Add property</button></div>
        ${props.map((p) => `<div class="row" data-edit-prop="${p.id}" style="cursor:pointer"><div class="body">
          <div class="t">${esc(p.name)} ${p.blank ? `<span class="tag">blank slot</span>` : ""}</div>
          <div class="m"><span class="tag ${p.kind === "active-build" ? "amber" : ""}">${esc(p.kind)}</span>
          ${p.address ? `<span>${esc(p.address)}</span>` : ""}${p.tenant ? `<span>👤 ${esc(p.tenant)}</span>` : ""}
          ${p.leaseEnd ? `<span>lease ends ${fmtDate(p.leaseEnd)}</span>` : ""}</div></div>
          <div class="actions"><button class="icon-btn">✎</button></div></div>`).join("")}
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-edit-prop]").forEach((el) => el.addEventListener("click", () => editProperty(el.dataset.editProp)));
    root.querySelectorAll("[data-add-prop]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); addProperty(); }));
    $("[data-export]", root)?.addEventListener("click", exportBackup);
    $("[data-import]", root)?.addEventListener("change", (e) => importBackup(e.target.files[0]));
  },
};

function addProperty() {
  formModal({
    title: "New Property",
    fields: [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "kind", label: "Type", type: "select", options: [["rental", "Rental"], ["active-build", "Active build"], ["other", "Other"]] },
      { key: "tenant", label: "Tenant" },
      { key: "rent", label: "Monthly rent" },
      { key: "leaseEnd", label: "Lease end", type: "date" },
    ],
    values: { kind: "rental" },
    onSubmit: (v) => { DB.upsert("properties", { id: undefined, ...v, stages: DEFAULT_STAGES, stageIndex: 0, order: 200 }); toast("Property added"); },
  });
}

function exportBackup() {
  const data = DB.exportAll(COLLECTIONS);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ssh-command-center-backup-${todayISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast("Backup exported");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    // Accept either our format {data:{col:[...]}} or a flat {col:[...]}.
    const data = parsed.data || parsed;
    let count = 0;
    for (const col of COLLECTIONS) {
      if (Array.isArray(data[col])) {
        for (const item of data[col]) { await DB.upsert(col, { ...item, id: item.id || genId() }); count++; }
      }
    }
    localStorage.setItem("sshcc:seeded", "1");
    toast(`Imported ${count} records`);
    render();
  } catch (e) {
    console.error(e); alert("Could not read that file: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────────────────────────────────────
function render() {
  try { renderNav(); } catch (e) { console.error("nav render failed", e); }
  const host = $("#view");
  if (!host) return;
  try {
    const view = VIEWS[currentView] || VIEWS.today;
    host.innerHTML = view.render();
    view.mount?.(host);
  } catch (e) {
    // A single broken view must never blank the whole app.
    console.error("view render failed:", currentView, e);
    host.innerHTML = `<div class="view"><div class="empty">
      Couldn't draw the “${esc(currentView)}” screen.<br><br>
      <button class="btn" data-nav-fallback="today">Go to Today</button>
      <button class="btn ghost" onclick="location.reload()">Reload</button>
    </div></div>`;
    host.querySelector("[data-nav-fallback]")?.addEventListener("click", () => go("today"));
  }
  try {
    const dot = $("#syncDot"), label = $("#syncLabel");
    if (dot && label) {
      if (DB.mode === "firestore") { dot.className = "sync-dot live"; label.textContent = "Synced"; }
      else { dot.className = "sync-dot local"; label.textContent = "Local only"; }
    }
  } catch {}
}

let raf = null;
function onDataChanged() {
  if (currentView === "capture") { // don't wipe an in-progress capture; just refresh recents + nav
    renderNav();
    const rc = $("#recentCap"); if (rc) rc.innerHTML = recentCaptures();
    return;
  }
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = null; render(); });
}

// ── Sidebar (mobile) ─────────────────────────────────────────────────────────
function openSidebar() { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); }
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }

// ── Boot ─────────────────────────────────────────────────────────────────────
function hydrateFromCache() {
  for (const col of COLLECTIONS) { try { state[col] = DB.getAll(col); } catch { state[col] = []; } }
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const b = $("#themeToggle");
  if (b) { b.textContent = t === "light" ? "🌙" : "☀"; b.title = t === "light" ? "Switch to dark" : "Switch to bright"; }
}

async function boot() {
  applyTheme(localStorage.getItem("sshcc:theme") || "light");
  $("#themeToggle")?.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") === "light") ? "dark" : "light";
    localStorage.setItem("sshcc:theme", next);
    applyTheme(next);
  });
  $("#menuBtn")?.addEventListener("click", openSidebar);
  $("#scrim")?.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeSidebar(); } });

  // 1) Instant first paint from local cache. The screen is visible immediately,
  //    even before (or entirely without) Firebase — so it can never be blank.
  hydrateFromCache();
  render();

  // 2) Bring Firebase up in the background. init() has its own timeout, and a
  //    failure just means we stay on local storage — the UI is already showing.
  try { await DB.init(COLLECTIONS); } catch (e) { console.warn("Firebase init failed — local only.", e); }

  // 3) Attach live subscriptions (work in both local and Firestore modes).
  for (const col of COLLECTIONS) DB.subscribe(col, (list) => { state[col] = list; onDataChanged(); });

  try { await seedIfEmpty(); } catch (e) { console.warn("seed skipped", e); }
  try { await seedPersonalOS(); } catch (e) { console.warn("personal OS seed skipped", e); }
  try { await upgradePortfolio(); } catch (e) { console.warn("portfolio upgrade skipped", e); }
  try { await applyPortfolioStatuses(); } catch (e) { console.warn("portfolio status correction skipped", e); }
  try { await reconcileAcademy(); } catch (e) { console.warn("academy sync skipped", e); }
  render();
}

boot().catch((e) => {
  console.error("boot failed", e);
  // Absolute last resort: make sure something is on screen.
  try { hydrateFromCache(); render(); } catch (_) {}
});
