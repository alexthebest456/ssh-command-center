// ─────────────────────────────────────────────────────────────────────────────
//  SEED DATA
//  Runs ONCE, only when a collection is completely empty and no backup has been
//  imported. Everything here is fully editable from inside the app afterward.
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

function activeBuild(order, name, stageIdx, permitStart, permitDays) {
  return {
    id: `prop-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    address: "",
    kind: "active-build",
    stage: DEFAULT_STAGES[stageIdx],
    stageIndex: stageIdx,
    stages: DEFAULT_STAGES,
    permitStart, // ISO date the permit clock started
    permitDays, // total days allowed before permit expiry
    rent: "",
    tenant: "",
    leaseEnd: "",
    notes: "",
    order,
  };
}

function blankProperty(order) {
  return {
    id: `prop-slot-${order}`,
    name: `Property ${order - 2}`, // slots start after the 3 real builds
    address: "",
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
    blank: true,
  };
}

export async function seedIfEmpty() {
  const alreadySeeded = localStorage.getItem("sshcc:seeded");
  if (alreadySeeded) return;

  // Only seed if there is genuinely no data anywhere yet.
  const anyData = ["properties", "tasks", "routines", "content"].some((c) =>
    DB.hasAny(c)
  );
  if (anyData) {
    localStorage.setItem("sshcc:seeded", "1");
    return;
  }

  // ── Properties: 3 real active builds + 15 blank editable slots ──
  const props = [
    activeBuild(1, "Arrington", 4, plus(-40), 180),
    activeBuild(2, "Painter", 2, plus(-15), 180),
    activeBuild(3, "Seal Beach", 6, plus(-70), 180),
  ];
  for (let i = 0; i < 15; i++) props.push(blankProperty(4 + i));
  for (const p of props) await DB.upsert("properties", p);

  // ── Daily routines ──
  const routines = [
    { name: "Workout", icon: "💪", schedule: "daily", order: 1 },
    { name: "Morning dog walk", icon: "🐕", schedule: "daily", order: 2 },
    { name: "Evening dog walk", icon: "🌙", schedule: "daily", order: 3 },
    { name: "Review horizon", icon: "🗒️", schedule: "weekdays", order: 4 },
    { name: "Content post", icon: "📱", schedule: "weekdays", order: 5 },
  ];
  for (const r of routines) await DB.upsert("routines", { id: undefined, ...r });

  // ── A few starter tasks so Today/Horizon/Backlog aren't empty ──
  const tasks = [
    {
      title: "Call Arrington inspector re: framing sign-off",
      due: plus(1),
      status: "open",
      propertyId: "prop-arrington",
      priority: 2,
      tags: ["build"],
    },
    {
      title: "Order tile for Painter primary bath",
      due: plus(3),
      status: "open",
      propertyId: "prop-painter",
      priority: 1,
      tags: ["build", "material"],
    },
    {
      title: "Seal Beach final walkthrough checklist",
      due: plus(6),
      status: "open",
      propertyId: "prop-seal-beach",
      priority: 2,
      tags: ["build"],
    },
    {
      title: "Draft monthly portfolio scorecard",
      due: "",
      status: "open",
      propertyId: "",
      priority: 1,
      tags: ["ops"],
    },
  ];
  for (const t of tasks) await DB.upsert("tasks", { id: undefined, ...t });

  // ── Content calendar starters ──
  const content = [
    {
      title: "Arrington framing time-lapse",
      platform: "Instagram",
      status: "idea",
      date: plus(2),
      notes: "Reel — before/after of the open floor plan.",
      propertyId: "prop-arrington",
    },
    {
      title: "“What a permit clock is” explainer",
      platform: "TikTok",
      status: "scripted",
      date: plus(4),
      notes: "",
      propertyId: "",
    },
  ];
  for (const c of content) await DB.upsert("content", { id: undefined, ...c });

  // ── Property calendar events across the portfolio ──
  const events = [
    {
      type: "inspection",
      title: "Framing inspection",
      date: plus(1),
      propertyId: "prop-arrington",
      notes: "",
    },
    {
      type: "maintenance",
      title: "HVAC service",
      date: plus(9),
      propertyId: "prop-slot-4",
      notes: "",
    },
    {
      type: "lease-end",
      title: "Lease ends",
      date: plus(45),
      propertyId: "prop-slot-5",
      notes: "Decide renew vs. list.",
    },
  ];
  for (const e of events) await DB.upsert("events", { id: undefined, ...e });

  // ── Current month scorecard shell ──
  const ym = iso(today()).slice(0, 7);
  await DB.upsert("scorecards", {
    id: ym,
    month: ym,
    doors: 8,
    occupied: 6,
    grossRent: "",
    expenses: "",
    noi: "",
    notes: "",
  });

  localStorage.setItem("sshcc:seeded", "1");
}
