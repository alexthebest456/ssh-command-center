# SSH Command Center

A personal operations dashboard for the SSH real-estate business — active builds,
a 2-week task horizon, content calendar, portfolio scorecard, weekly review & pace,
daily routines, job-site photos, and a full **property calendar** across the whole
portfolio.

Built as an installable **PWA** (works on your phone home screen + desktop),
hosted free on **GitHub Pages**, with **Firebase Firestore** for real cross-device
persistence. No build step, no framework — just static files.

---

## What's inside

| # | Section | What it does |
|---|---------|--------------|
| 01 | **Today** | At-a-glance: due tasks, routines, permit clocks, upcoming events |
| 02 | **Capture** | Voice dictation + typed quick-capture, routed to task / backlog / content / event |
| 03 | **Content Calendar** | Social pipeline (idea → scripted → filmed → scheduled → posted) |
| 04 | **2-Week Horizon** | Everything due in the next 14 days, grouped by day |
| 05 | **Active Builds** | Permit-clock countdowns, stage tracking, job-site photo uploads |
| 06 | **Property Calendar** | Maintenance / lease-end / vacancy / inspection dates across all properties |
| 07 | **Backlog** | Unscheduled someday/maybe items |
| 08 | **Monthly Scorecard** | Doors, occupancy, gross rent, expenses, NOI, notes |
| 09 | **Weekly Review & Pace** | Planned vs. completed, pace %, forecast dates, wins/blockers |
| 10 | **Daily Routines** | Workout, dog walks, etc. — 7-day tracker + streaks |
| 11 | **Data & Sync** | Sync status, JSON backup/restore, manage all properties |

---

## Setup — three steps

### 1. Put it on GitHub Pages (permanent, free hosting)

The code is already in this repo. To publish it:

1. On GitHub, open this repo → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Pick the branch these files live on (e.g. `main`) and folder **`/ (root)`**. Save.
4. Wait ~1 minute. Your app is live at:
   **`https://alexthebest456.github.io/ssh-command-center/`**

That URL is what you open on your phone and desktop.

### 2. Install it as an app (PWA)

- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → menu → **Install app / Add to Home screen**.
- **Desktop (Chrome/Edge):** open the URL → click the **install icon** in the address bar.

It then launches full-screen like a native app and works offline.

### 3. Turn on cross-device sync (Firebase Firestore)

**Until you do this, the app fully works** — it just stores data in one browser
at a time. To sync your phone and desktop to the same data:

1. Go to <https://console.firebase.google.com> → **Add project** (any name).
2. In the project: **Build → Firestore Database → Create database** →
   start in **test mode** (fine for personal use; lock it down later — see below).
3. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app.
   Firebase shows a `firebaseConfig` object.
4. Copy those values into **[`firebase-config.js`](firebase-config.js)**, replacing the
   `PASTE_…` placeholders. Commit and push.

The next time the app loads it detects the real config, uploads everything already
saved locally, and begins syncing live across every device. The sidebar dot turns
**green** when sync is active.

> **Locking down Firestore (recommended once it works).** Test mode allows open
> reads/writes for 30 days. For a private personal dashboard, the simplest hardening
> is to require sign-in (add Firebase Authentication) and set a rule like
> `allow read, write: if request.auth != null;`. Ask and this can be wired up.

---

## Seeding with your old data

If you have a backup JSON export from the previous dashboard:

1. Open the app → **11 · Data & Sync**.
2. Click **Import / restore** and choose the file.

It accepts either this app's export format (`{ data: { collection: [...] } }`) or a
flat `{ collection: [...] }` object. Import merges records by `id`. Use
**Export backup JSON** anytime to save a full snapshot.

The app ships seeded with the 3 active builds (Arrington, Painter, Seal Beach) plus
15 blank editable property slots — rename/fill them from **Data & Sync → All properties**.

---

## Job-site photos

Photos are resized client-side (max 1280px, JPEG) before saving so they stay well
under Firestore's 1 MB/document limit and sync cheaply. They're stored inline with
the build — no separate storage bucket to configure. Add them from **05 · Active
Builds → Add** on any build card (the phone camera opens directly).

---

## Future: DoorLoop auto-sync (not built yet)

DoorLoop exposes a REST API (`api.doorloop.com`, API-key auth) for leases, tenants,
and maintenance. The property calendar and scorecard were designed so a future
sync job can populate lease-end / vacancy / maintenance events automatically instead
of manual entry. This is scaffolded conceptually but intentionally **not** wired up
yet. Note: a browser can't safely hold a DoorLoop API key, so that integration would
run through a small serverless function (e.g. a Cloud Function) — a later step.

---

## Tech notes

- **No dependencies, no build.** Plain HTML/CSS/ES-modules. Firebase loads on demand
  from the gstatic CDN only when configured.
- **Offline-first data layer** ([`db.js`](db.js)): every write goes to `localStorage`
  immediately *and* to Firestore when available, so nothing is ever lost to a flaky
  connection. Firestore `onSnapshot` keeps devices live.
- **Fonts:** Space Grotesk + JetBrains Mono (Google Fonts).
- **Icons:** regenerate with `python3 scripts/gen_icons.py` (requires Pillow).

### Files

```
index.html            App shell + PWA meta
styles.css            Blueprint theme
app.js                Views, logic, voice capture, photos, calendar, backup
db.js                 Firestore ⇄ localStorage data layer
seed.js               First-run seed data (3 builds + 15 blank properties)
firebase-config.js    ← paste your Firebase config here
manifest.webmanifest  PWA manifest
service-worker.js     Offline app-shell caching
icons/                PWA / home-screen icons
```
