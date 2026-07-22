// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACTOR ACADEMY — CSLB "B" (General Building) apprenticeship curriculum
//
//  Structured directly around the OFFICIAL CSLB examination blueprint, not
//  general knowledge. Getting a "B" license means passing TWO exams:
//     1. Law & Business  (every classification takes this)
//     2. Trade: General Building (B)
//
//  Each section below maps to a real CSLB content area, and the number of
//  lessons is weighted by that area's official share of the exam. Weights are
//  the current CSLB percentages (exams scheduled on/after Jan 1, 2025):
//
//    LAW & BUSINESS                         TRADE — GENERAL BUILDING (B)
//    ─ Business Org. & Licensing ... 13%    ─ Planning & Estimating ...... 15%
//    ─ Business Finances .......... 15%    ─ Framing & Structural ....... 20%
//    ─ Employment Requirements .... 20%    ─ Core Trades ................ 30%
//    ─ Insurance & Liens .......... 12%    ─ Finish Trades .............. 20%
//    ─ Contract Reqs. & Execution . 21%    ─ Safety ..................... 15%
//    ─ Public Works ............... 5%
//    ─ Safety ..................... 14%
//
//  Sources: CSLB Examination Study Guides (Law & Business; General Building B),
//  cslb.ca.gov/Resources/StudyGuides; California Business & Professions Code
//  §7000 et seq. (Contractors State License Law); California Building Standards
//  Code (Title 24); Cal/OSHA (Title 8). Verify current fees/figures at cslb.ca.gov.
//
//  This file is the SOURCE OF TRUTH. On boot, reconcileAcademy() rewrites the
//  `academy` collection to match it whenever CURRICULUM_VERSION changes, while
//  preserving completion status on any lesson whose id still exists.
// ─────────────────────────────────────────────────────────────────────────────

import { DB } from "./db.js";

// Bump this whenever the curriculum below changes so every device re-syncs.
export const CURRICULUM_VERSION = "cslb-official-v4";

// Verified facts about the two exams (from the official CSLB study guides).
export const EXAM_FACTS = "Both exams are closed-book, multiple-choice (4 options, one BEST answer). A calculator is provided; some questions require math. No penalty for guessing.";

// The two reference texts this program reads from. Each section below carries a
// `read` assignment pointing to the exact chapter(s) to open when you get there.
export const TEXTS = [
  { key: "ching", title: "Building Construction Illustrated", author: "Francis D.K. Ching (2014)", use: "Trade exam — construction methods & assemblies" },
  { key: "lawbook", title: "California Contractors License Law & Reference Book (2024)", author: "CSLB / LexisNexis", use: "Law & Business exam — the actual license law" },
];

// Each section = one official CSLB content area. `part` groups it under an exam;
// `weight` is that area's official % of the exam; `sec` sets roadmap order.
const SECTIONS = [
  // ══ EXAM 1 — LAW & BUSINESS ═══════════════════════════════════════════════
  {
    sec: 1, part: "L&B", weight: 13, title: "Business Organization & Licensing",
    read: "License Law & Reference Book (2024) — Section I Ch.1 Enforcement/Complaints (p.1), Section V Ch.7 DCA laws (p.71), and the Contractors License Law text in the Law Sections (p.69+).",
    lessons: [
      { key: "who-must-be-licensed",
        title: "Who must be licensed — and the price of skipping it",
        obj: "Know exactly when California law requires a contractor's license.",
        content: "Any person who contracts to build, alter, or repair a structure for $500 or more (labor + materials combined) must be licensed by the CSLB. Working unlicensed is a misdemeanor, and under B&P §7031 an unlicensed contractor cannot sue to collect payment — and can be forced to return everything already paid, even for good work. There is a narrow \"minor work\" exemption under $500, but splitting a job to stay under it is illegal.",
        cite: "B&P §7028, §7031, §7048" },
      { key: "b-scope",
        title: "The \"B\" scope — what a General Building contractor may take on",
        obj: "Understand what work the B classification legally covers vs. when you need a specialty (C) contractor.",
        content: "A General Building (B) contractor takes projects that require at least two unrelated trades, OR any project involving the framing/carpentry of a structure. On a single-trade job (e.g. only roofing, only electrical) the B generally cannot self-perform unless it's incidental to a larger B project — that work belongs to the matching C-specialty license. Know the difference: it's a heavily tested distinction.",
        cite: "B&P §7057; CSLB classification rules" },
      { key: "biz-structures-qualifier",
        title: "Business structures & the qualifier (RME / RMO)",
        obj: "Choose a legal structure and understand the qualifying individual's duties.",
        content: "A license is issued to a sole owner, partnership, corporation, or LLC. Every license needs a qualifying individual — either a Responsible Managing Owner (RMO) or Responsible Managing Employee (RME) — who actually exercises direction and control of construction operations. A qualifier must supervise the business, not just lend a license; one person can generally qualify no more than three firms.",
        cite: "B&P §7068, §7068.1" },
      { key: "getting-maintaining-license",
        title: "Getting & maintaining your license",
        obj: "Map the full path from application to an active license you keep in good standing.",
        content: "The path: application + fee, pass both exams, Live Scan fingerprinting, and post a $25,000 contractor bond (raised from $15,000 on Jan 1, 2023). Licenses renew every two years. You must report changes — business address, personnel, qualifier — to the CSLB, generally within 90 days, or risk the license going delinquent.",
        cite: "B&P §7065, §7071.6, §7083; CSLB fee schedule" },
    ],
  },
  {
    sec: 2, part: "L&B", weight: 15, title: "Business Finances",
    read: "License Law & Reference Book (2024) — Section III Ch.3: Financial Responsibility & Control (p.27), Financial Management (p.38), Operations Management (p.41).",
    lessons: [
      { key: "financial-statements",
        title: "Financial statements & recordkeeping",
        obj: "Read a balance sheet and P&L and keep books that survive an audit.",
        content: "The balance sheet (assets = liabilities + equity) is a snapshot; the profit & loss statement shows income vs. expense over a period. Contractors typically use job costing to track each project's true cost. Keep records — contracts, invoices, payroll — for the periods the state requires; sloppy books are how profitable contractors still go broke.",
        cite: "CSLB Law & Business Study Guide — Business Finances" },
      { key: "overhead-markup",
        title: "Overhead, profit & markup math",
        obj: "Price jobs so overhead is recovered and profit is real, not imaginary.",
        content: "Direct costs are job-specific (labor, materials, subs); overhead (indirect) is the cost of being in business (office, insurance, truck, admin) spread across all jobs. Markup ≠ margin: a 20% markup on cost is only a ~16.7% margin. Under-recovering overhead is the #1 way small contractors lose money while looking busy.",
        cite: "CSLB Law & Business Study Guide — Business Finances" },
      { key: "cash-flow-billing",
        title: "Cash flow & construction billing",
        obj: "Bill on a schedule of values and manage the cash gap between spend and payment.",
        content: "On larger jobs you bill via progress payments against a schedule of values, often with 5–10% retention held until completion. Because you pay labor and material before the owner pays you, cash flow — not profit — is what actually sinks contractors. Never let billed work fall behind completed work, and never over-bill (it's illegal on home improvement contracts).",
        cite: "CSLB Law & Business Study Guide — Business Finances" },
      { key: "taxes-obligations",
        title: "Taxes & business obligations",
        obj: "Identify the federal and California tax obligations of a construction business.",
        content: "You'll deal with federal and California income tax, payroll taxes (EDD), and use tax on materials. Workers get W-2s; true independent subs get 1099s — misclassifying to avoid payroll tax is a serious violation. Set money aside for taxes as you go; a surprise tax bill is a cash-flow event you can plan for.",
        cite: "CSLB Law & Business Study Guide; EDD; IRS" },
    ],
  },
  {
    sec: 3, part: "L&B", weight: 20, title: "Employment Requirements",
    read: "License Law & Reference Book (2024) — Section III Ch.3 Managing a Business (p.15) + workers'-comp/employment provisions in the Law Sections (p.69+).",
    lessons: [
      { key: "employee-vs-ic",
        title: "Employee vs. independent contractor (the ABC test)",
        obj: "Correctly classify workers under California's ABC test and avoid misclassification penalties.",
        content: "Since Dynamex / AB 5, California presumes a worker is an EMPLOYEE unless the hirer proves all three ABC prongs: (A) free from control, (B) work outside the hirer's usual business, (C) engaged in an independently established trade. For most crew labor, that's impossible to meet — so they're employees. Misclassification triggers back taxes, penalties, and workers'-comp liability.",
        cite: "Labor Code §2775 (AB 5); Dynamex" },
      { key: "wages-hours",
        title: "Wages, hours, overtime & breaks",
        obj: "Apply California's daily-overtime and break rules correctly.",
        content: "California pays overtime by the DAY: 1.5× after 8 hours and after the 6th consecutive workday; 2× after 12 hours and after 8 on the 7th day — stricter than federal weekly-only OT. Non-exempt employees get a 30-minute meal break before the 5th hour and paid 10-minute rest breaks per 4 hours. Wage statements must be itemized and final pay is due promptly at separation.",
        cite: "Labor Code §510, §226, §512; IWC wage orders" },
      { key: "workers-comp",
        title: "Workers' compensation — non-negotiable",
        obj: "Understand when workers' comp is mandatory and the cost of going without.",
        content: "If you have even one employee, California requires workers' compensation insurance — no exceptions. A B contractor with employees must carry a valid WC policy on file with the CSLB or the license is suspended. Operating without it exposes you to stop orders, steep penalties, and personal liability for a hurt worker. A sole owner with no employees may file an exemption.",
        cite: "Labor Code §3700; B&P §7125" },
      { key: "hiring-antidiscrimination",
        title: "Hiring, I-9 & anti-discrimination",
        obj: "Onboard employees legally and meet anti-discrimination obligations.",
        content: "Verify work eligibility with Form I-9, report every new hire to the EDD, and follow FEHA — California's anti-discrimination and harassment law, which requires harassment-prevention training for supervisors at employers of 5+. Discrimination and harassment rules apply to small contractors, not just big companies.",
        cite: "FEHA (Gov. Code §12900+); EDD new-hire reporting; USCIS I-9" },
      { key: "payroll-taxes",
        title: "Payroll taxes & withholding",
        obj: "Identify the payroll taxes you must withhold and remit as an employer.",
        content: "As an employer you withhold and remit FICA (Social Security + Medicare) and income tax, and pay employer FUTA/SUTA and California EDD contributions (UI, ETT, SDI). Deposits follow a schedule based on your payroll size. Falling behind on payroll-tax deposits carries some of the harshest penalties in tax law — this is not the bill to defer.",
        cite: "EDD (DE 44); IRS Circular E" },
      { key: "labor-law-posting",
        title: "Labor-law compliance & required postings",
        obj: "Meet posting requirements and know how wage claims are handled.",
        content: "Employers must display required state and federal workplace postings (minimum wage, safety, workers' comp, etc.) where employees can see them. Wage disputes go to the Labor Commissioner (DLSE); losing a wage claim can mean back wages plus penalties. Compliance here is cheap; the violations are not.",
        cite: "DLSE; Labor Code posting requirements" },
    ],
  },
  {
    sec: 4, part: "L&B", weight: 12, title: "Insurance & Liens",
    read: "License Law & Reference Book (2024) — Section III: California Mechanics Liens & Stop Notices (p.50), Mechanics-Lien glossary (p.55); bond provisions (B&P §7071.x) in the Law Sections.",
    lessons: [
      { key: "contractor-bonds",
        title: "Contractor bonds — what they actually protect",
        obj: "Distinguish the license bond, qualifier bond, and disciplinary bond and what each covers.",
        content: "The $25,000 contractor's license bond protects the public — homeowners, employees, suppliers — NOT you; if a claim is paid, you must repay the surety. An RMO/RME who isn't a majority owner also needs a bond of qualifying individual. A separate disciplinary bond can be required after a CSLB violation. A bond is not insurance and doesn't cover your losses.",
        cite: "B&P §7071.6, §7071.9" },
      { key: "insurance-types",
        title: "Insurance every builder should carry",
        obj: "Match the right insurance product to each construction risk.",
        content: "General liability covers third-party bodily injury and property damage; workers' comp covers your employees; commercial auto covers your vehicles; builder's risk (course-of-construction) covers the project itself while being built. Owners and GCs routinely require certificates of insurance naming them as additional insured before you set foot on site.",
        cite: "CSLB Law & Business Study Guide — Insurance" },
      { key: "mechanics-liens",
        title: "Mechanics liens & the preliminary notice",
        obj: "Preserve lien rights with correct notices and deadlines.",
        content: "California's mechanics lien is a constitutional right that lets unpaid contractors and suppliers claim the improved property. To preserve it, serve a Preliminary Notice (the \"20-day notice\") within 20 days of first furnishing labor/materials. A direct contractor generally records the lien within 90 days of completion (60 days if a Notice of Completion is recorded), then must sue to foreclose within 90 days of recording.",
        cite: "Civil Code §8200+, §8412, §8414, §8460" },
      { key: "stop-notices-payment-bonds",
        title: "Stop payment notices & payment bonds",
        obj: "Use the right collection remedy on private vs. public projects.",
        content: "Besides a lien, an unpaid party can serve a stop payment notice to freeze undisbursed construction funds. On public works you can't lien public property — instead you look to the payment bond the prime contractor is required to provide. Knowing which remedy applies to which project type is frequently tested.",
        cite: "Civil Code §8500+ (stop notices); §9000+ (public works bonds)" },
    ],
  },
  {
    sec: 5, part: "L&B", weight: 21, title: "Contract Requirements & Execution",
    read: "License Law & Reference Book (2024) — Section II Home Improvement (p.7): HI Contract Requirements (p.11) & Joint Control Agreements (p.14). Highest-weight L&B area — read it twice.",
    lessons: [
      { key: "contract-essentials",
        title: "Contract essentials & required elements",
        obj: "Build a contract that meets California's mandatory content rules.",
        content: "A home improvement contract must be in writing and signed before work begins, and must contain the price, a payment schedule, a description of the work, start/completion approximations, and specific state-required notices. Missing elements can make the contract unenforceable and expose you to discipline — the form of the contract is regulated, not just the deal.",
        cite: "B&P §7159" },
      { key: "home-improvement-contracts",
        title: "Home improvement contracts & down-payment limits",
        obj: "Structure payments legally on residential remodel work.",
        content: "On a home improvement contract the down payment cannot exceed $1,000 or 10% of the contract price, whichever is LESS. Progress payments can never run ahead of the value of work actually performed and materials delivered. These consumer-protection limits are strict and among the most-tested rules on the exam.",
        cite: "B&P §7159.5" },
      { key: "right-to-cancel-disclosures",
        title: "Right to cancel & required disclosures",
        obj: "Give consumers their cancellation rights and mandatory CSLB disclosures.",
        content: "Home improvement buyers get a 3-day right to cancel (5 days for buyers 65+). Contracts must carry required notices, including the mechanics-lien warning and the CSLB statement that contractors must be licensed and complaints can be filed with the board. Skipping the notice of cancellation is a classic violation.",
        cite: "B&P §7159; Civil Code §1689.5+" },
      { key: "change-orders",
        title: "Change orders & extras",
        obj: "Document scope changes so you get paid for them.",
        content: "Any change to scope or price should be a written, signed change order before the extra work proceeds. Verbal \"just add it\" agreements are how contractors do unpaid work and end up in disputes. Change orders protect both cash flow and the license — undocumented over-billing is a violation.",
        cite: "B&P §7159 (change-order requirements)" },
      { key: "breach-disputes",
        title: "Breach, disputes & CSLB complaints",
        obj: "Know how construction disputes are resolved and what CSLB can do.",
        content: "Disputes may go through negotiation, mediation, arbitration, small claims, or civil court. The CSLB investigates consumer complaints and can discipline a license (citation, suspension, revocation) and may offer arbitration for smaller claims. Understanding the complaint pathway helps you resolve problems before they reach the board.",
        cite: "B&P §7090+; CSLB complaint process" },
      { key: "warranties-closeout",
        title: "Warranties, statutes of limitation & closeout",
        obj: "Understand your post-completion liability window and how to close a job.",
        content: "Beyond any express warranty, California implies workmanship standards. Claims for patent (obvious) defects generally run 4 years, and latent (hidden) defects up to 10 years from substantial completion. Recording a Notice of Completion starts key lien clocks and signals the job is done — proper closeout limits both liability and payment risk.",
        cite: "Code of Civil Procedure §337.1, §337.15; Civil Code §8182" },
    ],
  },
  {
    sec: 6, part: "L&B", weight: 5, title: "Public Works",
    read: "License Law & Reference Book (2024) — Section III Bidding on Government Contracts (p.80) + prevailing-wage/public-works provisions in the Law Sections (Labor Code §1720+, §1771, §1777.5). Small section (~5%) — don't over-invest.",
    lessons: [
      { key: "prevailing-wage-dir",
        title: "Prevailing wage & DIR registration",
        obj: "Meet the extra rules that attach to public works.",
        content: "On public works (government-funded construction) you must pay state prevailing wages, register with the Department of Industrial Relations (DIR), and file certified payroll records electronically (eCPR). These requirements are on top of everything a private job requires — bidding public work without them is a costly mistake.",
        cite: "Labor Code §1720+, §1725.5, §1771; DIR" },
      { key: "public-works-compliance",
        title: "Public works compliance & apprenticeship",
        obj: "Satisfy apprenticeship and enforcement rules on public projects.",
        content: "Public works often require hiring registered apprentices at set ratios and are enforced by the Labor Commissioner, with penalties and possible debarment for violations. Public-works compliance is a specialized discipline — know that it exists and when it's triggered before you chase government contracts.",
        cite: "Labor Code §1777.5; DIR enforcement" },
    ],
  },
  {
    sec: 7, part: "L&B", weight: 14, title: "Safety (Law & Business)",
    read: "License Law & Reference Book (2024) — Section IV Construction Standards & Safety Regulations: USA dig-alert (p.61), Wells (p.67); + Cal/OSHA Title 8 §3203 (IIPP).",
    lessons: [
      { key: "iipp",
        title: "Injury & Illness Prevention Program (IIPP)",
        obj: "Build the written safety program California requires of every employer.",
        content: "Cal/OSHA requires every California employer to have a written Injury & Illness Prevention Program under Title 8 §3203. It must include eight elements: responsibility, compliance, communication, hazard assessment, accident investigation, hazard correction, training, and recordkeeping. No IIPP is one of the most-cited violations on jobsites.",
        cite: "Cal/OSHA Title 8 §3203" },
      { key: "calosha-recordkeeping",
        title: "Cal/OSHA basics & recordkeeping",
        obj: "Meet reporting and record obligations under Cal/OSHA.",
        content: "California runs its own OSHA (Cal/OSHA) under Title 8. Employers log recordable injuries (Form 300) and must report serious injuries or fatalities to Cal/OSHA within 8 hours. Cal/OSHA can inspect without notice and issue citations; knowing your reporting duties keeps a bad day from becoming a worse one.",
        cite: "Cal/OSHA Title 8; §342 (reporting)" },
      { key: "hazcom-training",
        title: "Hazard communication & safety training",
        obj: "Inform and train workers about jobsite chemical and physical hazards.",
        content: "The Hazard Communication standard requires labeling hazardous materials, keeping Safety Data Sheets (SDS) accessible, and training employees on the hazards they face. Construction employers also maintain a Code of Safe Practices. Training isn't a formality — it's a required, documented part of your safety program.",
        cite: "Cal/OSHA Title 8 §5194 (HazCom); §1509" },
      { key: "safety-programs",
        title: "Required safety programs (heat, fall, respiratory)",
        obj: "Recognize the specific safety programs a builder must run.",
        content: "California mandates topic-specific programs: a Heat Illness Prevention plan for outdoor work (§3395, with water/shade/rest triggers), fall protection, respiratory protection where dust/silica is present, and use of a \"competent person\" to identify hazards. Match the program to the hazard on each job.",
        cite: "Cal/OSHA Title 8 §3395; §1670+ (fall); §5144 (respiratory)" },
    ],
  },

  // ══ EXAM 2 — TRADE: GENERAL BUILDING (B) ══════════════════════════════════
  {
    sec: 8, part: "Trade", weight: 15, title: "Planning & Estimating",
    read: "Ching, Building Construction Illustrated — Ch. 1 The Building Site & Ch. 2 The Building (loads, structural overview). Pair with any plan-reading primer for the drawing-set questions.",
    topics: ["Scope of work & code compliance", "Design & construction error identification", "Shop drawings, plans & specifications", "Field inspection performance", "Project coordination", "Cost estimation — materials, equipment & labor"],
    lessons: [
      { key: "reading-plans",
        title: "Reading plans & specifications",
        obj: "Interpret a construction drawing set and the specs that govern it.",
        content: "A drawing set moves from site plan → floor plans → elevations → sections → details, with schedules for doors, windows, and finishes. Everything is drawn to scale and uses standard symbols. Specifications describe quality and materials the drawings can't; where they conflict, know the precedence rules. Fluent plan-reading underlies almost every trade question.",
        cite: "CSLB General Building (B) Study Guide — Planning & Estimating" },
      { key: "codes-permits",
        title: "Codes, permits & the AHJ",
        obj: "Identify which codes govern residential/commercial work and how permits and inspections flow.",
        content: "California building work is governed by the California Building Standards Code (Title 24) — the CBC for commercial and the CRC for one- and two-family dwellings — plus local amendments. The Authority Having Jurisdiction (local building department) issues permits and inspects at set milestones (foundation, rough, final). Building without required permits and inspections is both illegal and a liability.",
        cite: "Cal. Building Standards Code, Title 24 Parts 2 & 2.5" },
      { key: "takeoff-estimating",
        title: "Quantity takeoff & estimating",
        obj: "Turn a set of plans into an accurate materials-and-labor estimate.",
        content: "Estimating starts with a quantity takeoff — counting and measuring every material off the plans — then applying waste factors, unit prices, and labor productivity rates. Underestimating quantities or labor is what turns a \"profitable\" bid into a loss. Build estimates systematically, trade by trade, so nothing is missed.",
        cite: "CSLB General Building (B) Study Guide — Planning & Estimating" },
      { key: "scheduling-coordination",
        title: "Scheduling & trade coordination",
        obj: "Sequence trades and manage submittals so the job runs in the right order.",
        content: "A realistic schedule sequences trades so each has what it needs (you don't drywall before rough inspections pass). Tools include the critical path, submittals/shop drawings for approval, and RFIs to resolve unclear plans. As the B/GC you coordinate the subs — poor sequencing costs more than almost any material overrun.",
        cite: "CSLB General Building (B) Study Guide — Planning & Estimating" },
    ],
  },
  {
    sec: 9, part: "Trade", weight: 20, title: "Framing & Structural Components",
    read: "Ching, Building Construction Illustrated — Ch. 3 Foundation Systems, Ch. 4 Floor Systems, Ch. 5 Wall Systems, Ch. 6 Roof Systems. The visual core of the trade exam.",
    topics: ["Subfloor & wall framing", "Roof framing", "Seismic hardware requirements & installation", "Siding & stucco", "Decks & stairs"],
    lessons: [
      { key: "foundations-concrete",
        title: "Foundations & concrete",
        obj: "Understand footings, stem walls, slabs, and their reinforcement.",
        content: "Foundations transfer building loads to the soil: continuous footings and stem walls, or slab-on-grade. Reinforcement (rebar) and embedded anchor bolts tie the structure down; concrete must cure to reach strength. Correct footing depth, rebar placement, and anchor-bolt spacing are code-driven and inspected before any framing goes up.",
        cite: "CRC/CBC Ch. 18–19; CSLB (B) Study Guide — Framing" },
      { key: "floor-framing",
        title: "Floor framing",
        obj: "Frame a floor system with correctly sized and spaced members.",
        content: "A floor system spans from girders/beams to joists carrying the subfloor. Member size and spacing come from span tables based on load and species. Subfloor sheathing is glued and nailed on a schedule to act as a diaphragm. Over-spanning joists or under-nailing sheathing shows up as bounce, squeaks, and failed inspections.",
        cite: "CRC Ch. 5 (floors); span tables" },
      { key: "wall-framing",
        title: "Wall framing",
        obj: "Frame load-bearing and non-bearing walls with a continuous load path.",
        content: "Walls are studs between top and bottom plates, with headers over openings sized to the span and load above. Standard stud spacing is 16\" o.c. (sometimes 24\"). The goal is a continuous load path — loads travel from roof to walls to foundation without a weak link. Headers and their supporting trimmers are a favorite exam topic.",
        cite: "CRC Ch. 6 (walls)" },
      { key: "roof-framing",
        title: "Roof framing",
        obj: "Distinguish stick-framed rafters from trusses and frame to pitch.",
        content: "Roofs are framed with rafters (cut on site, ridge/hip/valley) or engineered trusses (delivered, not to be field-modified). Pitch is rise over run; sheathing ties the assembly together and provides the diaphragm. Cutting or notching a truss without an engineer's approval is a serious structural error.",
        cite: "CRC Ch. 8 (roof-ceiling construction)" },
      { key: "seismic-lateral",
        title: "Seismic & lateral systems",
        obj: "Build the shear walls and hardware that resist California's lateral loads.",
        content: "In seismic California, gravity framing isn't enough — you need a lateral system: shear walls (sheathing nailed on a tight schedule), hold-downs anchoring walls to the foundation, and metal straps/hardware tying the load path together. Correct nailing spacing and hold-down installation are what actually keep a building standing in a quake, and they're inspected closely.",
        cite: "CBC/CRC lateral provisions; ASCE 7" },
      { key: "stairs-decks-exterior",
        title: "Stairs, decks & exterior structure",
        obj: "Meet the dimensional and attachment rules for stairs, guards, and decks.",
        content: "Stairs are code-controlled: max rise, min run, and guards/handrails at required heights. Exterior decks must attach with a properly flashed ledger and hardware — California tightened deck rules after fatal balcony collapses (SB 721/SB 326 inspections for multifamily). Siding and stucco complete the weather envelope. These dimensions are precise and frequently tested.",
        cite: "CRC Ch. 3 (stairs/guards); SB 721 / SB 326" },
    ],
  },
  {
    sec: 10, part: "Trade", weight: 30, title: "Core Trades",
    read: "Ching, Building Construction Illustrated — Ch. 1 The Building Site (site/earthwork), Ch. 7 Moisture & Thermal Protection, Ch. 11 Mechanical & Electrical Systems. Biggest section (30%) — spend the most time here.",
    topics: ["Plumbing", "Electrical", "HVAC", "Concrete", "Earthwork & surveying", "Insulation, acoustical & weatherproofing", "Roofing"],
    lessons: [
      { key: "site-earthwork",
        title: "Site work, grading & drainage",
        obj: "Prepare a site with proper grading, compaction, and drainage.",
        content: "Site work sets up everything: rough and fine grading, soil compaction to spec, positive drainage away from the building, and erosion control. Larger sites need a Storm Water Pollution Prevention Plan (SWPPP). Poor drainage and uncompacted fill cause foundation failures years later — get the dirt right first.",
        cite: "CSLB (B) Study Guide — Core Trades; CBC Ch. 18" },
      { key: "concrete-flatwork",
        title: "Concrete flatwork & reinforcement",
        obj: "Place and finish concrete flatwork with correct reinforcement and joints.",
        content: "Flatwork (slabs, walks, driveways) needs the right mix and slump, rebar or mesh at proper placement, and control/expansion joints to manage inevitable cracking. Finish and cure control surface quality and strength. Skipping joints or floating rebar to the bottom are common, visible failures.",
        cite: "CSLB (B) Study Guide — Core Trades; ACI" },
      { key: "electrical-roughin",
        title: "Electrical rough-in fundamentals",
        obj: "Understand residential electrical scope and when a C-10 is required.",
        content: "Electrical work follows the California Electrical Code (Title 24 Part 3): service and panel, branch circuits, and required GFCI/AFCI protection in specified locations. As a B you coordinate electrical, but significant electrical work is C-10 specialty scope — know where the line is and pull the right sub. Understand load basics and inspection points.",
        cite: "Cal. Electrical Code (Title 24 Part 3); B classification limits" },
      { key: "plumbing-systems",
        title: "Plumbing systems",
        obj: "Understand supply, drain-waste-vent, and the code that governs them.",
        content: "Plumbing splits into pressurized water supply and the drain-waste-vent (DWV) system that carries waste by gravity and vents to prevent siphoning traps. The California Plumbing Code sets pipe sizing by fixture units, venting, and backflow protection. Improper venting and undersized drains cause slow, smelly, code-failing systems.",
        cite: "Cal. Plumbing Code (Title 24 Part 5)" },
      { key: "hvac-mechanical",
        title: "HVAC & mechanical",
        obj: "Grasp heating/cooling sizing, ducting, and Title 24 energy requirements.",
        content: "HVAC systems are sized to the building's load (not guessed), ducted for correct airflow, and must meet California's Title 24 energy standards and ventilation minimums. Oversized or leaky-duct systems waste energy and fail Title 24 testing (e.g. duct-leakage and HERS verification). The California Mechanical Code governs the install.",
        cite: "Cal. Mechanical Code (Title 24 Part 4); Title 24 Part 6" },
      { key: "insulation-weatherproofing",
        title: "Insulation & weatherproofing",
        obj: "Meet energy and moisture requirements with insulation and air/water barriers.",
        content: "Insulation is specified by R-value per California's Title 24 Part 6 energy code, and a continuous air barrier limits leakage. On the exterior, a weather-resistive barrier plus correct flashing keeps water out. Energy compliance is not optional in California — it's inspected and increasingly tested (HERS).",
        cite: "Cal. Energy Code (Title 24 Part 6)" },
      { key: "roofing-systems",
        title: "Roofing systems",
        obj: "Assemble a code-compliant, weather-tight roof.",
        content: "A roof is an assembly: deck, underlayment, flashing at every penetration and transition, and the finish roofing rated for the slope. Most California areas require Class A fire-rated assemblies. Roofs leak at flashings, not fields — detailing valleys, walls, and penetrations correctly is the whole game.",
        cite: "CRC Ch. 9 (roof assemblies); local fire zone rules" },
      { key: "building-envelope",
        title: "Building envelope & moisture control",
        obj: "Integrate the layers that keep water and air out of the structure.",
        content: "The envelope is a system of layered, shingled defenses: flashing over weather-resistive barrier over sheathing, all lapped so water sheds outward. Most construction-defect litigation in California is moisture intrusion at windows, decks, and wall penetrations. Get the water-management details right and you avoid the most expensive callbacks in the business.",
        cite: "CRC Ch. 7 (wall covering); CSLB (B) Study Guide" },
    ],
  },
  {
    sec: 11, part: "Trade", weight: 20, title: "Finish Trades",
    read: "Ching, Building Construction Illustrated — Ch. 8 Doors & Windows, Ch. 10 Finish Work; exterior cladding & stucco in Ch. 7 Moisture & Thermal Protection.",
    topics: ["Painting, staining, coating & interior wall covering", "Tile & stone", "Floor covering", "Cabinetry & millwork", "Plaster, drywall & ceilings", "Windows, skylights & doors", "Landscaping"],
    lessons: [
      { key: "drywall-interior",
        title: "Drywall & interior wall systems",
        obj: "Hang and finish drywall, including fire-rated assemblies.",
        content: "Drywall is hung, fastened on schedule, then taped and finished to a level of quality. Fire-rated assemblies (garage/dwelling separation, party walls) use specific board and details you cannot substitute. Corner bead, screw spacing, and joint finishing separate a clean job from a callback.",
        cite: "CRC Ch. 7; fire-separation requirements" },
      { key: "doors-windows",
        title: "Doors, windows & hardware",
        obj: "Install openings that are weather-tight, egress-compliant, and accessible.",
        content: "Windows and doors must be flashed and integrated into the weather barrier, and bedrooms need egress-compliant openings. Commercial and accessible work adds ADA/CBC clearances and hardware rules. A poorly flashed window is a future leak; a wrong egress dimension is a failed final.",
        cite: "CRC Ch. 3 (egress); CBC Ch. 11 (accessibility)" },
      { key: "interior-finishes",
        title: "Tile, flooring, cabinetry & finish carpentry",
        obj: "Coordinate the interior finish trades to a quality standard.",
        content: "Interior finishes — tile (with proper substrate/waterproofing in wet areas), flooring, cabinetry, countertops, and trim — are where clients judge the whole project. As the B you sequence and hold quality across these subs. Wet-area waterproofing behind tile is the hidden detail that prevents expensive failures.",
        cite: "CSLB (B) Study Guide — Finish Trades" },
      { key: "paint-coatings",
        title: "Painting & coatings",
        obj: "Prep and apply coatings correctly and within VOC rules.",
        content: "Paint is 80% prep: clean, sound, primed surfaces make the finish last; skipping prep guarantees peeling. Product and application must suit the substrate and exposure, and California limits VOC content of coatings. A coating failure is almost always a prep or product-selection failure.",
        cite: "CSLB (B) Study Guide; CARB VOC limits" },
      { key: "thermal-acoustical",
        title: "Thermal & acoustical finishes",
        obj: "Finish insulation and sound assemblies to meet code and comfort.",
        content: "Beyond energy insulation, interior work includes acoustical assemblies — sound-rated (STC) walls and floors, especially between dwelling units. California sets sound-transmission minimums for multifamily separations. Meeting them is a matter of assembly detail, not just adding batts.",
        cite: "CBC Ch. 12 (sound transmission)" },
      { key: "exterior-finishes",
        title: "Exterior finishes — stucco & siding",
        obj: "Apply exterior cladding as a weather-managing system.",
        content: "Traditional stucco is a three-coat system (scratch, brown, finish) over lath and two layers of weather-resistive barrier; siding laps to shed water. Exterior finish is the building's raincoat — the WRB, lath, and flashing behind it matter as much as the visible surface. Cracked or improperly lapped cladding invites the moisture problems that dominate defect claims.",
        cite: "CRC Ch. 7 (exterior wall covering)" },
    ],
  },
  {
    sec: 12, part: "Trade", weight: 15, title: "Safety (Trade)",
    read: "Cal/OSHA Title 8, Construction Safety Orders (§1500+) — Ching is a methods text, not a safety code, so use Cal/OSHA directly for this section.",
    topics: ["Personnel safety", "Transportation & traffic control", "Environmental safety"],
    lessons: [
      { key: "fall-protection",
        title: "Fall protection & elevated work",
        obj: "Apply Cal/OSHA fall-protection rules on roofs, scaffolds, and ladders.",
        content: "Falls are the #1 killer in construction. In California construction, fall protection is generally required at 6 feet — via guardrails, personal fall-arrest systems, or safety nets — and ladders and scaffolds have their own strict setup and inspection rules. Elevated work without protection is both the most common serious citation and the most preventable death.",
        cite: "Cal/OSHA Title 8 §1670+; §1620+ (ladders/scaffolds)" },
      { key: "excavation-trench",
        title: "Excavation & trench safety",
        obj: "Protect workers in excavations with sloping, shoring, or shielding.",
        content: "Trenches 5 feet or deeper generally require a protective system — sloping, shoring, or a trench shield — designed for the soil, and a competent person must inspect them. Cave-ins bury and kill fast; a cubic yard of soil weighs over a ton. California also requires a permit for trenches 5 ft+ that workers enter.",
        cite: "Cal/OSHA Title 8 §1541+; excavation permit" },
      { key: "tool-electrical-fire",
        title: "Tool, electrical & fire safety",
        obj: "Control power-tool, electrical, and fire hazards on site.",
        content: "Jobsite power requires GFCI protection, lockout/tagout before servicing energized equipment, and correct PPE for the tool and task. Keep fire extinguishers accessible, manage hot work and flammables, and guard tools properly. Most tool injuries trace to bypassed guards and missing PPE — the cheap protections.",
        cite: "Cal/OSHA Title 8 §1500+ (GFCI); §3314 (LOTO)" },
      { key: "site-public-protection",
        title: "Site protection, dust & the public",
        obj: "Protect the public and control silica/dust around the work.",
        content: "You must protect the public with barricades, signage, and traffic control around the work zone, and control respirable crystalline silica from cutting concrete, masonry, and tile — a Cal/OSHA standard with an exposure control plan. Good housekeeping prevents both injuries and citations. The public's safety around your site is your legal responsibility.",
        cite: "Cal/OSHA Title 8 §1532.3 (silica); traffic control" },
    ],
  },
];

// ── Vocabulary — official terms worth memorizing, saved for spaced review ─────
export const ACADEMY_VOCAB = [
  { term: "B&P §7031", def: "Bars an unlicensed contractor from suing for payment and lets an owner recover all money paid — the harshest penalty for working unlicensed." },
  { term: "Qualifier (RMO / RME)", def: "The Responsible Managing Owner or Employee who exercises direction and control of a licensee's construction operations. Required on every license." },
  { term: "Contractor's license bond", def: "$25,000 surety bond (since 1/1/2023) that protects the public, not the contractor; paid claims must be repaid to the surety." },
  { term: "ABC test", def: "California's test (AB 5) presuming a worker is an employee unless all three prongs — control, outside usual business, independent trade — are met." },
  { term: "Preliminary (20-day) notice", def: "Notice served within 20 days of first furnishing labor/materials to preserve mechanics-lien and stop-notice rights." },
  { term: "Mechanics lien", def: "A claim against improved property by an unpaid contractor/supplier; a direct contractor records within 90 days of completion (60 after a Notice of Completion)." },
  { term: "Home improvement down-payment cap", def: "The lesser of $1,000 or 10% of the contract price — the maximum legal down payment on a home improvement contract (B&P §7159.5)." },
  { term: "3-day right to cancel", def: "A home improvement buyer's right to cancel within 3 business days (5 days for buyers 65+)." },
  { term: "IIPP", def: "Injury & Illness Prevention Program — the written safety program Cal/OSHA (T8 §3203) requires of every California employer, with 8 mandatory elements." },
  { term: "Prevailing wage", def: "State-set wage that must be paid on public works, along with DIR registration and certified payroll." },
  { term: "Title 24", def: "The California Building Standards Code — includes the CBC, CRC, electrical, plumbing, mechanical, and energy (Part 6) codes." },
  { term: "AHJ", def: "Authority Having Jurisdiction — the local building department that issues permits and performs inspections." },
  { term: "Load path", def: "The continuous route by which loads travel from roof through walls to the foundation; a core framing concept." },
  { term: "Shear wall / hold-down", def: "The lateral-resisting wall (nailed sheathing) and the anchor tying it to the foundation — what resists seismic and wind loads." },
  { term: "DWV", def: "Drain-Waste-Vent — the gravity drainage and venting side of a plumbing system, opposite the pressurized supply side." },
  { term: "Weather-resistive barrier (WRB)", def: "The layered, flashed water-management barrier behind exterior cladding; failures here drive most moisture-intrusion defect claims." },
  { term: "Silica standard", def: "Cal/OSHA T8 §1532.3 — requires an exposure control plan for respirable crystalline silica from cutting concrete, masonry, and tile." },
  { term: "6-foot fall rule", def: "In California construction, fall protection is generally required at 6 feet of elevation." },
  { term: "5-foot trench rule", def: "Excavations 5 ft or deeper generally require a protective system (sloping, shoring, or shield) and a competent-person inspection." },
  { term: "Statute of limitations — defects", def: "Patent (obvious) construction defects: ~4 years; latent (hidden): up to 10 years from substantial completion (CCP §337.1 / §337.15)." },
];

// Flatten SECTIONS into the lesson objects the app renders, assigning stable
// ids, a running order, and a week number across a ~26-week (6-month) program.
export function buildCurriculum() {
  const total = SECTIONS.reduce((n, s) => n + s.lessons.length, 0);
  const lessons = [];
  let order = 0;
  for (const s of SECTIONS) {
    const sectionLabel = `${s.part} · ${s.title} · ${s.weight}%`;
    let n = 0;
    for (const l of s.lessons) {
      order++; n++;
      lessons.push({
        id: `acad-${s.sec}-${l.key}`,
        sec: s.sec,
        order: n,
        section: sectionLabel,
        part: s.part,
        weight: s.weight,
        read: s.read || "",
        topics: s.topics || [],
        wk: Math.max(1, Math.round((order / total) * 26)),
        title: l.title,
        objective: l.obj,
        content: l.content,
        cite: l.cite,
        status: "todo",
      });
    }
  }
  return lessons;
}

// Rewrite the academy + vocab collections to match this file whenever the
// version marker changes. Completion status is preserved for any lesson whose
// id still exists, so re-syncing never erases the user's progress.
export async function reconcileAcademy() {
  const marker = "meta/academyCurriculum";
  const existing = DB.getAll("academy");
  const current = (DB.getAll("meta").find((m) => m.id === "academyCurriculum") || {}).version;

  // Already on this version AND the lessons are present → nothing to do.
  if (current === CURRICULUM_VERSION && existing.length) return;

  // Preserve completion by id from whatever is currently stored.
  const doneById = {};
  for (const l of existing) if (l.status === "done") doneById[l.id] = l.doneAt || Date.now();

  const fresh = buildCurriculum();
  const freshIds = new Set(fresh.map((l) => l.id));

  // Remove stale lessons that are no longer part of the curriculum.
  for (const l of existing) if (!freshIds.has(l.id)) await DB.remove("academy", l.id);

  // Upsert the new curriculum, carrying forward any completed status.
  for (const l of fresh) {
    const doneAt = doneById[l.id];
    await DB.upsert("academy", doneAt ? { ...l, status: "done", doneAt } : l);
  }

  // Refresh the official vocabulary set (stable ids so it de-dupes cleanly).
  const vocabIds = new Set();
  for (let i = 0; i < ACADEMY_VOCAB.length; i++) {
    const v = ACADEMY_VOCAB[i];
    const id = "voc-" + v.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    vocabIds.add(id);
    await DB.upsert("vocab", { id, term: v.term, def: v.def, order: i + 1 });
  }
  // Drop any old auto-generated vocab that isn't in the official set.
  for (const v of DB.getAll("vocab")) if (!vocabIds.has(v.id)) await DB.remove("vocab", v.id);

  await DB.upsert("meta", { id: "academyCurriculum", version: CURRICULUM_VERSION, updatedAt: Date.now() });
}
