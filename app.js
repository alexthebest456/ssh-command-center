// ─────────────────────────────────────────────────────────────────────────────
//  SSH COMMAND CENTER — APP
// ─────────────────────────────────────────────────────────────────────────────
import { DB, genId } from "./db.js";
import { seedIfEmpty, DEFAULT_STAGES } from "./seed.js";

// ── State ────────────────────────────────────────────────────────────────────
const COLLECTIONS = [
  "properties", "tasks", "content", "events",
  "routines", "routineLog", "photos", "reviews", "scorecards",
];
const state = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

let currentView = localStorage.getItem("sshcc:view") || "today";
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
const NAV = [
  { id: "today", n: "01", label: "Today" },
  { id: "capture", n: "02", label: "Capture" },
  { id: "content", n: "03", label: "Content Calendar" },
  { id: "horizon", n: "04", label: "2-Week Horizon" },
  { id: "builds", n: "05", label: "Active Builds" },
  { id: "calendar", n: "06", label: "Property Calendar" },
  { id: "backlog", n: "07", label: "Backlog" },
  { id: "scorecard", n: "08", label: "Monthly Scorecard" },
  { id: "weekly", n: "09", label: "Weekly Review" },
  { id: "productivity", n: "10", label: "Productivity" },
  { id: "routines", n: "11", label: "Daily Routines" },
  { id: "data", n: "12", label: "Data & Sync" },
];

function badgeFor(id) {
  if (id === "today") return openToday().length || "";
  if (id === "horizon") return horizonTasks().length || "";
  if (id === "backlog") return backlogTasks().length || "";
  if (id === "builds") return activeBuilds().length || "";
  return "";
}

function renderNav() {
  $("#nav").innerHTML = NAV.map((item) => {
    const b = badgeFor(item.id);
    return `<button class="nav-item ${item.id === currentView ? "active" : ""}" data-nav="${item.id}">
      <span class="num">${item.n}</span>
      <span class="label">${esc(item.label)}</span>
      ${b ? `<span class="badge">${b}</span>` : ""}
    </button>`;
  }).join("");
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
    </div>`;
  },
  mount(root) {
    wireTaskRows(root);
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
function eventTagCls(t) { return { maintenance: "blue", "lease-end": "red", vacancy: "amber", inspection: "green" }[t] || ""; }

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

VIEWS.builds = {
  render() {
    const builds = activeBuilds();
    return `
    <div class="view">
      <div class="view-head"><div><div class="eyebrow">Construction</div><h1>Active Builds</h1></div>
        <div class="flex"><button class="btn" data-manage-props>Manage properties</button>
        <button class="btn primary" data-new-build>+ New build</button></div></div>
      ${builds.length ? builds.map(buildCard).join("") : `<div class="empty">No active builds. Mark a property as an active build to track it here.</div>`}
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-edit-prop]").forEach((el) => el.addEventListener("click", () => editProperty(el.dataset.editProp)));
    root.querySelectorAll("[data-stage]").forEach((el) => el.addEventListener("click", () => setStage(el.dataset.propId, Number(el.dataset.stage))));
    root.querySelectorAll("[data-photo-input]").forEach((el) =>
      el.addEventListener("change", (e) => handlePhotoUpload(el.dataset.photoInput, e.target.files)));
    root.querySelectorAll("[data-del-photo]").forEach((el) => el.addEventListener("click", () => { if (confirm("Delete photo?")) DB.remove("photos", el.dataset.delPhoto); }));
    root.querySelectorAll("[data-new-build]").forEach((el) => el.addEventListener("click", () => newBuild()));
    root.querySelectorAll("[data-manage-props]").forEach((el) => el.addEventListener("click", () => go("data")));
    root.querySelectorAll("[data-add-build-task]").forEach((el) => el.addEventListener("click", () => quickTaskFor(el.dataset.addBuildTask)));
  },
};

function buildCard(p) {
  const c = permitStatus(p);
  const stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES;
  const idx = p.stageIndex ?? 0;
  const photos = state.photos.filter((ph) => ph.propertyId === p.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const tasks = openTasks().filter((t) => t.propertyId === p.id).slice(0, 5);
  return `
  <div class="panel mb">
    <div class="flex between wrap" style="align-items:flex-start">
      <div>
        <div class="panel-title" style="margin:0"><span class="n">⚑</span> ${esc(p.name)}</div>
        <div class="mono muted" style="font-size:11px;margin-top:4px">${esc(p.address || "no address")} · stage: ${esc(stages[idx] || "—")}</div>
      </div>
      <div style="text-align:right">
        <div class="mono muted" style="font-size:10px">PERMIT CLOCK</div>
        <div class="clock ${c.cls}">${c.label}</div>
      </div>
    </div>

    <div class="bar"><span class="${c.cls === "late" ? "late" : c.cls === "ok" ? "ok" : ""}" style="width:${c.pct}%"></span></div>
    ${p.permitStart ? `<div class="mono muted" style="font-size:10px;margin-top:5px">clock started ${fmtDate(p.permitStart)} · ${esc(String(p.permitDays || "?"))}-day permit</div>` : `<div class="mono muted" style="font-size:10px;margin-top:5px">no permit clock set — edit to add one</div>`}

    <div class="stages">
      ${stages.map((s, i) => `<span class="stage-chip ${i < idx ? "done" : i === idx ? "current" : ""}" data-stage="${i}" data-prop-id="${p.id}">${esc(s)}</span>`).join("")}
    </div>

    <div class="grid cols-2 mt">
      <div>
        <div class="panel-title" style="font-size:10px"><span class="n">▸</span> Open tasks</div>
        ${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty" style="padding:14px">No open tasks</div>`}
        <button class="btn sm mt" data-add-build-task="${p.id}">+ Task for ${esc(p.name)}</button>
      </div>
      <div>
        <div class="flex between">
          <div class="panel-title" style="font-size:10px"><span class="n">▸</span> Job-site photos</div>
          <label class="btn sm" style="cursor:pointer">📷 Add<input type="file" accept="image/*" capture="environment" multiple class="hide" data-photo-input="${p.id}"></label>
        </div>
        ${photos.length ? `<div class="photo-grid">${photos.map((ph) => `
          <div class="photo"><img src="${ph.dataUrl}" alt="${esc(ph.caption || "")}"/>
          <button class="del" data-del-photo="${ph.id}">✕</button>
          <div class="cap">${esc(ph.caption || fmtDate(ph.date))}</div></div>`).join("")}</div>`
          : `<div class="empty" style="padding:14px">No photos yet</div>`}
      </div>
    </div>
    <div class="mt"><button class="btn sm ghost" data-edit-prop="${p.id}">✎ Edit build details</button></div>
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
    title: "New Active Build",
    sub: "Creates a property tracked in Active Builds.",
    fields: [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "permitStart", label: "Permit clock start", type: "date" },
      { key: "permitDays", label: "Permit length (days)", type: "number", default: 180 },
    ],
    values: { permitDays: 180 },
    onSubmit: (v) => { DB.upsert("properties", { id: undefined, name: v.name, address: v.address, kind: "active-build", stage: DEFAULT_STAGES[0], stageIndex: 0, stages: DEFAULT_STAGES, permitStart: v.permitStart, permitDays: v.permitDays, order: 100 }); toast("Build created"); },
  });
}

function editProperty(id) {
  const p = state.properties.find((x) => x.id === id);
  formModal({
    title: "Property Details",
    sub: p.kind === "active-build" ? "Active build" : "Portfolio property",
    fields: [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "kind", label: "Type", type: "select", options: [["active-build", "Active build"], ["rental", "Rental"], ["other", "Other"]] },
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
const EVENT_TYPES = ["maintenance", "lease-end", "vacancy", "inspection", "other"];
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

// ── 07 BACKLOG ───────────────────────────────────────────────────────────────
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
  renderNav();
  const view = VIEWS[currentView] || VIEWS.today;
  const host = $("#view");
  host.innerHTML = view.render();
  view.mount?.(host);
  const dot = $("#syncDot"), label = $("#syncLabel");
  if (DB.mode === "firestore") { dot.className = "sync-dot live"; label.textContent = "Synced"; }
  else { dot.className = "sync-dot local"; label.textContent = "Local only"; }
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
async function boot() {
  $("#menuBtn")?.addEventListener("click", openSidebar);
  $("#scrim")?.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeSidebar(); } });

  await DB.init(COLLECTIONS);
  // Subscribe to everything; each fires immediately from cache.
  for (const col of COLLECTIONS) DB.subscribe(col, (list) => { state[col] = list; onDataChanged(); });
  await seedIfEmpty();

  render();
}

boot();
