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

export const PLAN_VERSION = "cslb-plan-v2";
export const PLAN_START = "2026-07-22";      // Day 1 — starts tomorrow
export const LESSONS_DONE_BY = "2026-10-30"; // finish all lessons by here, leaving ~6 weeks for exams + licensing
export const EXAM_TARGET = "2026-12-15";     // overall "licensed by" goal

// Pace is derived, not fixed: enough lessons per weekday to finish the WHOLE
// curriculum (however many lessons it has) by LESSONS_DONE_BY. With 194 lessons
// that lands around 3/weekday; with a leaner curriculum it drops toward 1.

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
// Count weekdays (Mon–Fri) from `start` through `end`, inclusive.
export function weekdaysBetween(start, end) {
  if (end < start) return 0;
  let c = nextWeekday(start), n = 0, guard = 0;
  while (c <= end && guard++ < 4000) { n++; c = nextWeekday(addDays(c, 1)); }
  return n;
}
export function fmtShort(s) { return pd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
export function fmtWeekday(s) { return pd(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }

// ── schedule: `perDay` lessons per weekday ───────────────────────────────────
export function scheduleLessons(ordered, start = PLAN_START, perDay = 1) {
  const rate = Math.max(1, perDay);
  let c = nextWeekday(start);
  return ordered.map((l, i) => {
    const item = { ...l, planDate: c, planDay: i + 1 };
    if ((i + 1) % rate === 0) c = nextWeekday(addDays(c, 1)); // advance after `rate` lessons
    return item;
  });
}

// ── full plan: schedule + track boundaries + exam target dates ───────────────
export function buildPlan(ordered, start = PLAN_START, doneBy = LESSONS_DONE_BY) {
  const s0 = nextWeekday(start);
  const total = ordered.length;
  const perDay = Math.max(1, Math.ceil(total / Math.max(1, weekdaysBetween(s0, doneBy))));
  const sched = scheduleLessons(ordered, s0, perDay);
  const finish = sched.length ? sched[sched.length - 1].planDate : s0;

  // A curriculum split into the two CSLB exams (part = "L&B" / "Trade") gets two
  // exam milestones; a single combined curriculum gets both exams after finish.
  const lb = sched.filter((l) => l.part === "L&B");
  const tr = sched.filter((l) => l.part === "Trade");
  const hasSplit = lb.length > 0 && tr.length > 0;
  const lbStart = lb.length ? lb[0].planDate : s0;
  const lbEnd = lb.length ? lb[lb.length - 1].planDate : finish;
  const trStart = tr.length ? tr[0].planDate : s0;
  const trEnd = tr.length ? tr[tr.length - 1].planDate : finish;
  const lbExam = nextWeekday(addDays(hasSplit ? lbEnd : finish, 7));
  const trExam = nextWeekday(addDays(hasSplit ? trEnd : finish, 14));

  return { start: s0, sched, perDay, total, finish, hasSplit, lbStart, lbEnd, lbExam, trStart, trEnd, trExam, examTarget: EXAM_TARGET };
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
