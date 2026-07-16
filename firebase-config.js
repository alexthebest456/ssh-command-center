// ─────────────────────────────────────────────────────────────────────────────
//  SSH COMMAND CENTER — FIREBASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
//  HOW TO TURN ON CROSS-DEVICE SYNC (phone + desktop share the same data):
//
//  1. Go to https://console.firebase.google.com and create a project.
//  2. In the project, open  Build ▸ Firestore Database  and click "Create
//     database". Choose "Start in test mode" for now (you can lock it down
//     later — see README).
//  3. Open  Project settings (gear icon) ▸ General ▸ "Your apps" ▸ Web (</>).
//     Register an app. Firebase shows you a config object that looks EXACTLY
//     like the one below.
//  4. Copy those values in over the placeholders below, save, commit, push.
//
//  Until you do that, the app still works perfectly — it just stores data in
//  this browser only (localStorage) instead of syncing across devices.
//  Nothing you enter is lost; when you paste a real config the app keeps
//  using local data and also begins syncing to Firestore.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Everything below decides whether the config above is "real" yet.
// Leave this as-is.
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === "string" && v.length > 0 && !v.startsWith("PASTE_")
  );
}
