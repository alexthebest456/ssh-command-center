// ─────────────────────────────────────────────────────────────────────────────
//  DATA LAYER
//  One interface, two backends:
//    • Firestore  → real cross-device sync (used automatically when configured)
//    • localStorage → offline-first cache + fallback when Firebase isn't set up
//
//  The app never talks to Firebase directly. It only calls DB.subscribe /
//  DB.upsert / DB.remove / DB.getAll. This is what makes persistence reliable:
//  every write goes to localStorage immediately AND to Firestore when available.
// ─────────────────────────────────────────────────────────────────────────────

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const LS_PREFIX = "sshcc:";

// In-memory cache: { collectionName: Map<id, item> }
const cache = new Map();
// Subscribers: { collectionName: Set<callback> }
const subscribers = new Map();

let mode = "local"; // "local" | "firestore"
let fs = null; // firestore module bindings once loaded
let dbHandle = null;

function lsKey(col) {
  return LS_PREFIX + col;
}

function readLocal(col) {
  try {
    const raw = localStorage.getItem(lsKey(col));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(col, items) {
  try {
    localStorage.setItem(lsKey(col), JSON.stringify(items));
  } catch (e) {
    console.warn("localStorage write failed for", col, e);
  }
}

function ensureCache(col) {
  if (!cache.has(col)) {
    const map = new Map();
    for (const item of readLocal(col)) {
      if (item && item.id != null) map.set(item.id, item);
    }
    cache.set(col, map);
  }
  return cache.get(col);
}

function currentList(col) {
  return Array.from(ensureCache(col).values());
}

function notify(col) {
  const list = currentList(col).sort(sortByOrderThenCreated);
  const subs = subscribers.get(col);
  if (subs) for (const cb of subs) cb(list);
}

function sortByOrderThenCreated(a, b) {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

// ── Public API ──────────────────────────────────────────────────────────────

export const DB = {
  get mode() {
    return mode;
  },

  /** Try to bring up Firestore. Falls back to local silently on any failure. */
  async init() {
    if (!isFirebaseConfigured()) {
      mode = "local";
      return mode;
    }
    try {
      const appMod = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );
      const store = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const app = appMod.initializeApp(firebaseConfig);
      dbHandle = store.getFirestore(app);
      fs = store;
      mode = "firestore";
      return mode;
    } catch (e) {
      console.warn("Firebase init failed — staying on local storage.", e);
      mode = "local";
      return mode;
    }
  },

  /** Subscribe to a collection. Fires immediately with cached data, then on
   *  every change. Returns an unsubscribe function. */
  subscribe(col, cb) {
    if (!subscribers.has(col)) subscribers.set(col, new Set());
    subscribers.get(col).add(cb);

    // Immediate fire from cache so the UI paints instantly.
    cb(currentList(col).sort(sortByOrderThenCreated));

    // Wire up Firestore realtime listener once per collection.
    if (mode === "firestore" && !subscribers.get(col)._fsBound) {
      subscribers.get(col)._fsBound = true;
      try {
        const colRef = fs.collection(dbHandle, col);
        fs.onSnapshot(
          colRef,
          (snap) => {
            const map = ensureCache(col);
            map.clear();
            snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
            writeLocal(col, currentList(col));
            notify(col);
          },
          (err) => console.warn("onSnapshot error", col, err)
        );
      } catch (e) {
        console.warn("Failed to bind Firestore listener", col, e);
      }
    }

    return () => subscribers.get(col)?.delete(cb);
  },

  /** Synchronous read of the current cached list. */
  getAll(col) {
    return currentList(col).sort(sortByOrderThenCreated);
  },

  getOne(col, id) {
    return ensureCache(col).get(id) || null;
  },

  /** Create or update an item. Must carry an `id`. Write-through to both
   *  localStorage (always) and Firestore (when available). */
  async upsert(col, item) {
    if (!item.id) item.id = genId();
    if (item.createdAt == null) item.createdAt = Date.now();
    item.updatedAt = Date.now();

    const map = ensureCache(col);
    map.set(item.id, item);
    writeLocal(col, currentList(col));
    notify(col);

    if (mode === "firestore") {
      try {
        const { id, ...rest } = item;
        await fs.setDoc(fs.doc(dbHandle, col, id), rest, { merge: true });
      } catch (e) {
        console.warn("Firestore upsert failed (kept locally)", col, e);
      }
    }
    return item;
  },

  async remove(col, id) {
    const map = ensureCache(col);
    map.delete(id);
    writeLocal(col, currentList(col));
    notify(col);

    if (mode === "firestore") {
      try {
        await fs.deleteDoc(fs.doc(dbHandle, col, id));
      } catch (e) {
        console.warn("Firestore delete failed", col, e);
      }
    }
  },

  /** Bulk import (used for restoring a backup / seeding). */
  async importCollection(col, items) {
    for (const item of items) {
      await this.upsert(col, item);
    }
  },

  /** Export everything for a backup file. */
  exportAll(collections) {
    const out = { exportedAt: new Date().toISOString(), version: 1, data: {} };
    for (const col of collections) out.data[col] = this.getAll(col);
    return out;
  },

  hasAny(col) {
    return ensureCache(col).size > 0;
  },
};

export function genId() {
  // URL-safe, time-ordered-ish id without external deps.
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${t}${rand}`;
}
