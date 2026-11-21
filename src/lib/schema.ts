/**
 * Converts between the website's in-memory types and the mobile app's Firestore documents,
 * so both clients read and write the same data:
 *   users/{uid} · requests · donations · donationRecords · chats/{id}/messages · notifications/{uid}/items
 * Writes keep every field the app uses (createdAt as a Timestamp, coords, documents[], readStatus …)
 * and add the website's extras (lat/lng, responders, aiRanking …), which the app ignores.
 */
import { Timestamp } from "firebase/firestore";
import { findPlace, type BloodType } from "./blood";
import type { Chat, DonationPost, DonationRecord, Message, Notification, SOSRequest, User } from "./store";

type Doc = Record<string, unknown>;
const KARACHI = { lat: 24.8607, lng: 67.0011 };

/** Firestore Timestamp | ISO string | Date | pending serverTimestamp (null) → ISO string. */
export function iso(v: unknown, fallback = new Date().toISOString()): string {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof (v as Timestamp).toDate === "function") return (v as Timestamp).toDate().toISOString();
  if (typeof (v as { seconds?: number }).seconds === "number") return new Date((v as { seconds: number }).seconds * 1000).toISOString();
  return fallback;
}
export const ts = (isoString: string) => Timestamp.fromDate(new Date(isoString));
const clean = (o: Doc) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
function coordsOf(d: Doc, ...names: (string | undefined)[]) {
  const c = d.coords as { latitude?: number; longitude?: number } | null | undefined;
  if (num(d.lat) !== undefined && num(d.lng) !== undefined) return { lat: d.lat as number, lng: d.lng as number };
  if (c && num(c.latitude) !== undefined && num(c.longitude) !== undefined) return { lat: c.latitude!, lng: c.longitude! };
  for (const n of names) { const p = n ? findPlace(n) : undefined; if (p) return { lat: p.lat, lng: p.lng }; }
  return undefined;
}

// ── users ───────────────────────────────────────────────────────────────────
export function userFromDoc(id: string, d: Doc): User {
  const where = coordsOf(d, str(d.location));
  const docs = Array.isArray(d.documents) ? (d.documents as unknown[]) : [];
  return clean({
    uid: id, email: str(d.email) ?? "", fullName: str(d.fullName) ?? "Blood Bridge user", phone: str(d.phone),
    role: d.role === "admin" ? "admin" : "user",
    status: (["incomplete", "pending", "approved", "rejected"].includes(d.status as string) ? d.status : "incomplete") as User["status"],
    bloodType: str(d.bloodType) as BloodType | undefined, dateOfBirth: str(d.dateOfBirth), gender: str(d.gender), weight: num(d.weight),
    location: str(d.location), lat: where?.lat, lng: where?.lng,
    cnicNumber: str(d.cnicNumber), cnicVerified: typeof d.cnicVerified === "boolean" ? d.cnicVerified : undefined,
    cnicImage: str(d.cnicImage) ?? (typeof docs[0] === "string" ? (docs[0] as string) : undefined),
    cnicCheck: (d.cnicCheck as User["cnicCheck"]) ?? undefined,
    isAvailable: d.isAvailable !== false, lastDonationDate: str(d.lastDonationDate), totalDonations: num(d.totalDonations),
    eligibilityOutcome: str(d.eligibilityOutcome), createdAt: iso(d.createdAt), seeded: d.seeded === true ? true : undefined,
  }) as unknown as User;
}
export function userToDoc(u: User): Doc {
  const { password: _pw, cnicImage, createdAt, seeded, ...rest } = u;
  return clean({
    ...rest, uid: u.uid, createdAt: ts(createdAt), updatedAt: Timestamp.now(),
    ...(seeded ? { seeded: true } : {}),
    // The app keeps the CNIC photo as a data URI in documents[0] (no Cloud Storage needed).
    ...(cnicImage ? { documents: [cnicImage] } : {}),
  });
}

// ── SOS requests ────────────────────────────────────────────────────────────
const PRIORITY_IN: Record<string, SOSRequest["priority"]> = { critical: "critical", urgent: "urgent", moderate: "normal", normal: "normal" };
export function requestFromDoc(id: string, d: Doc): SOSRequest {
  const where = coordsOf(d, str(d.hospital), str(d.location)) ?? KARACHI;
  return clean({
    id, uid: str(d.uid) ?? "", name: str(d.name) ?? "Patient", phone: str(d.phone), bloodType: d.bloodType as BloodType,
    location: str(d.location) ?? "", hospital: str(d.hospital) ?? str(d.location) ?? "", lat: where.lat, lng: where.lng,
    unitsNeeded: num(d.unitsNeeded) ?? (Number(d.unitsNeeded) || 1), priority: PRIORITY_IN[str(d.priority) ?? ""] ?? "normal",
    status: (["open", "fulfilled", "closed"].includes(d.status as string) ? d.status : "open") as SOSRequest["status"],
    responders: Array.isArray(d.responders) ? (d.responders as string[]) : [], note: str(d.note),
    createdAt: iso(d.createdAt), aiRanking: (d.aiRanking as SOSRequest["aiRanking"]) ?? undefined,
  }) as unknown as SOSRequest;
}
export function requestToDoc(r: SOSRequest): Doc {
  const initials = r.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return clean({ ...r, id: undefined, initials, priority: r.priority === "normal" ? "moderate" : r.priority, createdAt: ts(r.createdAt), updatedAt: Timestamp.now() });
}

// ── donation offer posts ────────────────────────────────────────────────────
export function donationFromDoc(id: string, d: Doc): DonationPost {
  const where = coordsOf(d, str(d.location), str(d.hospital)) ?? KARACHI;
  return {
    id, uid: str(d.uid) ?? "", name: str(d.name) ?? "Donor", bloodType: d.bloodType as BloodType, location: str(d.location) ?? "",
    hospital: str(d.hospital) ?? "", note: str(d.note) ?? "", lat: where.lat, lng: where.lng,
    status: d.status === "active" ? "active" : "closed", createdAt: iso(d.createdAt),
  };
}
export function donationToDoc(p: DonationPost): Doc {
  return clean({ ...p, id: undefined, coords: { latitude: p.lat, longitude: p.lng }, createdAt: ts(p.createdAt), updatedAt: Timestamp.now() });
}

// ── donation records ────────────────────────────────────────────────────────
export function recordFromDoc(id: string, d: Doc): DonationRecord {
  return clean({
    id, donorUid: str(d.donorUid) ?? "", donorName: str(d.donorName) ?? "Donor", bloodType: d.bloodType as BloodType,
    hospital: str(d.hospital) ?? "", units: num(d.units) ?? 1, date: str(d.donationDate) ?? str(d.date) ?? iso(d.createdAt).slice(0, 10),
    recipient: str(d.recipientName) ?? str(d.recipient) ?? undefined, certificateNo: str(d.confirmationCode) ?? str(d.certificateNo) ?? "BB-" + id.slice(0, 8).toUpperCase(),
    createdAt: iso(d.createdAt),
  }) as unknown as DonationRecord;
}
export function recordToDoc(r: DonationRecord): Doc {
  return clean({
    donorUid: r.donorUid, donorName: r.donorName, bloodType: r.bloodType, hospital: r.hospital, units: r.units,
    donationDate: r.date, recipientName: r.recipient ?? null, confirmationCode: r.certificateNo, status: "confirmed", createdAt: ts(r.createdAt),
  });
}

// ── chats + messages ────────────────────────────────────────────────────────
export function chatFromDoc(id: string, d: Doc): Chat {
  const participants = (Array.isArray(d.participants) ? d.participants : []) as string[];
  // The app tracks read state as booleans (readStatus); the website also keeps unread counts.
  // readStatus wins, so a chat read in the app is read on the website too.
  const counts = (d.unread as Record<string, number>) ?? {};
  const rs = (d.readStatus as Record<string, boolean>) ?? {};
  const unread: Record<string, number> = {};
  for (const p of participants) unread[p] = rs[p] === true ? 0 : rs[p] === false ? Math.max(1, counts[p] ?? 1) : counts[p] ?? 0;
  return { id, participants, lastMessage: str(d.lastMessage) ?? "", lastMessageAt: iso(d.lastMessageAt), lastSenderId: str(d.lastSenderId) ?? "", unread };
}
export function chatToDoc(c: Chat): Doc {
  const readStatus = Object.fromEntries(c.participants.map((p) => [p, !(c.unread[p] > 0)]));
  return { participants: [...c.participants].sort(), lastMessage: c.lastMessage, lastMessageAt: ts(c.lastMessageAt), lastSenderId: c.lastSenderId, readStatus, unread: c.unread };
}
export const messageFromDoc = (chatId: string, id: string, d: Doc): Message => ({ id, chatId, senderId: str(d.senderId) ?? "", text: str(d.text) ?? "", createdAt: iso(d.createdAt) });
export const messageToDoc = (m: Message): Doc => ({ senderId: m.senderId, text: m.text, createdAt: ts(m.createdAt) });

// ── notifications ───────────────────────────────────────────────────────────
const LINK_FOR: Record<string, string> = { sos: "/requests", message: "/chat", contact_request: "/notifications", contact_approved: "/notifications", response: "/requests", award: "/leaderboard", verification: "/status" };
export function notificationFromDoc(uid: string, id: string, d: Doc): Notification {
  const type = str(d.type) ?? "system";
  const link = str(d.link) ?? (type === "message" && str(d.relatedId) ? `/chat/${d.relatedId}` : LINK_FOR[type]);
  return clean({ id, uid, type, title: str(d.title) ?? "", body: str(d.body) ?? "", link, isRead: d.isRead === true, createdAt: iso(d.createdAt) }) as unknown as Notification;
}
export function notificationToDoc(n: Notification, from?: { uid: string; name: string }): Doc {
  const relatedId = n.link?.startsWith("/chat/") ? n.link.slice(6) : undefined;
  return clean({ type: n.type, title: n.title, body: n.body, link: n.link, isRead: n.isRead, createdAt: ts(n.createdAt), fromUserId: from?.uid, fromUserName: from?.name, relatedId });
}
