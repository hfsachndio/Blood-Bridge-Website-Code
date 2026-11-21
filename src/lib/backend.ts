/**
 * Firebase backend shared with the mobile app: Firebase Auth for sessions and Firestore for data,
 * with live onSnapshot listeners. Access rules live in firestore.rules (same file as the app repo).
 */
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut as fbSignOut, updateProfile, type User as FbUser,
} from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, query, setDoc, where, writeBatch, type DocumentData, type Unsubscribe,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { ADMIN_EMAIL, auth, db, firebaseConfig } from "./firebase";
import * as S from "./schema";
import type { Chat, DB, DonationPost, DonationRecord, Message, Notification, SOSRequest, User } from "./store";

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "No account found with this email.",
  "auth/email-already-in-use": "An account with this email already exists. Please log in.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
};
const friendly = (e: unknown) => new Error(AUTH_ERRORS[(e as { code?: string }).code ?? ""] ?? (e as Error).message ?? "Something went wrong.");

/** Resolves once Firebase has restored (or not) the previous session. */
export function sessionUid(): Promise<string | null> {
  return new Promise((resolve) => { const off = onAuthStateChanged(auth, (u) => { off(); resolve(u?.uid ?? null); }); });
}
export async function signInWithPassword(email: string, password: string): Promise<string> {
  try { return (await signInWithEmailAndPassword(auth, email, password)).user.uid; } catch (e) { throw friendly(e); }
}
export async function signUpWithPassword(email: string, password: string, fullName: string): Promise<FbUser> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName }).catch(() => {});
    return cred.user;
  } catch (e) { throw friendly(e); }
}
export async function resetPassword(email: string) { try { await sendPasswordResetEmail(auth, email); } catch (e) { throw friendly(e); } }
export async function signOut() { await fbSignOut(auth); }
export const isAdminSession = () => auth.currentUser?.email === ADMIN_EMAIL;
/** Creates (or confirms) another login without touching the current session, returning its uid. */
export async function ensureAccount(email: string, password: string, fullName: string): Promise<string> {
  const second = initializeApp(firebaseConfig, "seeder-" + Date.now());
  const a = getAuth(second);
  try {
    try { const c = await createUserWithEmailAndPassword(a, email, password); await updateProfile(c.user, { displayName: fullName }).catch(() => {}); return c.user.uid; }
    catch (e) { if ((e as { code?: string }).code !== "auth/email-already-in-use") throw friendly(e); return (await signInWithEmailAndPassword(a, email, password)).user.uid; }
  } finally { await fbSignOut(a).catch(() => {}); await deleteApp(second).catch(() => {}); }
}
export async function userExists(uid: string) { return (await getDoc(doc(db, "users", uid))).exists(); }

// ── live data ────────────────────────────────────────────────────────────────
type Snapshot = Pick<DB, "users" | "requests" | "donations" | "records" | "chats" | "messages" | "notifications">;
type Emit = (patch: Partial<Snapshot>) => void;

/** Subscribes to everything the signed-in user may see. Returns an unsubscribe function. */
export function subscribe(me: string, isAdmin: boolean, emit: Emit, onError: (e: Error) => void): () => void {
  const subs: Unsubscribe[] = [];
  const msgSubs = new Map<string, Unsubscribe>();
  const messages = new Map<string, Message[]>();
  const err = (e: Error) => { console.error(e); onError(e); };
  const watch = <T,>(q: Parameters<typeof onSnapshot>[0], map: (id: string, d: DocumentData) => T, key: keyof Snapshot) =>
    subs.push(onSnapshot(q as never, (snap: { docs: { id: string; data: () => DocumentData }[] }) => emit({ [key]: snap.docs.map((d) => map(d.id, d.data())) } as Partial<Snapshot>), err));

  watch(collection(db, "users"), S.userFromDoc, "users");
  watch(collection(db, "requests"), S.requestFromDoc, "requests");
  watch(collection(db, "donations"), S.donationFromDoc, "donations");
  watch(collection(db, "donationRecords"), S.recordFromDoc, "records");
  watch(collection(db, "notifications", me, "items"), (id, d) => S.notificationFromDoc(me, id, d), "notifications");
  const chatQuery = isAdmin ? collection(db, "chats") : query(collection(db, "chats"), where("participants", "array-contains", me));
  subs.push(onSnapshot(chatQuery, (snap) => {
    const chats = snap.docs.map((d) => S.chatFromDoc(d.id, d.data()));
    emit({ chats });
    // One message listener per chat (the app's real-time subcollection model).
    for (const c of chats) {
      if (msgSubs.has(c.id)) continue;
      msgSubs.set(c.id, onSnapshot(collection(db, "chats", c.id, "messages"), (ms) => {
        messages.set(c.id, ms.docs.map((d) => S.messageFromDoc(c.id, d.id, d.data())));
        emit({ messages: [...messages.values()].flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
      }, err));
    }
  }, err));
  return () => { subs.forEach((u) => u()); msgSubs.forEach((u) => u()); };
}

/** Logged-out landing page counters (stats/public). */
export function subscribeStats(emit: (s: { donors: number; requests: number; donations: number; records: number }) => void) {
  return onSnapshot(doc(db, "stats", "public"), (d) => { if (d.exists()) emit(d.data() as never); }, () => {});
}
export async function writeStats(s: { donors: number; requests: number; donations: number; records: number }) {
  await setDoc(doc(db, "stats", "public"), { ...s, updatedAt: S.ts(new Date().toISOString()) });
}

// ── writes ───────────────────────────────────────────────────────────────────
export interface Changes {
  users?: User[]; requests?: SOSRequest[]; donations?: DonationPost[]; records?: DonationRecord[];
  chats?: Chat[]; messages?: Message[]; notifications?: Notification[];
}
/** Writes changed documents in the app's format. Chats go before their messages (rules check participants). */
export async function write(changes: Changes, from: { uid: string; name: string }) {
  const ops: [ReturnType<typeof doc>, DocumentData][] = [];
  for (const u of changes.users ?? []) ops.push([doc(db, "users", u.uid), S.userToDoc(u)]);
  for (const r of changes.requests ?? []) ops.push([doc(db, "requests", r.id), S.requestToDoc(r)]);
  for (const p of changes.donations ?? []) ops.push([doc(db, "donations", p.id), S.donationToDoc(p)]);
  for (const r of changes.records ?? []) ops.push([doc(db, "donationRecords", r.id), S.recordToDoc(r)]);
  for (const c of changes.chats ?? []) ops.push([doc(db, "chats", c.id), S.chatToDoc(c)]);
  for (const m of changes.messages ?? []) ops.push([doc(db, "chats", m.chatId, "messages", m.id), S.messageToDoc(m)]);
  for (const n of changes.notifications ?? []) ops.push([doc(db, "notifications", n.uid, "items", n.id), S.notificationToDoc(n, from)]);
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    for (const [ref, data] of ops.slice(i, i + 450)) b.set(ref, data, { merge: true });
    await b.commit();
  }
}
