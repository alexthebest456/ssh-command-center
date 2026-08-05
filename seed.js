// ─────────────────────────────────────────────────────────────────────────────
//  SEED DATA
//  Runs when the portfolio is empty (first run OR recovery). Everything here is
//  fully editable from inside the app afterward.
// ─────────────────────────────────────────────────────────────────────────────

import { DB } from "./db.js";

const DAY = 86400000;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (days) => iso(new Date(today().getTime() + days * DAY));

// Default build stages (edit per property in-app).
export const DEFAULT_STAGES = [
  "Acquisition",
  "Design / Plans",
  "Permitting",
  "Demo",
  "Framing",
  "MEP Rough-in",
  "Drywall",
  "Finishes",
  "Punch List",
  "Listed / Rented",
];

// ── The real SSH portfolio (from DoorLoop). All editable in-app. ──────────────
// kind "rental" = stabilized portfolio; flip any to "active-build" in the app
// (Edit ▸ Type) to get a permit clock + stage tracking.
function prop(order, id, name, address, propertyType, units) {
  return {
    id,
    name,
    address,
    propertyType,
    units,
    kind: "rental",
    stage: "",
    stageIndex: 0,
    stages: DEFAULT_STAGES,
    permitStart: "",
    permitDays: "",
    rent: "",
    tenant: "",
    leaseEnd: "",
    notes: "",
    order,
  };
}

export const REAL_PORTFOLIO = [
  prop(1, "prop-arrington-10516", "10516 Arrington Ave", "10516 Arrington Ave, Downey, CA 90241", "Multi-Family", 4),
  prop(2, "prop-arrington-10522", "10522 Arrington Ave", "10522 Arrington Ave, Downey, CA 90241", "Multi-Family", 4),
  prop(3, "prop-burke-11544", "11544 Burke St", "11544 Burke St, Whittier, CA 90606", "Multi-Family", 2),
  prop(4, "prop-burke-11550", "11550 Burke Street", "11550 Burke Street, Whittier, CA 90606", "Multi-Family", 4),
  prop(5, "prop-painter-11912", "11912 Painter Ave", "11912 Painter Ave, Whittier, CA 90605", "Multi-Family", 3),
  prop(6, "prop-140-12th", "140 12th St", "140 12th St, Seal Beach, CA 90740", "Multi-Family", 4),
  prop(7, "prop-firvale", "1603 Firvale Ave", "1603 Firvale Ave, Montebello, CA 90640", "Condo", 1),
  prop(8, "prop-broadway", "Broadway", "Broadway, Long Beach, CA 90802", "Multi-Family", 4),
  prop(9, "prop-crestview", "Crestview Avenue", "Crestview Avenue, Seal Beach, CA 90740", "Single-Family", 1),
  prop(10, "prop-dinsdale", "Dinsdale Street", "Dinsdale Street, Downey, CA", "Multi-Family", ""),
  prop(11, "prop-fidel", "Fidel Ave", "Fidel Ave, Whittier, CA 90605", "Multi-Family", 3),
  prop(12, "prop-gramercy", "Gramercy Pl", "Gramercy Pl, Gardena, CA 90249", "Multi-Family", 1),
  prop(13, "prop-muller", "Muller Street", "Muller Street, Downey, CA 90241", "Multi-Family", 4),
  prop(14, "prop-ssh-corporate", "SSH Corporate", "Seal Beach, CA 90740", "Multi-Family", 1),
  prop(15, "prop-spry", "Spry Street", "Spry Street, Norwalk, CA 90650", "Multi-Family", 2),
  prop(16, "prop-tweedy", "Tweedy Lane", "Tweedy Lane, Downey, CA 90240", "Multi-Family", 3),
  prop(17, "prop-washington", "Washington Street", "Washington Street, Bellflower, CA 90706", "Multi-Family", 2),
  prop(18, "prop-woodruff-nance", "Woodruff & Nance", "Woodruff & Nance, Downey, CA 90241", "Multi-Family", 4),
];

// Recognises the OLD placeholder seed so the upgrade can safely replace it
// without ever touching real, user-edited data. (New real IDs above are all
// distinct from these, so real data is never mistaken for a placeholder.)
function isOldPlaceholder(p) {
  return (
    ["prop-arrington", "prop-painter", "prop-seal-beach"].includes(p.id) ||
    /^prop-slot-/.test(p.id) ||
    /^Property \d+$/.test(p.name || "") ||
    (p.kind === "active-build" && ["Arrington", "Painter", "Seal Beach"].includes(p.name))
  );
}

export async function seedIfEmpty() {
  // Seed only when there is genuinely no portfolio yet. This covers both the
  // very first run AND recovery when the database comes up empty. DB.init has
  // already reconciled with Firestore by this point, so `hasAny` reflects the
  // real remote+local state — we won't seed on top of existing data.
  if (DB.hasAny("properties")) {
    localStorage.setItem("sshcc:seeded", "1");
    return;
  }

  for (const p of REAL_PORTFOLIO) await DB.upsert("properties", p);

  // Daily routines
  const routines = [
    { name: "Workout", icon: "💪", schedule: "daily", order: 1 },
    { name: "Morning dog walk", icon: "🐕", schedule: "daily", order: 2 },
    { name: "Evening dog walk", icon: "🌙", schedule: "daily", order: 3 },
    { name: "Review horizon", icon: "🗒️", schedule: "weekdays", order: 4 },
    { name: "Content post", icon: "📱", schedule: "weekdays", order: 5 },
  ];
  for (const r of routines) await DB.upsert("routines", { id: undefined, ...r });

  // A few starter tasks referencing real properties
  const tasks = [
    { title: "Call Painter Ave inspector re: sign-off", due: plus(1), status: "open", propertyId: "prop-painter-11912", priority: 2, tags: ["build"] },
    { title: "Order materials for Burke St unit turn", due: plus(3), status: "open", propertyId: "prop-burke-11550", priority: 1, tags: ["turn", "material"] },
    { title: "Draft monthly portfolio scorecard", due: "", status: "open", propertyId: "", priority: 1, tags: ["ops"] },
  ];
  for (const t of tasks) await DB.upsert("tasks", { id: undefined, ...t });

  // Content calendar starters
  const content = [
    { title: "Portfolio walkthrough reel", platform: "Instagram", status: "idea", date: plus(2), notes: "", propertyId: "prop-broadway" },
    { title: "“What a permit clock is” explainer", platform: "TikTok", status: "scripted", date: plus(4), notes: "", propertyId: "" },
  ];
  for (const c of content) await DB.upsert("content", { id: undefined, ...c });

  // Property-calendar events across the portfolio
  const events = [
    { type: "inspection", title: "Unit inspection", date: plus(1), propertyId: "prop-painter-11912", notes: "" },
    { type: "maintenance", title: "HVAC service", date: plus(9), propertyId: "prop-muller", notes: "" },
    { type: "lease-end", title: "Lease ends", date: plus(45), propertyId: "prop-crestview", notes: "Decide renew vs. list." },
  ];
  for (const e of events) await DB.upsert("events", { id: undefined, ...e });

  // Current-month scorecard shell (doors = sum of units above)
  const ym = iso(today()).slice(0, 7);
  const doors = REAL_PORTFOLIO.reduce((a, p) => a + (Number(p.units) || 0), 0);
  await DB.upsert("scorecards", { id: ym, month: ym, doors, occupied: "", grossRent: "", expenses: "", noi: "", notes: "" });

  localStorage.setItem("sshcc:seeded", "1");
}

// ── Personal Operating System seed (habits, goals, reading) ───────────────────
export async function seedPersonalOS() {
  if (!DB.hasAny("habits")) {
    const habits = [
      { id: "hab-wake", name: "Wake at 5:00 AM", icon: "⏰", cadence: "daily", target: 1, weight: 1, order: 1, time: "5:00 AM" },
      { id: "hab-workout", name: "Morning workout", icon: "💪", cadence: "daily", target: 1, weight: 1, order: 2, time: "5:30 AM" },
      { id: "hab-clean", name: "Clean & organize space", icon: "🧹", cadence: "daily", target: 1, weight: 1, order: 3, time: "6:30 AM" },
      { id: "hab-eat", name: "Eat healthy all day", icon: "🥗", cadence: "daily", target: 1, weight: 1, order: 4 },
      { id: "hab-nocoffee", name: "No coffee (pre-workout ok)", icon: "🚫", cadence: "daily", target: 1, weight: 1, order: 5 },
      { id: "hab-work", name: "Handle work priorities", icon: "🎯", cadence: "daily", target: 1, weight: 1, order: 6 },
      { id: "hab-meatball", name: "Take Meatball out", icon: "🐕", cadence: "daily", target: 2, weight: 1, order: 7 },
      { id: "hab-read", name: "Read 15 minutes", icon: "📖", cadence: "daily", target: 1, weight: 1, order: 8, time: "9:00 PM" },
      { id: "hab-mealprep", name: "Meal prep (next 5 days)", icon: "🍱", cadence: "everyN", everyDays: 5, target: 1, weight: 1, order: 9 },
    ];
    for (const h of habits) await DB.upsert("habits", h);
  }

  if (!DB.hasAny("goals")) {
    await DB.upsert("goals", {
      id: "goal-contractor",
      title: "California “B” — General Building Contractor's License",
      why: "Legally build, remodel, and manage residential & commercial construction projects.",
      targetDate: "2026-12-31",
      order: 1,
      milestones: [
        { t: "Confirm eligibility — 4 yrs journey-level experience (last 10 yrs)", done: false },
        { t: "Get experience verified & signed by a qualifier", done: false },
        { t: "Submit application + fee to the CSLB", done: false },
        { t: "Receive test-eligibility / scheduling notice", done: false },
        { t: "Study — Law & Business (2–3 weeks)", done: false },
        { t: "Study — Trade exam, General Building B (3–4 weeks)", done: false },
        { t: "Score 80%+ on practice exams", done: false },
        { t: "Pass the Law & Business exam", done: false },
        { t: "Pass the Trade (B) exam", done: false },
        { t: "Complete Live Scan fingerprinting", done: false },
        { t: "Post $25,000 contractor bond + pay issuance fee", done: false },
        { t: "License issued 🎉", done: false },
      ],
    });
  }

  if (!DB.hasAny("books")) {
    const books = [
      { id: "book-htwf", title: "How to Win Friends & Influence People", author: "Dale Carnegie", status: "finished", order: 1 },
      { id: "book-power-now", title: "The Power of Now", author: "Eckhart Tolle", status: "finished", order: 2 },
      { id: "book-richest-babylon", title: "The Richest Man in Babylon", author: "George S. Clason", status: "finished", order: 3 },
      { id: "book-atomic-habits", title: "Atomic Habits", author: "James Clear", status: "finished", order: 4 },
      { id: "book-cant-hurt-me", title: "Can't Hurt Me", author: "David Goggins", status: "finished", order: 5 },
      { id: "book-the-one-thing", title: "The One Thing", author: "Gary Keller & Jay Papasan", status: "reading", order: 6, note: "Focus & prioritization — the single most important thing that makes everything else easier or unnecessary." },
      { id: "book-extreme-ownership", title: "Extreme Ownership", author: "Jocko Willink & Leif Babin", status: "queued", order: 7, note: "Leadership + radical accountability." },
      { id: "book-never-split", title: "Never Split the Difference", author: "Chris Voss", status: "queued", order: 8, note: "Negotiation." },
      { id: "book-psych-money", title: "The Psychology of Money", author: "Morgan Housel", status: "queued", order: 9, note: "Wealth + decision-making." },
      { id: "book-influence", title: "Influence", author: "Robert Cialdini", status: "queued", order: 10, note: "Persuasion / sales psychology." },
      { id: "book-discipline-destiny", title: "Discipline Is Destiny", author: "Ryan Holiday", status: "queued", order: 11, note: "Self-discipline." },
      { id: "book-score-itself", title: "The Score Takes Care of Itself", author: "Bill Walsh", status: "queued", order: 12, note: "Leadership by standards." },
    ];
    for (const b of books) await DB.upsert("books", b);
  }
  if (!DB.hasAny("workouts")) {
    // Weekly training split (dow: 0=Sun … 6=Sat). Repeats every week; edit any day in-app.
    const split = [
      { dow: 0, focus: "Legs" },
      { dow: 1, focus: "Chest & Triceps" },
      { dow: 2, focus: "Back & Abs" },
      { dow: 3, focus: "Legs" },
      { dow: 4, focus: "Shoulders + light Chest" },
      { dow: 5, focus: "Biceps + light Back" },
      { dow: 6, focus: "Legs" },
    ];
    for (const w of split) await DB.upsert("workouts", { id: "wo-" + w.dow, ...w });
  }

  localStorage.setItem("sshcc:pos-seeded", "1");
}

// One-time, safe upgrade: if the portfolio still consists solely of the OLD
// placeholder seed (the 3 sample builds + 15 blank slots), replace it with the
// real DoorLoop portfolio. If ANY property looks like real/edited data, this
// does nothing — so it can never clobber your work.
export async function upgradePortfolio() {
  if (localStorage.getItem("sshcc:portfolio-v2")) return;
  const props = DB.getAll("properties");

  const onlyPlaceholders = props.length > 0 && props.every(isOldPlaceholder);
  if (props.length > 0 && !onlyPlaceholders) {
    // Real data present — don't touch it, just mark the upgrade as handled.
    localStorage.setItem("sshcc:portfolio-v2", "1");
    return;
  }

  if (onlyPlaceholders) {
    for (const p of props) await DB.remove("properties", p.id);
    for (const p of REAL_PORTFOLIO) await DB.upsert("properties", p);
  }
  localStorage.setItem("sshcc:portfolio-v2", "1");
}

// ── One-time project-status correction (as of Jul 2026) ──────────────────────
// Sets the real phase/stage on known projects so the dashboard reflects reality
// instead of defaulting every property to "stabilized". Matches by id first,
// then by name/address text, and only writes the listed fields — nothing else
// is touched. Guarded so it runs once; bump the version to re-run with edits.
const STATUS_UPDATES = [
  { match: ["prop-washington", "washington"], kind: "active-build", phase: "active", stageIndex: 4, stage: "Framing",
    nextStep: "Completing framing" },
  { match: ["prop-muller", "muller", "mueller"], kind: "active-build", phase: "active", stageIndex: 2, stage: "Permitting",
    nextStep: "Ready to build — waiting on tenant to vacate garage; construction starts Aug 24, done by Dec 20", startDate: "2026-07-21", targetDate: "2026-12-20" },
  { match: ["prop-spry", "spry"], kind: "active-build", phase: "active", stageIndex: 2, stage: "Permitting",
    nextStep: "Ready to build ~Aug 1 — 3.5-month build", startDate: "2026-08-01", targetDate: "2026-11-15" },
  { match: ["prop-painter-11912", "painter"], kind: "active-build", phase: "active", stageIndex: 1, stage: "Design / Plans",
    nextStep: "Run numbers & decide scope by Aug 1 — 6-month planning", startDate: "2026-08-01", targetDate: "2027-02-01" },
  { match: ["prop-140-12th", "140 12th", "12th st"], kind: "active-build", phase: "active", stageIndex: 1, stage: "Design / Plans",
    nextStep: "ADU: ~1 mo architect plans → ~6 mo city planning/permits · tenants out Nov 30, remodel units Dec–Jan", startDate: "2026-07-21", targetDate: "2027-02-28" },
  { match: ["prop-tweedy", "tweedy"], phase: "land",
    nextStep: "Analyze land & decide what to build — screen architects" },
  { match: ["prop-fidel", "fidel"], phase: "land",
    nextStep: "Analyze land & decide what to build — screen architects" },
  { match: ["prop-woodruff-nance", "woodruff", "nance"], phase: "land",
    nextStep: "Analyze land & decide what to build — screen architects" },
  // The manually-added "Arrington" deal (no address) — not yet closed → Pipeline,
  // not an active build. Exact-name match so it never touches 10516/10522 Arrington.
  { nameEquals: "arrington", kind: "pipeline", phase: "pipeline", stageIndex: 0, stage: "Acquisition",
    nextStep: "Closing ~Jul 31 — then offer cash-for-keys", targetDate: "2026-07-31" },
];

export async function applyPortfolioStatuses() {
  if (localStorage.getItem("sshcc:portfolio-status-v4")) return;
  const props = DB.getAll("properties");
  if (!props.length) return; // data not loaded yet — try again next boot (guard not set)
  let applied = 0;
  for (const u of STATUS_UPDATES) {
    let target = null;
    if (u.nameEquals) {
      target = props.find((x) => (x.name || "").trim().toLowerCase() === u.nameEquals);
    } else {
      target = props.find((x) => u.match.includes(x.id)) ||
               props.find((x) => u.match.some((m) => (x.name || "").toLowerCase().includes(m) || (x.address || "").toLowerCase().includes(m)));
    }
    if (!target) continue;
    const { match, nameEquals, ...fields } = u;
    await DB.upsert("properties", { ...target, ...fields });
    applied++;
  }
  localStorage.setItem("sshcc:portfolio-status-v4", "1");
  console.log(`Portfolio status correction applied to ${applied} propert${applied === 1 ? "y" : "ies"}.`);
}

// ── Executive setup — align to the master project list + load priorities ─────
// Adds projects that don't exist yet (Inglewood, Mother's REP), sets executive
// fields (health/risk/priority/city/consultants/waiting-on/bottleneck), retires
// Painter from active management, and seeds the current priority tasks. Runs once.
const NEW_PROJECTS = [
  { id: "prop-inglewood", name: "Inglewood", address: "Inglewood, CA", kind: "pipeline", phase: "pipeline", city: "Inglewood",
    units: "", order: 30, priority: 3, risk: "med", health: "yellow", waitingOn: "me", permitStatus: "Pre-acquisition",
    bottleneck: "Underwriting — decide max offer", nextMilestone: "Underwrite: max offer + ADU/JADU feasibility",
    nextStep: "Underwrite — determine the absolute highest price + ADU/JADU/garage-conversion feasibility" },
  { id: "prop-mother-rep", name: "Mother's REP Status", address: "", kind: "other", phase: "active", nonConstruction: true,
    order: 31, priority: 2, risk: "low", health: "green", waitingOn: "me", bottleneck: "Plan the hours + documentation",
    nextMilestone: "Complete REP status plan", nextStep: "Complete Real Estate Professional status planning" },
];
const EXEC_UPDATES = [
  { match: ["prop-muller", "muller"], priority: 3, risk: "low", health: "green", city: "Downey", waitingOn: "tenant",
    permitStatus: "In plan check", bottleneck: "Tenant to vacate garage (Aug 24)", nextMilestone: "Sign contractor agreement → start demo", nextDeadline: "2026-08-24" },
  { match: ["prop-washington", "washington"], priority: 2, risk: "low", health: "green", city: "Bellflower", waitingOn: "",
    permitStatus: "Permitted", bottleneck: "", nextMilestone: "Complete framing" },
  { match: ["prop-140-12th", "140 12th", "12th st"], name: "Seal Beach ADU", priority: 3, risk: "med", health: "yellow", city: "Seal Beach",
    waitingOn: "consultant", permitStatus: "Architect plans in progress", bottleneck: "Architect plans (~1 mo) → city (~6 mo)", nextMilestone: "Sign ADU deal + finish architect plans", nextDeadline: "2026-11-30" },
  { match: ["prop-spry", "spry"], priority: 2, risk: "med", health: "yellow", city: "Norwalk", waitingOn: "city",
    permitStatus: "In permit process", bottleneck: "Waiting on city permit", nextMilestone: "Permit issuance → build (~Aug 1)" },
  { nameEquals: "arrington", priority: 2, risk: "med", health: "yellow", city: "Downey", waitingOn: "me",
    permitStatus: "Pre-close", bottleneck: "Close (~Jul 31) → cash-for-keys + ADU planning", nextMilestone: "Close, then offer cash-for-keys" },
  { match: ["prop-tweedy", "tweedy"], priority: 1, risk: "low", health: "green", waitingOn: "me",
    bottleneck: "Feasibility — highest & best use", nextMilestone: "Feasibility: unit count, ADU/JADU, ROI" },
  { match: ["prop-fidel", "fidel"], priority: 1, risk: "low", health: "green", waitingOn: "me",
    bottleneck: "Feasibility — highest & best use", nextMilestone: "Feasibility: unit count, ADU/JADU, ROI" },
  { match: ["prop-woodruff-nance", "woodruff", "nance"], name: "Nance", priority: 1, risk: "low", health: "green", waitingOn: "me",
    bottleneck: "Feasibility — highest & best use", nextMilestone: "Feasibility: unit count, ADU/JADU, ROI" },
  // Painter is GC-managed — retire it from active management (no construction tasks).
  { match: ["prop-painter-11912", "painter"], kind: "rental", phase: "completed", waitingOn: "", bottleneck: "", gcManaged: true,
    nextStep: "Managed by a general contractor — no active management" },
];
const EXEC_TASKS = [
  { id: "tk-sealbeach-sign", title: "Sign Seal Beach ADU deal", priority: 2, propertyId: "prop-140-12th" },
  { id: "tk-muller-agreement", title: "Sign Muller contractor agreement", priority: 2, propertyId: "prop-muller" },
  { id: "tk-muller-demo", title: "Begin demolition at Muller", priority: 2, propertyId: "prop-muller" },
  { id: "tk-muller-landscape", title: "Landscaping demolition at Muller", priority: 1, propertyId: "prop-muller" },
  { id: "tk-muller-washer", title: "Relocate washer & dryer at Muller", priority: 1, propertyId: "prop-muller" },
  { id: "tk-arrington-adu", title: "Continue ADU planning — Arrington", priority: 1, propertyId: "" },
  { id: "tk-inglewood-uw", title: "Underwrite Inglewood + ADU planning", priority: 3, propertyId: "prop-inglewood" },
  { id: "tk-spry-permit", title: "Follow up on Spry permit process", priority: 2, propertyId: "prop-spry" },
  { id: "tk-washington-monitor", title: "Monitor Washington construction progress", priority: 1, propertyId: "prop-washington" },
  { id: "tk-mother-rep", title: "Complete Mother's REP status planning", priority: 1, propertyId: "prop-mother-rep" },
  { id: "tk-nance-feas", title: "Feasibility study — Nance", priority: 1, propertyId: "prop-woodruff-nance" },
  { id: "tk-fidel-feas", title: "Feasibility study — Fidel", priority: 1, propertyId: "prop-fidel" },
  { id: "tk-tweedy-feas", title: "Feasibility study — Tweedy", priority: 1, propertyId: "prop-tweedy" },
];

export async function applyExecSetup() {
  if (localStorage.getItem("sshcc:exec-v1")) return;
  const props = DB.getAll("properties");
  if (!props.length) return;
  const now = Date.now();
  const find = (u) => u.nameEquals
    ? props.find((x) => (x.name || "").trim().toLowerCase() === u.nameEquals)
    : (props.find((x) => u.match.includes(x.id)) || props.find((x) => u.match.some((m) => (x.name || "").toLowerCase().includes(m) || (x.address || "").toLowerCase().includes(m))));

  for (const u of EXEC_UPDATES) {
    const p = find(u); if (!p) continue;
    const { match, nameEquals, ...fields } = u;
    await DB.upsert("properties", { ...p, ...fields, lastUpdate: now });
  }
  for (const np of NEW_PROJECTS) {
    if (props.some((x) => x.id === np.id)) continue;
    await DB.upsert("properties", { kind: "active-build", stage: "", stageIndex: 0, stages: DEFAULT_STAGES, lastUpdate: now, ...np });
  }
  const tasks = DB.getAll("tasks");
  for (const t of EXEC_TASKS) {
    if (tasks.some((x) => x.id === t.id)) continue;
    await DB.upsert("tasks", { id: t.id, title: t.title, status: "open", priority: t.priority ?? 1, propertyId: t.propertyId || "", due: t.due || "", tags: ["dev"] });
  }
  localStorage.setItem("sshcc:exec-v1", "1");
  console.log("Executive setup applied.");
}

// ── Cash schedule seed — the known upcoming outflows (amounts TBD) ────────────
const CASH_SEED = [
  { id: "cash-arr-dp", type: "down-payment", date: "2026-07-31", propertyId: "", amount: 0, note: "Arrington close", status: "scheduled" },
  { id: "cash-arr-cfk", type: "cash-for-keys", date: "2026-08-07", propertyId: "", amount: 0, note: "Arrington tenant buyout", status: "scheduled" },
  { id: "cash-muller-deposit", type: "invoice", date: "2026-08-01", propertyId: "prop-muller", amount: 0, note: "Contractor deposit on signing", status: "scheduled" },
  { id: "cash-muller-demo", type: "remodel", date: "2026-08-24", propertyId: "prop-muller", amount: 0, note: "Demolition start", status: "scheduled" },
  { id: "cash-sealbeach-arch", type: "architect", date: "2026-08-01", propertyId: "prop-140-12th", amount: 0, note: "ADU plans", status: "scheduled" },
  { id: "cash-spry-permit", type: "permit-fee", date: "2026-08-01", propertyId: "prop-spry", amount: 0, note: "Permit fees", status: "scheduled" },
];
export async function applyCashSeed() {
  if (localStorage.getItem("sshcc:cash-v1")) return;
  const existing = DB.getAll("cashEvents");
  for (const c of CASH_SEED) { if (existing.some((x) => x.id === c.id)) continue; await DB.upsert("cashEvents", c); }
  localStorage.setItem("sshcc:cash-v1", "1");
  console.log("Cash schedule seeded.");
}

// ── Real financials from the master portfolio sheet (Jul 2026) ───────────────
// grossRent = gross rent/mo · loanPayment = mortgage P&I/mo · monthlyExpenses =
// operating-only (sheet "Total Expenses" MINUS mortgage), so True Net = rent −
// expenses − mortgage ties to the sheet. cashInvested omitted where the sheet
// shows placeholder values.
const FINANCIALS = [
  { id: "prop-burke-11544", units: 3, grossRent: 8495, loanPayment: 5065, monthlyExpenses: 1311, purchasePrice: 600183, currentValue: 1130000, loanBalance: 791000, cashInvested: 307286, interestRate: 6.625, zoning: "R2", grade: "A", verdict: "Keep", devPlan: "Maxed out" },
  { id: "prop-burke-11550", units: 3, grossRent: 11150, loanPayment: 7171, monthlyExpenses: 1742, purchasePrice: 849817, currentValue: 1600000, loanBalance: 1120000, cashInvested: 208714, interestRate: 6.625, zoning: "R2", grade: "A", verdict: "Keep", devPlan: "Maxed out" },
  { id: "prop-washington", units: 2, grossRent: 4500, loanPayment: 5105, monthlyExpenses: 1003, purchasePrice: 940000, currentValue: 1139000, loanBalance: 797300, cashInvested: 88200, interestRate: 6.625, zoning: "R1", grade: "A+", verdict: "Anchor", devPlan: "749 sqft ADU + 180 sqft addition" },
  { id: "prop-broadway", units: 4, grossRent: 13180, loanPayment: 9446, monthlyExpenses: 1549, purchasePrice: 1350000, currentValue: 2107500, loanBalance: 1475250, cashInvested: -190960, interestRate: 6.625, zoning: "R2", grade: "A+", verdict: "Anchor", devPlan: "None — infinite return" },
  { id: "prop-fidel", units: 3, grossRent: 10595, loanPayment: 6723, monthlyExpenses: 1333, purchasePrice: 1050000, currentValue: 1519000, loanBalance: 1063300, cashInvested: 162000, interestRate: 6.625, zoning: "R3", grade: "A+", verdict: "Anchor", devPlan: "R3 development potential" },
  { id: "prop-woodruff-nance", units: 4, grossRent: 12795, loanPayment: 7998, monthlyExpenses: 2433, purchasePrice: 1775000, currentValue: 1784500, loanBalance: 1249150, cashInvested: 440484, interestRate: 6.625, zoning: "R3", grade: "A", verdict: "Keep", devPlan: "R3 development potential" },
  { id: "prop-muller", units: 4, grossRent: 13020, loanPayment: 9466, monthlyExpenses: 2527, purchasePrice: 1650000, currentValue: 2112000, loanBalance: 1478400, cashInvested: 96600, interestRate: 6.625, zoning: "R2", grade: "A", verdict: "Keep", devPlan: "2 JADUs planned" },
  { id: "prop-tweedy", units: 3, grossRent: 10337, loanPayment: 7025, monthlyExpenses: 2028, purchasePrice: 1450000, currentValue: 1567500, loanBalance: 1097250, cashInvested: 517749, interestRate: 6.625, zoning: "R3", grade: "B", verdict: "Watch", devPlan: "R3 development potential" },
  { id: "prop-spry", units: 2, grossRent: 5520, loanPayment: 4693, monthlyExpenses: 1123, purchasePrice: 750000, currentValue: 1047000, loanBalance: 732900, cashInvested: -61400, interestRate: 6.625, zoning: "R1", grade: "D", verdict: "Watch", devPlan: "749 sqft 2x2 ADU — plans in progress" },
  { id: "prop-firvale", units: 1, grossRent: 0, loanPayment: 1976, monthlyExpenses: 0, purchasePrice: 300000, currentValue: 550000, loanBalance: 300000, cashInvested: 300000, interestRate: 6.9, zoning: "Condo", grade: "A", verdict: "Fix & Flip", devPlan: "Fix & flip — remodel in progress" },
  { id: "prop-140-12th", units: 3, grossRent: 10800, loanPayment: 14411, monthlyExpenses: 3043, purchasePrice: 2925000, currentValue: 3100000, loanBalance: 2193750, interestRate: 6.875, devPlan: "Seal Beach ADU" },
  { id: "prop-painter-11912", units: 3, grossRent: 3243, loanPayment: 5365, monthlyExpenses: 1510, purchasePrice: 1090000, currentValue: 1194000, loanBalance: 816750, interestRate: 6.875, devPlan: "GC-managed" },
  { id: "prop-arrington-10522", units: 4, grossRent: 6250, loanPayment: 5604, monthlyExpenses: 2193, purchasePrice: 1137500, currentValue: 1269000, loanBalance: 853125, interestRate: 6.875, devPlan: "ADU planning" },
  { id: "prop-arrington-10516", units: 4, grossRent: 5375, loanPayment: 5506, monthlyExpenses: 2098, purchasePrice: 1117500, currentValue: 1286000, loanBalance: 838125, interestRate: 6.875, devPlan: "ADU planning" },
  { id: "prop-inglewood", units: 4, grossRent: 0, loanPayment: 5405, monthlyExpenses: 1461, purchasePrice: 1065000, currentValue: 1065000, loanBalance: 0, interestRate: 6.09, devPlan: "Underwrite + ADU" },
];
export async function applyFinancials() {
  if (localStorage.getItem("sshcc:financials-v1")) return;
  const props = DB.getAll("properties");
  if (!props.length) return;
  let n = 0;
  for (const f of FINANCIALS) {
    const p = props.find((x) => x.id === f.id);
    if (!p) continue;
    const { id, ...fields } = f;
    await DB.upsert("properties", { ...p, ...fields });
    n++;
  }
  localStorage.setItem("sshcc:financials-v1", "1");
  console.log(`Financials loaded for ${n} properties.`);
}

// ── Financials corrections (v2) ──────────────────────────────────────────────
// - Burke Old is 11550, Burke New is 11544 (swap what v1 loaded).
// - Real cash-in: Painter/12th/Arrington = 25% down; Inglewood = full price on LOC.
// - Remove properties that shouldn't count: Gramercy & Dinsdale (sold), Crestview
//   (parents' primary residence), SSH Corporate (DoorLoop placeholder).
// - Store the $7k/mo management fee (Dad → Alex) for the investor view.
const FIN_V2 = [
  // Burke Old numbers → 11550
  { id: "prop-burke-11550", units: 3, grossRent: 8495, loanPayment: 5065, monthlyExpenses: 1311, purchasePrice: 600183, currentValue: 1130000, loanBalance: 791000, cashInvested: 307286, zoning: "R2", grade: "A", verdict: "Keep", devPlan: "Maxed out" },
  // Burke New numbers → 11544
  { id: "prop-burke-11544", units: 3, grossRent: 11150, loanPayment: 7171, monthlyExpenses: 1742, purchasePrice: 849817, currentValue: 1600000, loanBalance: 1120000, cashInvested: 208714, zoning: "R2", grade: "A", verdict: "Keep", devPlan: "Maxed out" },
  // Real cash-in (25% down / LOC)
  { id: "prop-painter-11912", cashInvested: 272500 },
  { id: "prop-140-12th", cashInvested: 731250 },
  { id: "prop-arrington-10522", cashInvested: 284375 },
  { id: "prop-arrington-10516", cashInvested: 279375 },
  { id: "prop-inglewood", cashInvested: 1065000, locFunded: true },
];
const FIN_V2_REMOVE = ["prop-gramercy", "prop-dinsdale", "prop-crestview", "prop-ssh-corporate"];
export async function applyFinancialsV2() {
  if (localStorage.getItem("sshcc:financials-v2")) return;
  const props = DB.getAll("properties");
  if (!props.length) return;
  for (const u of FIN_V2) { const p = props.find((x) => x.id === u.id); if (!p) continue; const { id, ...f } = u; await DB.upsert("properties", { ...p, ...f }); }
  for (const id of FIN_V2_REMOVE) { if (props.some((x) => x.id === id)) await DB.remove("properties", id); }
  await DB.upsert("meta", { id: "mgmtFee", amount: 7000 });
  localStorage.setItem("sshcc:financials-v2", "1");
  console.log("Financials v2 applied (Burke swap, cash-in, removals, mgmt fee).");
}

// ── Broadway Airbnb unit → model at long-term equivalent ─────────────────────
// The unit is run as a short-term rental (blended ~$4,245) but its stable
// long-term value is $3,445 (net ~$743/mo). Per the owner's own data the STR
// underperforms a long-term tenant by ~$12,270 over May–Dec, so True Net uses
// the conservative long-term figure (13,180 → 12,380) and flags the decision.
export async function applyBroadwayAirbnb() {
  if (localStorage.getItem("sshcc:broadway-str-v1")) return;
  const props = DB.getAll("properties");
  const b = props.find((x) => x.id === "prop-broadway");
  if (b) await DB.upsert("properties", { ...b, grossRent: 12380, strUnit: true, strNote: "1 unit run as Airbnb — modeled at long-term equiv $3,445/mo (net ~$743). STR is seasonal and has underperformed long-term ~$12,270 over May–Dec." });
  const tasks = DB.getAll("tasks");
  if (!tasks.some((t) => t.id === "tk-broadway-str")) {
    await DB.upsert("tasks", { id: "tk-broadway-str", title: "Decide: convert Broadway Airbnb unit to long-term ($3,445, +$743/mo stable)", status: "open", priority: 1, propertyId: "prop-broadway", due: "", tags: ["decision"] });
  }
  localStorage.setItem("sshcc:broadway-str-v1", "1");
  console.log("Broadway STR modeled at long-term equivalent.");
}

// ── Broadway STR reframe (v2): model the floor, track upside ─────────────────
export async function applyBroadwayAirbnbV2() {
  if (localStorage.getItem("sshcc:broadway-str-v2")) return;
  const props = DB.getAll("properties");
  const b = props.find((x) => x.id === "prop-broadway");
  if (b) await DB.upsert("properties", { ...b, grossRent: 12380, strUnit: true, strNote: "1 unit run as Airbnb — modeled at the long-term floor $3,445/mo (net ~$743) since upcoming months aren't booked yet. Summer bookings run well above this; log actual STR income to capture the upside." });
  const tasks = DB.getAll("tasks");
  const t = tasks.find((x) => x.id === "tk-broadway-str");
  if (t) await DB.upsert("tasks", { ...t, title: "Log Broadway Airbnb income monthly — track STR upside vs the $3,445 long-term floor", priority: 1 });
  localStorage.setItem("sshcc:broadway-str-v2", "1");
  console.log("Broadway STR reframed to floor + upside.");
}

// ── STR (Airbnb) log seed — Broadway's actual months so far ──────────────────
const STR_MONTHS = [
  { m: "2026-05", income: 3200, cleaning: 875, bookings: 5 },
  { m: "2026-06", income: 8731.94, cleaning: 1050, bookings: 6 },
  { m: "2026-07", income: 11618.48, cleaning: 1050, bookings: 6 },
  { m: "2026-08", income: 861.36, cleaning: 350, bookings: 2 },
  { m: "2026-09", income: 822.56, cleaning: 175, bookings: 1 },
  { m: "2026-10", income: 2895.45, cleaning: 700, bookings: 4 },
  { m: "2026-11", income: 2895.45, cleaning: 350, bookings: 2 },
  { m: "2026-12", income: 0, cleaning: 0, bookings: 0 },
];
export async function applyStrSeed() {
  if (localStorage.getItem("sshcc:str-v1")) return;
  const props = DB.getAll("properties");
  const b = props.find((x) => x.id === "prop-broadway");
  if (b) await DB.upsert("properties", { ...b, strMonthlyExp: 4100, strFloorNet: 743 });
  const log = DB.getAll("strLog");
  for (const s of STR_MONTHS) {
    const id = "str-broadway-" + s.m;
    if (log.some((x) => x.id === id)) continue;
    await DB.upsert("strLog", { id, propertyId: "prop-broadway", month: s.m, income: s.income, cleaning: s.cleaning, bookings: s.bookings });
  }
  localStorage.setItem("sshcc:str-v1", "1");
  console.log("STR log seeded.");
}

// ── Washington St construction draws + trade billing ─────────────────────────
const WASH_DRAWS = [
  { id: "draw-wash-1", num: 1, amountA: 29553.66, amountB: 32899.23, amount: 62452.89, status: "paid", date: "2026-07-15" },
  { id: "draw-wash-2", num: 2, amountA: 40531.05, amountB: 47625.30, amount: 88156.35, status: "paid", date: "2026-07-29" },
  { id: "draw-wash-3", num: 3, amountA: 49122.36, amountB: 57009.60, amount: 106131.96, status: "gated", date: "",
    gate: ["Electrical rough passed", "Plumbing top-out passed", "HVAC rough passed", "Roof complete (A+ADU)", "Stucco complete", "Wall insulation in + inspected", "Drywall hung", "Lien releases D1–2 on file", "Sub prelim notices cleared", "Tankless WH matches CF1R"].map((t) => ({ t, done: false })) },
  { id: "draw-wash-4", num: 4, amountA: 42164.28, amountB: 33702.12, amount: 75866.40, status: "future", date: "" },
  { id: "draw-wash-5", num: 5, amountA: 17930.15, amountB: 19026.25, amount: 36956.40, status: "future", date: "", note: "retention — released at final/CofO" },
];
// [name, d1%, d2%, d3%, d4%, physical%]
const WASH_TRADES_A = [["Demo",60,40,0,0,100],["Foundation",50,50,0,0,100],["Framing",30,70,0,0,90],["Windows",50,50,0,0,0],["Roofing",0,50,50,0,0],["Insulation",0,0,80,20,0],["Electrical",20,0,80,0,10],["Rough Plumbing",20,0,80,0,30],["HVAC",0,0,80,20,0],["Gas",20,0,80,0,0],["Tankless WH",0,0,0,100,0],["Drywall",0,0,90,10,0],["Wall Finish",0,0,60,40,0],["Stucco",0,40,60,0,0],["Interior Paint",0,0,0,100,0],["Exterior Paint",0,0,20,80,0],["Flooring",0,0,0,100,0],["Baseboard",0,0,0,100,0],["Doors",0,0,0,100,0],["Closet Shelving",0,0,0,100,0],["Kitchen",0,0,50,50,0],["Bathroom",0,0,60,40,0]];
const WASH_TRADES_B = [["Demo",60,40,0,0,100],["Foundation",50,50,0,0,100],["Framing",30,70,0,0,100],["Windows",50,50,0,0,0],["Roofing",0,50,50,0,0],["Insulation",0,0,80,20,0],["Electrical",20,0,80,0,10],["Rough Plumbing",20,0,80,0,30],["HVAC",0,0,50,50,0],["Tankless WH",0,0,0,100,0],["Drywall",0,0,90,10,0],["Wall Finish",0,0,60,40,0],["Stucco",0,40,60,0,0],["Interior Paint",0,0,90,10,0],["Vinyl Flooring",0,0,0,100,0],["Doors",0,0,0,100,0],["Closet Shelving",0,0,0,100,0],["Kitchen Counter",0,0,0,100,0],["Kitchen Fixtures",0,0,50,50,0],["Kitchen Millwork",0,0,50,50,0],["Bathroom Tile",0,0,50,50,0],["Bathroom Fixtures",0,0,50,50,0],["Bathroom Vanities",0,0,0,100,0]];
export async function applyWashingtonDraws() {
  if (localStorage.getItem("sshcc:wash-draws-v1")) return;
  const pid = "prop-washington";
  const existingD = DB.getAll("draws");
  for (const d of WASH_DRAWS) { if (existingD.some((x) => x.id === d.id)) continue; await DB.upsert("draws", { ...d, propertyId: pid }); }
  const existingT = DB.getAll("trades");
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const [contract, list] of [["A", WASH_TRADES_A], ["B", WASH_TRADES_B]]) {
    for (const [name, d1, d2, d3, d4, physical] of list) {
      const id = `tr-wash-${contract}-${slug(name)}`;
      if (existingT.some((x) => x.id === id)) continue;
      await DB.upsert("trades", { id, propertyId: pid, contract, name, d1, d2, d3, d4, physical, inspection: "" });
    }
  }
  localStorage.setItem("sshcc:wash-draws-v1", "1");
  console.log("Washington draws + trades seeded.");
}

// ── Development cash schedule (5-property model, base date Jul 30 2026) ───────
// Dated capital events for the Cash Flow view. Construction totals are dated at
// each phase's start (the report has the even monthly spread). Refis are net.
const DEV_CASH = [
  // Arrington (10522 / 10516)
  { id: "dc-arr22-down", type: "down-payment", date: "2026-08-01", propertyId: "prop-arrington-10522", amount: 287875, note: "25% down + closing" },
  { id: "dc-arr16-down", type: "down-payment", date: "2026-08-01", propertyId: "prop-arrington-10516", amount: 282875, note: "25% down + closing" },
  { id: "dc-arr-cfk", type: "cash-for-keys", date: "2026-12-17", propertyId: "prop-arrington-10522", amount: 200000, note: "8 tenants × $25k (combined)" },
  { id: "dc-arr-remodel", type: "remodel", date: "2026-12-17", propertyId: "prop-arrington-10522", amount: 128000, note: "8-unit remodel (spread to Feb 17)" },
  { id: "dc-arr-adu", type: "remodel", date: "2027-03-10", propertyId: "prop-arrington-10522", amount: 512000, note: "4 ADUs, cash (spread to Jun 10)" },
  { id: "dc-arr-refi", type: "refinance", date: "2027-03-17", propertyId: "prop-arrington-10522", amount: 447220, note: "Both buildings — net cash returned" },
  // Inglewood
  { id: "dc-ing-remodel", type: "remodel", date: "2026-08-29", propertyId: "prop-inglewood", amount: 300000, note: "4-unit remodel (spread to Oct 29)" },
  { id: "dc-ing-refi1", type: "other", date: "2026-11-29", propertyId: "prop-inglewood", amount: 95000, note: "Refi 1 SHORTFALL (975k − 1.065M LOC − 5k)" },
  { id: "dc-ing-garage", type: "remodel", date: "2027-03-29", propertyId: "prop-inglewood", amount: 280000, note: "2 garage conversions (spread to Jun 29)" },
  { id: "dc-ing-refi2", type: "refinance", date: "2027-07-29", propertyId: "prop-inglewood", amount: 375422, note: "Refi 2 — net cash returned" },
  // 12th Street (Seal Beach)
  { id: "dc-12th-remodel", type: "remodel", date: "2026-11-01", propertyId: "prop-140-12th", amount: 30000, note: "3-unit remodel (spread to Dec 16)" },
  { id: "dc-12th-adu", type: "remodel", date: "2027-03-03", propertyId: "prop-140-12th", amount: 230000, note: "ADU, cash (spread to Jun 3)" },
  // Painter
  { id: "dc-paint-remodel", type: "remodel", date: "2026-09-01", propertyId: "prop-painter-11912", amount: 90000, note: "3-unit remodel (spread to Oct 16)" },
  { id: "dc-paint-adu", type: "remodel", date: "2027-03-03", propertyId: "prop-painter-11912", amount: 719040, note: "3 ADUs, cash (spread to Jul 18)" },
];
export async function applyDevCashEvents() {
  if (localStorage.getItem("sshcc:dev-cash-v1")) return;
  const ex = DB.getAll("cashEvents");
  for (const c of DEV_CASH) { if (ex.some((x) => x.id === c.id)) continue; await DB.upsert("cashEvents", { ...c, status: "scheduled" }); }
  localStorage.setItem("sshcc:dev-cash-v1", "1");
  console.log("Development cash schedule seeded.");
}

// ── Build costs for deals whose spend wasn't itemized ────────────────────────
// Muller and Spry showed $0 cash out because their only cash events were $0
// placeholders (Washington's real spend lives in its draw schedule instead).
// These are the owner's build-cost figures, added as one dated cash event each,
// fill-if-absent so a later itemized breakdown is never overwritten.
const DEV_BUILD_COSTS = [
  { id: "dc-muller-build", type: "remodel", date: "2026-08-24", propertyId: "prop-muller", amount: 270000, note: "2 JADUs — build cost" },
  { id: "dc-spry-build",   type: "remodel", date: "2026-08-15", propertyId: "prop-spry",   amount: 300000, note: "749 sqft ADU — build cost" },
];
export async function applyDevBuildCosts() {
  if (localStorage.getItem("sshcc:dev-build-costs-v1")) return;
  const ex = DB.getAll("cashEvents");
  let n = 0;
  for (const c of DEV_BUILD_COSTS) {
    if (ex.some((x) => x.id === c.id)) continue;
    await DB.upsert("cashEvents", { ...c, status: "scheduled" });
    n++;
  }
  localStorage.setItem("sshcc:dev-build-costs-v1", "1");
  console.log(`Dev build costs added on ${n} propert${n === 1 ? "y" : "ies"}.`);
}

// ── Confirmed deal corrections (walked through with the owner) ────────────────
// Existing unit counts, new-door counts, and per-property new rent — rents vary
// by building, so newRentMonthly is the total monthly rent the new units add
// (Washington = 3,400 ADU + 3,400 addition). Force-set because earlier seeds
// guessed some of these; completion DATES are deliberately left alone so the
// owner's own timeline edits survive.
const DEAL_FIX = [
  { id: "prop-washington",      units: 2, plannedUnits: 1, newRentMonthly: 6800 },
  { id: "prop-muller",          units: 8, plannedUnits: 2, newRentMonthly: 3600 },
  { id: "prop-spry",            units: 2, plannedUnits: 1, newRentMonthly: 2950 },
  { id: "prop-arrington-10516", units: 4, plannedUnits: 2, newRentMonthly: 3600 },
  { id: "prop-arrington-10522", units: 4, plannedUnits: 2, newRentMonthly: 3600 },
  { id: "prop-140-12th",        units: 4, plannedUnits: 1, newRentMonthly: 3000 },
  { id: "prop-inglewood",       units: 4, plannedUnits: 2, newRentMonthly: 3500 },
  { id: "prop-painter-11912",   units: 3, plannedUnits: 3, newRentMonthly: 8400 },
];
export async function applyDealFix() {
  if (localStorage.getItem("sshcc:deal-fix-v1")) return;
  const props = DB.getAll("properties");
  let n = 0;
  for (const f of DEAL_FIX) {
    const p = props.find((x) => x.id === f.id);
    if (!p) continue;
    await DB.upsert("properties", { ...p, units: f.units, plannedUnits: f.plannedUnits, newRentMonthly: f.newRentMonthly });
    n++;
  }
  localStorage.setItem("sshcc:deal-fix-v1", "1");
  console.log(`Deal corrections applied to ${n} properties.`);
}

// ── Dated money-out calendar (walked through with the owner) ─────────────────
// Replaces the single-lump build costs with the real draw schedule per property
// so the Cash Flow view shows exactly when cash leaves. Totals are unchanged
// except Seal Beach's ADU (now $200k, four $50k draws). Old lump ids are removed
// (deleteDoc propagates to Firestore; reconcile runs before this, so nothing is
// resurrected) and the dated draws written in their place. Also nudges the two
// Arrington remodel payments to their real Jan 17 date, dates Washington draws
// 3–5, and sets the confirmed lease-up dates. Idempotent via its guard key.
const CAL_REMOVE = ["dc-muller-build", "dc-spry-build", "dc-12th-adu", "dc-ing-remodel",
  "dc-ing-garage", "dc-paint-remodel", "dc-paint-adu", "dc-arr-adu", "dc-arr16-adu"];
const CAL_ADD = [
  // Muller — 3 JADU draws
  { id: "dc-muller-d1", type: "remodel", date: "2026-08-24", propertyId: "prop-muller", amount: 90000, note: "JADU draw 1/3" },
  { id: "dc-muller-d2", type: "remodel", date: "2026-09-24", propertyId: "prop-muller", amount: 90000, note: "JADU draw 2/3" },
  { id: "dc-muller-d3", type: "remodel", date: "2026-11-24", propertyId: "prop-muller", amount: 90000, note: "JADU draw 3/3" },
  // Spry — 4 monthly ADU draws
  { id: "dc-spry-d1", type: "remodel", date: "2026-09-01", propertyId: "prop-spry", amount: 75000, note: "ADU draw 1/4" },
  { id: "dc-spry-d2", type: "remodel", date: "2026-10-01", propertyId: "prop-spry", amount: 75000, note: "ADU draw 2/4" },
  { id: "dc-spry-d3", type: "remodel", date: "2026-11-01", propertyId: "prop-spry", amount: 75000, note: "ADU draw 3/4" },
  { id: "dc-spry-d4", type: "remodel", date: "2026-12-01", propertyId: "prop-spry", amount: 75000, note: "ADU draw 4/4" },
  // Seal Beach — ADU is $200k in 4 draws
  { id: "dc-12th-adu1", type: "remodel", date: "2027-02-01", propertyId: "prop-140-12th", amount: 50000, note: "ADU draw 1/4" },
  { id: "dc-12th-adu2", type: "remodel", date: "2027-03-01", propertyId: "prop-140-12th", amount: 50000, note: "ADU draw 2/4" },
  { id: "dc-12th-adu3", type: "remodel", date: "2027-04-01", propertyId: "prop-140-12th", amount: 50000, note: "ADU draw 3/4" },
  { id: "dc-12th-adu4", type: "remodel", date: "2027-05-01", propertyId: "prop-140-12th", amount: 50000, note: "ADU draw 4/4" },
  // Inglewood — remodel 25/50/25 then garage 4 draws
  { id: "dc-ing-rem1", type: "remodel", date: "2026-08-29", propertyId: "prop-inglewood", amount: 75000, note: "remodel 25% down" },
  { id: "dc-ing-rem2", type: "remodel", date: "2026-09-29", propertyId: "prop-inglewood", amount: 150000, note: "remodel 50%" },
  { id: "dc-ing-rem3", type: "remodel", date: "2026-10-13", propertyId: "prop-inglewood", amount: 75000, note: "remodel final 25%" },
  { id: "dc-ing-gar1", type: "remodel", date: "2027-03-29", propertyId: "prop-inglewood", amount: 70000, note: "garage draw 1/4" },
  { id: "dc-ing-gar2", type: "remodel", date: "2027-04-29", propertyId: "prop-inglewood", amount: 70000, note: "garage draw 2/4" },
  { id: "dc-ing-gar3", type: "remodel", date: "2027-05-29", propertyId: "prop-inglewood", amount: 70000, note: "garage draw 3/4" },
  { id: "dc-ing-gar4", type: "remodel", date: "2027-06-29", propertyId: "prop-inglewood", amount: 70000, note: "garage draw 4/4" },
  // Painter — remodel 3 payments then ADU 4 draws
  { id: "dc-paint-rem1", type: "remodel", date: "2026-09-01", propertyId: "prop-painter-11912", amount: 30000, note: "remodel 33%" },
  { id: "dc-paint-rem2", type: "remodel", date: "2026-10-01", propertyId: "prop-painter-11912", amount: 30000, note: "remodel 33%" },
  { id: "dc-paint-rem3", type: "remodel", date: "2026-11-01", propertyId: "prop-painter-11912", amount: 30000, note: "remodel final" },
  { id: "dc-paint-adu1", type: "remodel", date: "2027-02-07", propertyId: "prop-painter-11912", amount: 179760, note: "ADU draw 1/4" },
  { id: "dc-paint-adu2", type: "remodel", date: "2027-03-07", propertyId: "prop-painter-11912", amount: 179760, note: "ADU draw 2/4" },
  { id: "dc-paint-adu3", type: "remodel", date: "2027-04-07", propertyId: "prop-painter-11912", amount: 179760, note: "ADU draw 3/4" },
  { id: "dc-paint-adu4", type: "remodel", date: "2027-05-07", propertyId: "prop-painter-11912", amount: 179760, note: "ADU draw 4/4" },
  // Arrington ADUs — 4 draws each building, construction from Feb 7
  { id: "dc-arr22-adu1", type: "remodel", date: "2027-02-07", propertyId: "prop-arrington-10522", amount: 64000, note: "ADU draw 1/4" },
  { id: "dc-arr22-adu2", type: "remodel", date: "2027-03-07", propertyId: "prop-arrington-10522", amount: 64000, note: "ADU draw 2/4" },
  { id: "dc-arr22-adu3", type: "remodel", date: "2027-04-07", propertyId: "prop-arrington-10522", amount: 64000, note: "ADU draw 3/4" },
  { id: "dc-arr22-adu4", type: "remodel", date: "2027-05-07", propertyId: "prop-arrington-10522", amount: 64000, note: "ADU draw 4/4" },
  { id: "dc-arr16-adu1", type: "remodel", date: "2027-02-07", propertyId: "prop-arrington-10516", amount: 64000, note: "ADU draw 1/4" },
  { id: "dc-arr16-adu2", type: "remodel", date: "2027-03-07", propertyId: "prop-arrington-10516", amount: 64000, note: "ADU draw 2/4" },
  { id: "dc-arr16-adu3", type: "remodel", date: "2027-04-07", propertyId: "prop-arrington-10516", amount: 64000, note: "ADU draw 3/4" },
  { id: "dc-arr16-adu4", type: "remodel", date: "2027-05-07", propertyId: "prop-arrington-10516", amount: 64000, note: "ADU draw 4/4" },
];
const CAL_REDATE = { "dc-arr-remodel": "2027-01-17", "dc-arr16-remodel": "2027-01-17" };
const CAL_DRAW_DATES = { "draw-wash-3": "2026-08-12", "draw-wash-4": "2026-08-26", "draw-wash-5": "2026-09-09" };
const CAL_READY = {
  "prop-washington": "2026-10-21", "prop-muller": "2026-12-11", "prop-spry": "2027-01-01",
  "prop-arrington-10516": "2027-07-07", "prop-arrington-10522": "2027-07-07", "prop-140-12th": "2027-07-01",
  "prop-inglewood": "2027-07-29", "prop-painter-11912": "2027-07-07",
};
export async function applyDrawCalendar() {
  if (localStorage.getItem("sshcc:draw-calendar-v1")) return;
  const ex = DB.getAll("cashEvents");
  for (const id of CAL_REMOVE) { if (ex.some((x) => x.id === id)) await DB.remove("cashEvents", id); }
  for (const c of CAL_ADD) { if (!ex.some((x) => x.id === c.id)) await DB.upsert("cashEvents", { ...c, status: "scheduled" }); }
  for (const [id, date] of Object.entries(CAL_REDATE)) { const e = ex.find((x) => x.id === id); if (e) await DB.upsert("cashEvents", { ...e, date }); }
  const draws = DB.getAll("draws");
  for (const [id, date] of Object.entries(CAL_DRAW_DATES)) { const d = draws.find((x) => x.id === id); if (d) await DB.upsert("draws", { ...d, date }); }
  const props = DB.getAll("properties");
  for (const [id, date] of Object.entries(CAL_READY)) { const p = props.find((x) => x.id === id); if (p) await DB.upsert("properties", { ...p, unitsReadyDate: date }); }
  localStorage.setItem("sshcc:draw-calendar-v1", "1");
  console.log("Dated money-out calendar applied.");
}

// ── Arrington cash: two separate 25%-down loans, split the shared build ──────
// The combined cash-for-keys, remodel, ADU spend and the refinance were all
// booked on 10522. Both buildings are their own loan, so split those four
// 50/50: halve each on 10522 and mirror the other half onto 10516. Each
// building keeps its own down payment. Idempotent by the mirror id.
export async function applyArringtonSplit() {
  if (localStorage.getItem("sshcc:arr-split-v1")) return;
  const ex = DB.getAll("cashEvents");
  const mirror = { "dc-arr-cfk": "dc-arr16-cfk", "dc-arr-remodel": "dc-arr16-remodel", "dc-arr-adu": "dc-arr16-adu", "dc-arr-refi": "dc-arr16-refi" };
  let n = 0;
  for (const [srcId, dstId] of Object.entries(mirror)) {
    const src = ex.find((x) => x.id === srcId);
    if (!src || ex.some((x) => x.id === dstId)) continue;   // missing or already split
    const half = Math.round((Number(src.amount) || 0) / 2);
    await DB.upsert("cashEvents", { ...src, amount: half });
    await DB.upsert("cashEvents", { ...src, id: dstId, propertyId: "prop-arrington-10516", amount: half, note: (src.note || "") + " (10516 half)" });
    n++;
  }
  localStorage.setItem("sshcc:arr-split-v1", "1");
  console.log(`Arrington shared cash split across ${n} events.`);
}

// ── Washington schedule dates ────────────────────────────────────────────────
// Effective working timeline (pause Feb 26–Jul 16 excluded): start anchored so
// the 31 pre-pause working days are baked in, finish = the late-Sept forecast.
export async function applyWashingtonDates() {
  if (localStorage.getItem("sshcc:wash-dates-v1")) return;
  const props = DB.getAll("properties");
  const w = props.find((x) => x.id === "prop-washington");
  if (w) await DB.upsert("properties", { ...w, startDate: "2026-06-15", targetDate: "2026-09-30" });
  localStorage.setItem("sshcc:wash-dates-v1", "1");
  console.log("Washington schedule dates set.");
}

// ── Vacancies ────────────────────────────────────────────────────────────────
export async function applyVacancies() {
  if (localStorage.getItem("sshcc:vacancy-v1")) return;
  const props = DB.getAll("properties");
  const w = props.find((x) => x.id === "prop-washington");
  if (w) await DB.upsert("properties", { ...w, vacantUnits: 1, vacantRent: 3200, vacantNote: "Unit 10030" });
  const tasks = DB.getAll("tasks");
  if (!tasks.some((t) => t.id === "tk-washington-vacancy")) {
    await DB.upsert("tasks", { id: "tk-washington-vacancy", title: "Fill Washington vacancy — Unit 10030 ($3,200/mo)", status: "open", priority: 2, propertyId: "prop-washington", due: "", tags: ["leasing"] });
  }
  localStorage.setItem("sshcc:vacancy-v1", "1");
  console.log("Vacancy loaded.");
}

// ── Planned new doors (ADUs / JADUs / garage conversions) ────────────────────
// `plannedUnits` + `unitsReadyDate` already exist on the property record and
// already drive projectIncome() — they were simply never populated, so the
// "rent today → stabilized" figure on the dashboard read as zero upside.
//
// Every count below comes from data already in this repo: each property's own
// `devPlan` text and the dated construction events in DEV_CASH. Nothing is
// invented, and the per-unit rent is the app's own `avgUnitRent` assumption
// (Portfolio Performance → Assumptions), not a number hard-coded here.
//
// Properties whose development scope isn't decided yet (the R3 land parcels —
// Fidel, Nance, Tweedy) are deliberately left blank rather than guessed. Fill
// them in from Edit deal once the feasibility studies land.
const PLANNED_UNITS = [
  { id: "prop-washington",       units: 1, ready: "2026-09-30", why: "749 sqft ADU + 180 sqft addition" },
  { id: "prop-spry",             units: 1, ready: "2026-11-15", why: "749 sqft 2x2 ADU" },
  { id: "prop-muller",           units: 2, ready: "2026-12-20", why: "2 JADUs planned" },
  { id: "prop-140-12th",         units: 1, ready: "2027-06-03", why: "Seal Beach ADU" },
  { id: "prop-arrington-10516",  units: 2, ready: "2027-06-10", why: "4 ADUs across both buildings" },
  { id: "prop-arrington-10522",  units: 2, ready: "2027-06-10", why: "4 ADUs across both buildings" },
  { id: "prop-inglewood",        units: 2, ready: "2027-06-29", why: "2 garage conversions" },
  { id: "prop-painter-11912",    units: 3, ready: "2027-07-18", why: "3 ADUs" },
];
export async function applyPlannedUnits() {
  if (localStorage.getItem("sshcc:planned-units-v1")) return;
  const props = DB.getAll("properties");
  if (!props.length) return;
  let n = 0;
  for (const u of PLANNED_UNITS) {
    const p = props.find((x) => x.id === u.id);
    if (!p) continue;
    // Never overwrite a figure already entered by hand.
    const blank = (v) => v === undefined || v === null || v === "";
    const patch = {};
    if (blank(p.plannedUnits)) patch.plannedUnits = u.units;
    if (blank(p.unitsReadyDate)) patch.unitsReadyDate = u.ready;
    if (!Object.keys(patch).length) continue;
    await DB.upsert("properties", { ...p, ...patch });
    n++;
  }
  localStorage.setItem("sshcc:planned-units-v1", "1");
  console.log(`Planned new doors set on ${n} properties.`);
}
