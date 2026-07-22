// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACTOR ACADEMY — 6-month study plan (calendar scheduler)
//
//  Turns the 58-lesson curriculum into a dated, day-by-day plan so the app can
//  answer "what do I study TODAY?" and show the full path to both CSLB exams.
//
//  Cadence: one new lesson per WEEKDAY (Mon–Fri); weekends are review + a
//  practice-exam set. Lessons are consumed in curriculum order, Law & Business
//  first (§1–§7), then Trade (§8–§12), with a review buffer and a target exam
//  date after each track. The schedule is derived from the LIVE curriculum
//  order, so it always matches whatever lessons currently exist.
//
//  Dates are handled in local time to match app.js (parseISO uses new Date(y,
//  m-1, d)). ISO strings are zero-padded, so plain string comparison is a valid
//  date comparison.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_VERSION = "cslb-plan-v1";
export const PLAN_START = "2026-07-23";   // Day 1 — starts tomorrow
export const EXAM_TARGET = "2026-12-31";  // overall "licensed by" goal

// ── local-date helpers (mirror app.js parseISO/toISO semantics) ──────────────
function pd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function isoOf(dt) {
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, "0"), d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(s, n) { const x = pd(s); x.setDate(x.getDate() + n); return isoOf(x); }
function isWeekday(s) { const w = pd(s).getDay(); return w >= 1 && w <= 5; }
export function nextWeekday(s) { let c = s; while (!isWeekday(c)) c = addDays(c, 1); return c; }
export function daysBetween(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
export function fmtShort(s) { return pd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
export function fmtWeekday(s) { return pd(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }

// ── schedule: one lesson per weekday ─────────────────────────────────────────
export function scheduleLessons(ordered, start = PLAN_START) {
  let c = nextWeekday(start);
  return ordered.map((l, i) => {
    const item = { ...l, planDate: c, planDay: i + 1 };
    c = nextWeekday(addDays(c, 1));
    return item;
  });
}

// ── full plan: schedule + track boundaries + exam target dates ───────────────
export function buildPlan(ordered, start = PLAN_START) {
  const sched = scheduleLessons(ordered, start);
  const lb = sched.filter((l) => l.part === "L&B");
  const tr = sched.filter((l) => l.part === "Trade");
  const s0 = nextWeekday(start);
  const lbStart = lb.length ? lb[0].planDate : s0;
  const lbEnd = lb.length ? lb[lb.length - 1].planDate : s0;
  const trStart = tr.length ? tr[0].planDate : lbEnd;
  const trEnd = tr.length ? tr[tr.length - 1].planDate : lbEnd;
  // ~1.5 weeks of review after the last lesson of each track, landing on a weekday.
  const lbExam = nextWeekday(addDays(lbEnd, 10));
  const trExam = nextWeekday(addDays(trEnd, 10));
  return { start: s0, sched, lbStart, lbEnd, lbExam, trStart, trEnd, trExam, examTarget: EXAM_TARGET };
}

// ── per-section calendar ranges (for the timeline UI) ────────────────────────
export function sectionRanges(plan) {
  const bySec = new Map();
  for (const l of plan.sched) {
    if (!bySec.has(l.sec)) bySec.set(l.sec, { sec: l.sec, part: l.part, title: l.section, start: l.planDate, end: l.planDate, count: 0 });
    const r = bySec.get(l.sec);
    r.count++; if (l.planDate < r.start) r.start = l.planDate; if (l.planDate > r.end) r.end = l.planDate;
  }
  return [...bySec.values()].sort((a, b) => a.sec - b.sec);
}

// ── "where am I today?" status ───────────────────────────────────────────────
//  doneCount = how many lessons the user has actually completed.
export function planStatus(plan, todayStr, doneCount) {
  if (todayStr < plan.start) {
    return { phase: "pre", startsInDays: daysBetween(todayStr, plan.start), start: plan.start, total: plan.sched.length };
  }
  const total = plan.sched.length;
  const expected = plan.sched.filter((l) => l.planDate <= todayStr).length; // lessons scheduled up to and incl. today
  const delta = doneCount - expected;                                       // >0 ahead, <0 behind
  const todayLesson = plan.sched.find((l) => l.planDate === todayStr) || null;
  const done = Math.min(doneCount, total);
  return {
    phase: done >= total ? "complete" : "active",
    total, expected, delta, todayLesson, done,
    onTrack: delta >= 0,
    isReviewDay: !todayLesson, // weekend, or a weekday past the last lesson
  };
}
