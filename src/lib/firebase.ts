import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  update,
  serverTimestamp,
  enableLogging,
  goOffline,
  goOnline,
  onDisconnect,
  type Database,
} from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDGRe8PpRyfNJD1ga1yIqr6dzSGHaQHML0",
  authDomain: "whispers-2c228.firebaseapp.com",
  databaseURL: "https://whispers-2c228-default-rtdb.firebaseio.com",
  projectId: "whispers-2c228",
  storageBucket: "whispers-2c228.firebasestorage.app",
  messagingSenderId: "581859776452",
  appId: "1:581859776452:web:afc3670c66d3d6e24d3691",
  measurementId: "G-JSQ2YF0HSJ",
};

const isBrowser = typeof window !== "undefined";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let db: Database | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let persistenceEnabled = false;
let authReady: Promise<void> | null = null;

function initFirebase() {
  if (!isBrowser || app) return;
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  storage = getStorage(app);
  auth = getAuth(app);
  try {
    analytics = getAnalytics(app);
  } catch {
    // analytics may fail in SSR or restricted contexts
  }
  if (import.meta.env.DEV) {
    enableLogging(false);
  }
}

if (isBrowser) {
  initFirebase();
}

export async function enableOfflinePersistence() {
  if (!isBrowser || persistenceEnabled || !db) return;
  // RTDB keeps a local cache of synced data and reconciles when back online.
  persistenceEnabled = true;
}

export function getDb(): Database {
  if (!isBrowser) throw new Error("Firebase is only available in the browser");
  initFirebase();
  if (!db) throw new Error("Firebase database not initialized");
  return db;
}

export function getAuthInstance(): Auth {
  if (!isBrowser) throw new Error("Firebase is only available in the browser");
  initFirebase();
  if (!auth) throw new Error("Firebase auth not initialized");
  return auth;
}

export function ensureAuth(): Promise<void> {
  if (!isBrowser) return Promise.resolve();
  initFirebase();
  if (authReady) return authReady;
  authReady = new Promise((resolve) => {
    const a = getAuthInstance();
    const unsub = onAuthStateChanged(a, (user) => {
      if (user) {
        unsub();
        resolve();
      }
    });
    void signInAnonymously(a)
      .then(() => resolve())
      .catch((err) => {
        console.warn("[WhisperLock] Anonymous auth failed — enable it in Firebase Console", err);
        resolve();
      });
  });
  return authReady;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!isBrowser) throw new Error("Firebase is only available in the browser");
  initFirebase();
  if (!storage) throw new Error("Firebase storage not initialized");
  return storage;
}

export { app, analytics, db, storage, auth };
export {
  ref,
  push,
  set,
  onValue,
  remove,
  update,
  serverTimestamp,
  goOffline,
  goOnline,
  onDisconnect,
};
