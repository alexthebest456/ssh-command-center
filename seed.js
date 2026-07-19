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
      { name: "Wake at 5:00 AM", icon: "⏰", cadence: "daily", target: 1, weight: 1, order: 1 },
      { name: "Morning workout", icon: "💪", cadence: "daily", target: 1, weight: 1, order: 2 },
      { name: "Eat healthy all day", icon: "🥗", cadence: "daily", target: 1, weight: 1, order: 3 },
      { name: "No coffee (pre-workout ok)", icon: "🚫", cadence: "daily", target: 1, weight: 1, order: 4 },
      { name: "Read 15 minutes", icon: "📖", cadence: "daily", target: 1, weight: 1, order: 5 },
      { name: "Handle work priorities", icon: "🎯", cadence: "daily", target: 1, weight: 1, order: 6 },
      { name: "Take Meatball out", icon: "🐕", cadence: "daily", target: 2, weight: 1, order: 7 },
      { name: "Clean & organize space", icon: "🧹", cadence: "daily", target: 1, weight: 1, order: 8 },
      { name: "Meal prep (next 5 days)", icon: "🍱", cadence: "everyN", everyDays: 5, target: 1, weight: 1, order: 9 },
    ];
    for (const h of habits) await DB.upsert("habits", { id: undefined, ...h });
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
      { title: "How to Win Friends & Influence People", author: "Dale Carnegie", status: "finished", order: 1 },
      { title: "The Power of Now", author: "Eckhart Tolle", status: "finished", order: 2 },
      { title: "The Richest Man in Babylon", author: "George S. Clason", status: "finished", order: 3 },
      { title: "Atomic Habits", author: "James Clear", status: "reading", order: 4, note: "Builds the exact consistency-over-motivation system this dashboard is for." },
      { title: "Can't Hurt Me", author: "David Goggins", status: "queued", order: 5, note: "Mental toughness / discipline." },
      { title: "Extreme Ownership", author: "Jocko Willink & Leif Babin", status: "queued", order: 6, note: "Leadership + discipline." },
      { title: "Never Split the Difference", author: "Chris Voss", status: "queued", order: 7, note: "Negotiation." },
      { title: "The Psychology of Money", author: "Morgan Housel", status: "queued", order: 8, note: "Wealth + decision-making." },
      { title: "Influence", author: "Robert Cialdini", status: "queued", order: 9, note: "Persuasion / sales psychology." },
      { title: "Discipline Is Destiny", author: "Ryan Holiday", status: "queued", order: 10, note: "Self-discipline." },
    ];
    for (const b of books) await DB.upsert("books", { id: undefined, ...b });
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
