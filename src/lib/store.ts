/**
 * Browser-side data layer that mirrors the mobile app's Firestore collections:
 * users, requests (SOS), donations (offer posts), donationRecords, chats/messages and notifications.
 * In production the data lives in Supabase (Postgres + Auth + Realtime) behind the /api functions;
 * tests use the same API fully offline on the seed data.
 */
import { useMemo, useSyncExternalStore } from "react";
import { BloodType, distanceKm, findPlace, isCompatible } from "./blood";
import * as backend from "./backend";
import { seed } from "./seed";

export type Role = "user" | "admin";
export type Status = "incomplete" | "pending" | "approved" | "rejected";
export interface User {
  uid: string; email: string; password?: string; fullName: string; phone?: string; role: Role; status: Status;
  bloodType?: BloodType; dateOfBirth?: string; gender?: string; weight?: number; location?: string; lat?: number; lng?: number;
  cnicNumber?: string; cnicVerified?: boolean; cnicImage?: string; isAvailable?: boolean; lastDonationDate?: string;
  totalDonations?: number; eligibilityOutcome?: string; createdAt: string; seeded?: boolean;
}
export interface SOSRequest {
  id: string; uid: string; name: string; phone?: string; bloodType: BloodType; location: string; hospital: string;
  lat: number; lng: number; unitsNeeded: number; priority: "critical" | "urgent" | "normal"; status: "open" | "fulfilled" | "closed";
  responders: string[]; note?: string; createdAt: string;
}
export interface DonationPost { id: string; uid: string; name: string; bloodType: BloodType; location: string; hospital: string; note: string; lat: number; lng: number; status: "active" | "closed"; createdAt: string }
export interface DonationRecord { id: string; donorUid: string; donorName: string; bloodType: BloodType; hospital: string; units: number; date: string; recipient?: string; certificateNo: string; createdAt: string }
export interface Chat { id: string; participants: string[]; lastMessage: string; lastMessageAt: string; lastSenderId: string; unread: Record<string, number> }
export interface Message { id: string; chatId: string; senderId: string; text: string; createdAt: string }
export interface Notification { id: string; uid: string; type: "sos" | "message" | "response" | "verification" | "award" | "system"; title: string; body: string; link?: string; isRead: boolean; createdAt: string }

export interface DB {
  version: number; users: User[]; requests: SOSRequest[]; donations: DonationPost[]; records: DonationRecord[];
  chats: Chat[]; messages: Message[]; notifications: Notification[]; session: string | null; ready?: boolean;
}

const KEY = "bloodbridge-web-v1";
const VERSION = 1;
const now = () => new Date().toISOString();
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- persistence, sync + subscription ----------
/**
 * Unit tests run fully offline on the seed. In the browser the store is a local cache of the
 * Supabase database: every commit diffs the changed documents and sends them to /api/sync,
 * where the service-role function validates ownership before writing. Realtime events and a
 * polling fallback pull other people's changes back in.
 */
export const OFFLINE = import.meta.env.MODE === "test";
const empty = (): DB => ({ version: VERSION, users: [], requests: [], donations: [], records: [], chats: [], messages: [], notifications: [], session: null, ready: false });
let db: DB = OFFLINE ? load() : empty();
let last: DB = { ...db };
let remote = false; // true while applying server data, so it isn't echoed back
const listeners = new Set<() => void>();
function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const parsed = JSON.parse(raw) as DB; if (parsed.version === VERSION) return { ...parsed, ready: true }; }
  } catch { /* storage unavailable */ }
  return { ...seed(), ready: true };
}
type Coll = "users" | "requests" | "donations" | "records" | "chats" | "messages" | "notifications";
const COLLS: Coll[] = ["users", "requests", "donations", "records", "chats", "messages", "notifications"];
const keyOf = (c: Coll, x: { id?: string; uid?: string }) => (c === "users" ? x.uid! : x.id!);
let outbox: Partial<Record<Coll, unknown[]>> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function commit() {
  db = { ...db };
  if (OFFLINE) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota or private mode */ }
  } else if (!remote && db.session) {
    for (const c of COLLS) {
      if (db[c] === last[c]) continue;
      const before = new Map((last[c] as { id?: string; uid?: string }[]).map((x) => [keyOf(c, x), x]));
      const changed = (db[c] as { id?: string; uid?: string }[]).filter((x) => before.get(keyOf(c, x)) !== x);
      if (changed.length) {
        const q = (outbox[c] ??= []) as { id?: string; uid?: string }[];
        for (const x of changed) { const i = q.findIndex((y) => keyOf(c, y) === keyOf(c, x)); if (i >= 0) q[i] = x; else q.push(x); }
      }
    }
    if (Object.keys(outbox).length && !flushTimer) flushTimer = setTimeout(() => { void flush(); }, 60);
  }
  last = { ...db }; // a separate object: store functions assign new arrays onto `db` in place
  listeners.forEach((l) => l());
}
async function flush() {
  flushTimer = null;
  if (inflight) await inflight;
  const batch = outbox; outbox = {};
  if (!Object.keys(batch).length) return;
  inflight = backend.api("sync", batch).then(() => undefined, (e: Error) => { console.error("sync failed", e); syncError?.(e.message); void refresh(); });
  await inflight; inflight = null;
}
/** Waits until every local change has reached the server. */
export async function flushed() { if (flushTimer) { clearTimeout(flushTimer); await flush(); } else if (inflight) await inflight; }
let syncError: ((msg: string) => void) | null = null;
export const onSyncError = (fn: (msg: string) => void) => { syncError = fn; };

type Snapshot = Omit<DB, "version" | "session" | "ready">;
/** Pulls everything this user may see from the database (RLS-equivalent filtering happens server-side). */
export async function refresh() {
  if (OFFLINE) return;
  await flushed();
  const data = await backend.api<Snapshot>("bootstrap");
  if (Object.keys(outbox).length || flushTimer) return; // a newer local edit is pending; the next refresh picks it up
  remote = true;
  db = { ...db, ...data, ready: true };
  commit();
  remote = false;
}
let stopLive: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const softRefresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { void refresh().catch(() => {}); }, 250); };
function startLive() {
  stopLive?.(); stopLive = backend.subscribeChanges(softRefresh);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(softRefresh, backend.usingSupabase ? 30000 : 4000);
}
function stopLiveUpdates() { stopLive?.(); stopLive = null; if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

/** Restores the Supabase session (if any) and loads the data. Call once on startup. */
export async function initStore() {
  if (OFFLINE) return;
  const id = await backend.sessionUid().catch(() => null);
  remote = true; db = { ...db, session: id, ready: !id }; commit(); remote = false;
  if (!id) { void refresh().catch(() => {}); return; }
  try { await refresh(); startLive(); resumePendingReviews(); }
  catch { await backend.signOut(); remote = true; db = { ...empty(), ready: true }; commit(); remote = false; void refresh().catch(() => {}); }
  if (typeof window !== "undefined") window.addEventListener("focus", softRefresh);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Subscribes to the store; `select` runs again only when the data changes. */
export function useDB<T>(select: (d: DB) => T): T {
  const snapshot = useSyncExternalStore(subscribe, () => db);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(snapshot), [snapshot]);
}
export const getDB = () => db;
/** Offline: restore the seed. Online: the data is shared, so this just re-syncs from the server. */
export async function resetDemo() { if (OFFLINE) { db = seed(); db.ready = true; commit(); return; } await refresh(); }

// ---------- auth ----------
export const currentUser = () => db.users.find((u) => u.uid === db.session) ?? null;
export function useCurrentUser() { return useDB((d) => d.users.find((u) => u.uid === d.session) ?? null); }
export const useReady = () => useDB((d) => d.ready);
export async function signUp(fullName: string, email: string, password: string, phone?: string) {
  email = email.trim().toLowerCase();
  if (OFFLINE) {
    if (db.users.some((u) => u.email === email)) throw new Error("An account with this email already exists. Please log in.");
    const u: User = { uid: uid(), email, password, fullName: fullName.trim(), role: "user", status: "incomplete", createdAt: now(), isAvailable: true, totalDonations: 0, ...(phone ? { phone } : {}) };
    db.users = [...db.users, u]; db.session = u.uid; commit();
    return u;
  }
  await backend.api("signup", { fullName: fullName.trim(), email, password, ...(phone ? { phone } : {}) });
  return logIn(email, password);
}
export async function logIn(email: string, password: string, asAdmin = false) {
  email = email.trim().toLowerCase();
  if (OFFLINE) {
    const u = db.users.find((x) => x.email === email);
    if (!u || u.password !== password) throw new Error("Incorrect email or password.");
    if (asAdmin && u.role !== "admin") throw new Error("This account is not an administrator.");
    if (!asAdmin && u.role === "admin") throw new Error("Please use the Admin login for this account.");
    db.session = u.uid; commit();
    return u;
  }
  const id = await backend.signInWithPassword(email, password);
  remote = true; db = { ...db, session: id }; commit(); remote = false;
  await refresh();
  const u = currentUser();
  const fail = async (msg: string) => { await logOut(); throw new Error(msg); };
  if (!u) return fail("Your profile could not be loaded. Please try again.");
  if (asAdmin && u.role !== "admin") return fail("This account is not an administrator.");
  if (!asAdmin && u.role === "admin") return fail("Please use the Admin login for this account.");
  startLive(); resumePendingReviews();
  return u;
}
// ---------- continue where you left off ----------
const lastKey = (uid: string) => `bloodbridge-last:${uid}`;
/** Saves the page the signed-in user is on, so the next sign-in opens it again. */
export function rememberPage(path: string) {
  const id = db.session;
  if (!id || /^\/(login|signup|forgot)/.test(path)) return;
  try { localStorage.setItem(lastKey(id), path); } catch { /* ignore */ }
}
/** The page to open after signing in: the last one this user visited, if it suits their role. */
export function lastPage(u: User) {
  const fallback = u.role === "admin" ? "/admin" : "/app";
  let p: string | null = null;
  try { p = localStorage.getItem(lastKey(u.uid)); } catch { /* ignore */ }
  if (!p || p === "/") return fallback;
  if (u.role === "admin" ? !p.startsWith("/admin") : p.startsWith("/admin")) return fallback;
  return p;
}

export async function logOut() {
  if (OFFLINE) { db.session = null; commit(); return; }
  stopLiveUpdates();
  await flushed().catch(() => {});
  await backend.signOut();
  remote = true; db = { ...empty(), ready: true }; commit(); remote = false;
  void refresh().catch(() => {});
}
export async function requestPasswordReset(email: string) {
  if (OFFLINE) { if (!db.users.some((u) => u.email === email.trim().toLowerCase())) throw new Error("No account found with this email."); return; }
  await backend.api("auth/reset", { email: email.trim().toLowerCase() });
}

export function updateProfile(patch: Partial<User>) {
  const me = currentUser(); if (!me) return;
  const place = patch.location ? findPlace(patch.location) : undefined;
  db.users = db.users.map((u) => (u.uid === me.uid ? { ...u, ...patch, ...(place ? { lat: place.lat, lng: place.lng } : {}) } : u));
  commit();
}

/** Mirrors the profile builder: CNIC checked, then the account waits for admin approval. */
export function submitForVerification(patch: Partial<User>) {
  updateProfile({ ...patch, status: "pending" });
  notify(db.session!, "verification", "Profile submitted for verification", "An administrator will review your CNIC shortly.", "/status");
  // Demo: an automatic reviewer approves valid CNICs after a short delay (an admin can also approve).
  const id = db.session!;
  if (!OFFLINE) { setTimeout(() => { void flushed().then(() => backend.api("demo/verify", {})).then(refresh).catch(() => {}); }, 4000); return; }
  setTimeout(() => {
    const u = db.users.find((x) => x.uid === id);
    if (u && u.status === "pending" && /^\d{5}-\d{7}-\d$/.test(u.cnicNumber ?? "")) setStatus(id, "approved", true);
  }, 4000);
}
/** After a reload, finish any automatic CNIC review that was still running (demo accounts excluded). */
export function resumePendingReviews() {
  if (!OFFLINE) {
    const me = currentUser();
    if (me?.status === "pending" && !me.seeded && /^\d{5}-\d{7}-\d$/.test(me.cnicNumber ?? "")) setTimeout(() => { void backend.api("demo/verify", {}).then(refresh).catch(() => {}); }, 3000);
    return;
  }
  db.users.filter((u) => u.status === "pending" && !u.seeded && /^\d{5}-\d{7}-\d$/.test(u.cnicNumber ?? ""))
    .forEach((u) => setTimeout(() => { const x = db.users.find((y) => y.uid === u.uid); if (x?.status === "pending") setStatus(u.uid, "approved", true); }, 3000));
}
export function setStatus(userId: string, status: Status, cnicVerified?: boolean) {
  db.users = db.users.map((u) => (u.uid === userId ? { ...u, status, ...(cnicVerified !== undefined ? { cnicVerified } : {}) } : u));
  notify(userId, "verification", status === "approved" ? "You're verified ✅" : "Verification update", status === "approved" ? "Your CNIC is verified. You can now post requests and donate." : "Your verification was rejected. Please update your CNIC details.", status === "approved" ? "/app" : "/profile/setup");
  commit();
}

// ---------- notifications ----------
export function notify(to: string, type: Notification["type"], title: string, body: string, link?: string) {
  db.notifications = [{ id: uid(), uid: to, type, title, body, isRead: false, createdAt: now(), ...(link ? { link } : {}) }, ...db.notifications];
  commit();
}
export function markNotificationsRead() {
  const me = db.session; db.notifications = db.notifications.map((n) => (n.uid === me ? { ...n, isRead: true } : n)); commit();
}

// ---------- SOS requests ----------
export function createRequest(input: { bloodType: BloodType; location: string; hospital: string; unitsNeeded: number; priority: SOSRequest["priority"]; note?: string }) {
  const me = currentUser(); if (!me) throw new Error("Please log in first.");
  const place = findPlace(input.hospital) ?? findPlace(input.location) ?? { lat: me.lat ?? 24.86, lng: me.lng ?? 67.01 };
  const r: SOSRequest = { id: uid(), uid: me.uid, name: me.fullName, bloodType: input.bloodType, location: input.location, hospital: input.hospital || input.location, lat: place.lat, lng: place.lng, unitsNeeded: input.unitsNeeded, priority: input.priority, status: "open", responders: [], createdAt: now(), ...(input.note ? { note: input.note } : {}) };
  db.requests = [r, ...db.requests];
  // Notify compatible, available donors within 15 km (as the mobile app does with FCM).
  const matches = db.users.filter((u) => u.uid !== me.uid && u.role === "user" && u.status === "approved" && u.isAvailable && u.bloodType && isCompatible(u.bloodType, r.bloodType) && u.lat && distanceKm(u as { lat: number; lng: number }, r) <= 15);
  matches.forEach((u) => notify(u.uid, "sos", "🚨 Urgent blood request", `${me.fullName} needs ${r.bloodType} blood at ${r.hospital}. ${r.unitsNeeded} unit(s) required.`, "/requests"));
  commit();
  // Simulate a nearby donor responding so the requester sees the flow end to end.
  const responder = matches.sort((a, b) => distanceKm(a as never, r) - distanceKm(b as never, r))[0];
  if (responder) {
    if (OFFLINE) setTimeout(() => respondToRequest(r.id, responder.uid), 6000);
    else setTimeout(() => { void flushed().then(() => backend.api("demo/respond", { requestId: r.id })).then(refresh).catch(() => {}); }, 6000);
  }
  return { request: r, notified: matches.length };
}
export function respondToRequest(requestId: string, responderId = db.session!) {
  const r = db.requests.find((x) => x.id === requestId); const who = db.users.find((u) => u.uid === responderId);
  if (!r || !who || r.responders.includes(responderId)) return null;
  db.requests = db.requests.map((x) => (x.id === requestId ? { ...x, responders: [...x.responders, responderId] } : x));
  const chatId = openChat(r.uid, responderId);
  sendMessage(chatId, `Hi ${r.name.split(" ")[0]}, I'm ${who.bloodType} and can donate at ${r.hospital}. When should I come?`, responderId, false);
  notify(r.uid, "response", `${who.fullName} can donate`, `${who.fullName} (${who.bloodType}) responded to your ${r.bloodType} request.`, `/chat/${chatId}`);
  commit();
  return chatId;
}
export function closeRequest(requestId: string, status: "fulfilled" | "closed") {
  db.requests = db.requests.map((x) => (x.id === requestId ? { ...x, status } : x)); commit();
}

// ---------- donation posts + records ----------
export function createDonationPost(input: { bloodType: BloodType; location: string; hospital: string; note: string }) {
  const me = currentUser(); if (!me) throw new Error("Please log in first.");
  const place = findPlace(input.location) ?? findPlace(input.hospital) ?? { lat: me.lat ?? 24.86, lng: me.lng ?? 67.01 };
  const p: DonationPost = { id: uid(), uid: me.uid, name: me.fullName, ...input, lat: place.lat, lng: place.lng, status: "active", createdAt: now() };
  db.donations = [p, ...db.donations]; commit();
  return p;
}
export function closeDonationPost(id: string) { db.donations = db.donations.map((p) => (p.id === id ? { ...p, status: "closed" } : p)); commit(); }

export function logDonation(input: { hospital: string; units: number; date: string; recipient?: string }) {
  const me = currentUser(); if (!me || !me.bloodType) throw new Error("Complete your profile first.");
  const id = uid();
  const rec: DonationRecord = { id, donorUid: me.uid, donorName: me.fullName, bloodType: me.bloodType, hospital: input.hospital, units: input.units, date: input.date, certificateNo: "BB-" + id.slice(0, 8).toUpperCase(), createdAt: now(), ...(input.recipient ? { recipient: input.recipient } : {}) };
  db.records = [rec, ...db.records];
  const count = db.records.filter((r) => r.donorUid === me.uid).length;
  db.users = db.users.map((u) => (u.uid === me.uid ? { ...u, lastDonationDate: input.date, totalDonations: count } : u));
  const award = AWARDS.find((a) => a.minRecords === count);
  if (award) notify(me.uid, "award", `New award: ${award.title} ${award.icon}`, award.desc, "/leaderboard");
  commit();
  return rec;
}

// ---------- chat ----------
export const chatIdFor = (a: string, b: string) => [a, b].sort().join("__");
export function openChat(a: string, b: string) {
  const id = chatIdFor(a, b);
  if (!db.chats.some((c) => c.id === id)) db.chats = [{ id, participants: [a, b].sort(), lastMessage: "", lastMessageAt: now(), lastSenderId: "", unread: {} }, ...db.chats];
  commit();
  return id;
}
const REPLIES = [
  "Sure, I can reach the hospital in about 30–40 minutes.",
  "Thanks for reaching out. Which ward should I come to?",
  "I'm available today. Please share the patient's name at the blood bank counter.",
  "No problem. I'll message you when I'm on my way.",
];
export function sendMessage(chatId: string, text: string, senderId = db.session!, autoReply = true) {
  const t = text.trim(); if (!t) return;
  const chat = db.chats.find((c) => c.id === chatId); if (!chat) return;
  const other = chat.participants.find((p) => p !== senderId)!;
  db.messages = [...db.messages, { id: uid(), chatId, senderId, text: t, createdAt: now() }];
  db.chats = db.chats.map((c) => (c.id === chatId ? { ...c, lastMessage: t, lastMessageAt: now(), lastSenderId: senderId, unread: { ...c.unread, [other]: (c.unread[other] ?? 0) + 1 } } : c)).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  const sender = db.users.find((u) => u.uid === senderId);
  if (other === db.session || (!OFFLINE && senderId === db.session)) notify(other, "message", `New message from ${sender?.fullName ?? "a donor"}`, t.length > 80 ? t.slice(0, 80) + "…" : t, `/chat/${chatId}`);
  commit();
  // Seeded users reply so the conversation feels real in the demo.
  const otherUser = db.users.find((u) => u.uid === other);
  if (autoReply && otherUser?.seeded) {
    if (OFFLINE) setTimeout(() => sendMessage(chatId, REPLIES[Math.floor(Math.random() * REPLIES.length)]!, other, false), 2200);
    else setTimeout(() => { void flushed().then(() => backend.api("demo/reply", { chatId })).then(refresh).catch(() => {}); }, 2200);
  }
}
export function markChatRead(chatId: string) {
  const me = db.session!; db.chats = db.chats.map((c) => (c.id === chatId ? { ...c, unread: { ...c.unread, [me]: 0 } } : c)); commit();
}

// ---------- gamification (same rules as the mobile leaderboard) ----------
export const AWARDS = [
  { id: "first_drop", icon: "🩸", title: "First Drop", desc: "Logged your first donation", minRecords: 1 },
  { id: "life_saver", icon: "💉", title: "Life Saver", desc: "3 confirmed donations", minRecords: 3 },
  { id: "hero", icon: "🦸", title: "Blood Hero", desc: "5 confirmed donations", minRecords: 5 },
  { id: "champion", icon: "🏆", title: "Champion", desc: "10 confirmed donations", minRecords: 10 },
  { id: "legend", icon: "👑", title: "Legend", desc: "20 confirmed donations", minRecords: 20 },
];
/** 100 points per donation post, 150 points per confirmed donation record. */
export const calcPoints = (posts: number, records: number) => posts * 100 + records * 150;
export function leaderboard(d: DB = db) {
  return d.users.filter((u) => u.role === "user" && u.status === "approved").map((u) => {
    const posts = d.donations.filter((p) => p.uid === u.uid).length;
    const records = d.records.filter((r) => r.donorUid === u.uid).length;
    return { user: u, posts, records, points: calcPoints(posts, records) };
  }).sort((a, b) => b.points - a.points);
}
