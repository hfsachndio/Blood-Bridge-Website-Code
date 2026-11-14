/**
 * Browser-side data layer that mirrors the mobile app's Firestore collections:
 * users, requests (SOS), donations (offer posts), donationRecords, chats/messages and notifications.
 * Everything lives in localStorage so the web app runs on any static host with no backend cost.
 */
import { useMemo, useSyncExternalStore } from "react";
import { AREAS, BloodType, HOSPITALS, distanceKm, findPlace, isCompatible } from "./blood";

export type Role = "user" | "admin";
export type Status = "incomplete" | "pending" | "approved" | "rejected";
export interface User {
  uid: string; email: string; password: string; fullName: string; phone?: string; role: Role; status: Status;
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

interface DB {
  version: number; users: User[]; requests: SOSRequest[]; donations: DonationPost[]; records: DonationRecord[];
  chats: Chat[]; messages: Message[]; notifications: Notification[]; session: string | null;
}

const KEY = "bloodbridge-web-v1";
const VERSION = 1;
const now = () => new Date().toISOString();
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString();
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- seed data ----------
function seed(): DB {
  const area = (n: string) => findPlace(n) ?? AREAS[0]!;
  const donor = (id: string, fullName: string, bloodType: BloodType, loc: string, opts: Partial<User> = {}): User => {
    const a = area(loc);
    return {
      uid: id, email: `${fullName.split(" ")[0]!.toLowerCase()}@bloodbridge.demo`, password: "Demo#1234", fullName, role: "user", status: "approved", bloodType,
      location: a.name, lat: a.lat + (Math.random() - 0.5) * 0.01, lng: a.lng + (Math.random() - 0.5) * 0.01, isAvailable: true,
      dateOfBirth: "1996-04-12", weight: 68, gender: "Male", cnicVerified: true, cnicNumber: "42101-1234567-1", totalDonations: 0,
      createdAt: ago(120), seeded: true, ...opts,
    };
  };
  const users: User[] = [
    donor("u-ahmed", "Ahmed Khan", "B+", "Gulshan-e-Iqbal", { totalDonations: 6, lastDonationDate: ago(140).slice(0, 10) }),
    donor("u-zara", "Zara Siddiqui", "O-", "Clifton", { gender: "Female", weight: 58, totalDonations: 4, lastDonationDate: ago(200).slice(0, 10) }),
    donor("u-hamza", "Hamza Noor", "B+", "PECHS", { totalDonations: 9, lastDonationDate: ago(95).slice(0, 10) }),
    donor("u-sana", "Sana Rauf", "B-", "Bahadurabad", { gender: "Female", weight: 55, totalDonations: 2, lastDonationDate: ago(40).slice(0, 10) }),
    donor("u-usman", "Usman Ali", "O-", "Saddar", { totalDonations: 12, lastDonationDate: ago(120).slice(0, 10) }),
    donor("u-ayesha", "Ayesha Malik", "A+", "DHA", { gender: "Female", weight: 60, totalDonations: 3 }),
    donor("u-bilal", "Bilal Tariq", "O+", "North Nazimabad", { totalDonations: 7, lastDonationDate: ago(180).slice(0, 10) }),
    donor("u-mariam", "Mariam Iqbal", "AB+", "Gulistan-e-Jauhar", { gender: "Female", weight: 57, totalDonations: 1 }),
    donor("u-fahad", "Fahad Sheikh", "A-", "FB Area", { totalDonations: 5, isAvailable: false }),
    donor("u-hira", "Hira Javed", "O+", "Nazimabad", { gender: "Female", weight: 54, totalDonations: 2, lastDonationDate: ago(20).slice(0, 10) }),
    donor("u-kashif", "Kashif Raza", "AB-", "Korangi", { totalDonations: 3 }),
    donor("u-nimra", "Nimra Shah", "B+", "Gulberg", { gender: "Female", weight: 59, totalDonations: 1 }),
    donor("u-imran", "Imran Qureshi", "A+", "Malir", { totalDonations: 8, lastDonationDate: ago(300).slice(0, 10) }),
    donor("u-danish", "Danish Abbasi", "O+", "Shah Faisal Colony", { totalDonations: 0 }),
    { uid: "u-admin", email: "admin@bloodbridge.demo", password: "Admin#1234", fullName: "Blood Bridge Admin", role: "admin", status: "approved", createdAt: ago(300), seeded: true },
    donor("u-pending", "Raheel Ahmed", "A+", "Lyari", { status: "pending", cnicVerified: false, cnicNumber: "42301-7654321-3", totalDonations: 0, createdAt: ago(0, 3) }),
  ];
  const H = (n: string) => HOSPITALS.find((h) => h.name.includes(n))!;
  const req = (id: string, u: User, bloodType: BloodType, hosp: string, units: number, priority: SOSRequest["priority"], hoursAgo: number, responders: string[] = []): SOSRequest => {
    const h = H(hosp);
    return { id, uid: u.uid, name: u.fullName, bloodType, location: u.location ?? "Karachi", hospital: h.name, lat: h.lat, lng: h.lng, unitsNeeded: units, priority, status: "open", responders, createdAt: ago(0, hoursAgo) };
  };
  const by = (id: string) => users.find((u) => u.uid === id)!;
  const requests: SOSRequest[] = [
    req("r1", by("u-mariam"), "B+", "Aga Khan", 2, "critical", 1, ["u-hamza"]),
    req("r2", by("u-bilal"), "O-", "Jinnah", 3, "urgent", 4),
    req("r3", by("u-ayesha"), "A+", "South City", 1, "normal", 9, ["u-imran"]),
    req("r4", by("u-kashif"), "AB-", "Indus", 2, "urgent", 20),
  ];
  const post = (id: string, u: User, hosp: string, note: string, daysAgo: number): DonationPost => {
    const h = H(hosp);
    return { id, uid: u.uid, name: u.fullName, bloodType: u.bloodType!, location: u.location!, hospital: h.name, note, lat: u.lat!, lng: u.lng!, status: "active", createdAt: ago(daysAgo) };
  };
  const donations: DonationPost[] = [
    post("d1", by("u-zara"), "Ziauddin", "Available on weekdays after 5 pm. Number hidden — message me here.", 1),
    post("d2", by("u-usman"), "Civil Hospital", "Happy to help with emergencies near Saddar.", 2),
    post("d3", by("u-ahmed"), "Patel", "Can come within an hour in Gulshan.", 3),
    post("d4", by("u-hamza"), "Liaquat National", "Regular donor, B+.", 6),
    post("d5", by("u-bilal"), "Dow University", "Weekends only.", 8),
  ];
  const rec = (id: string, u: User, hosp: string, daysAgo: number, recipient?: string): DonationRecord => ({
    id, donorUid: u.uid, donorName: u.fullName, bloodType: u.bloodType!, hospital: H(hosp).name, units: 1, date: ago(daysAgo).slice(0, 10), certificateNo: "BB-" + id.toUpperCase(), createdAt: ago(daysAgo), ...(recipient ? { recipient } : {}),
  });
  const records: DonationRecord[] = [];
  users.filter((u) => u.role === "user" && u.status === "approved").forEach((u) => {
    for (let i = 0; i < Math.min(u.totalDonations ?? 0, 6); i++) records.push(rec(`${u.uid}-${i}`, u, ["Aga Khan", "Jinnah", "Civil Hospital", "Indus", "Liaquat National", "Patel"][i % 6]!, 100 + i * 110));
  });
  return { version: VERSION, users, requests, donations, records, chats: [], messages: [], notifications: [], session: null };
}

// ---------- persistence + subscription ----------
let db: DB = load();
const listeners = new Set<() => void>();
function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const parsed = JSON.parse(raw) as DB; if (parsed.version === VERSION) return parsed; }
  } catch { /* storage unavailable */ }
  return seed();
}
function commit() {
  db = { ...db };
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota or private mode */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Subscribes to the store; `select` runs again only when the data changes. */
export function useDB<T>(select: (d: DB) => T): T {
  const snapshot = useSyncExternalStore(subscribe, () => db);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(snapshot), [snapshot]);
}
export const getDB = () => db;
export function resetDemo() { db = seed(); commit(); }

// ---------- auth ----------
export const currentUser = () => db.users.find((u) => u.uid === db.session) ?? null;
export function useCurrentUser() { return useDB((d) => d.users.find((u) => u.uid === d.session) ?? null); }
export function signUp(fullName: string, email: string, password: string, phone?: string) {
  email = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === email)) throw new Error("An account with this email already exists. Please log in.");
  const u: User = { uid: uid(), email, password, fullName: fullName.trim(), role: "user", status: "incomplete", createdAt: now(), isAvailable: true, totalDonations: 0, ...(phone ? { phone } : {}) };
  db.users = [...db.users, u]; db.session = u.uid; commit();
  return u;
}
export function logIn(email: string, password: string, asAdmin = false) {
  const u = db.users.find((x) => x.email === email.trim().toLowerCase());
  if (!u || u.password !== password) throw new Error("Incorrect email or password.");
  if (asAdmin && u.role !== "admin") throw new Error("This account is not an administrator.");
  if (!asAdmin && u.role === "admin") throw new Error("Please use the Admin login for this account.");
  db.session = u.uid; commit();
  return u;
}
export function logOut() { db.session = null; commit(); }
export function requestPasswordReset(email: string) {
  if (!db.users.some((u) => u.email === email.trim().toLowerCase())) throw new Error("No account found with this email.");
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
  setTimeout(() => {
    const u = db.users.find((x) => x.uid === id);
    if (u && u.status === "pending" && /^\d{5}-\d{7}-\d$/.test(u.cnicNumber ?? "")) setStatus(id, "approved", true);
  }, 4000);
}
/** After a reload, finish any automatic CNIC review that was still running (demo accounts excluded). */
export function resumePendingReviews() {
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
  if (responder) setTimeout(() => respondToRequest(r.id, responder.uid), 6000);
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
  if (other === db.session) notify(other, "message", `New message from ${sender?.fullName ?? "a donor"}`, t.length > 80 ? t.slice(0, 80) + "…" : t, `/chat/${chatId}`);
  commit();
  // Seeded users reply so the conversation feels real in the demo.
  const otherUser = db.users.find((u) => u.uid === other);
  if (autoReply && otherUser?.seeded) setTimeout(() => sendMessage(chatId, REPLIES[Math.floor(Math.random() * REPLIES.length)]!, other, false), 2200);
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
