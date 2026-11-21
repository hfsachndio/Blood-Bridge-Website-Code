/**
 * The Firebase project shared with the Blood Bridge mobile app: same Auth users and the same
 * Firestore collections. A web config is public by design; access is enforced by firestore.rules.
 */
import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";

const env = import.meta.env;
export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyB1wLqhie7e-YV69z_gnWyWHlFu6vuq2J0",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "blood-bridge-78f97.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "blood-bridge-78f97",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "blood-bridge-78f97.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "56833967390",
  appId: env.VITE_FIREBASE_APP_ID || "1:56833967390:web:163ce7d501a94f091af50f",
};

/** The administrator account (the rules grant admin rights to this email). */
export const ADMIN_EMAIL = "admin@bloodbridge.demo";

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = (() => {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
})();
