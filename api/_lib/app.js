import crypto from "node:crypto";
import { q, tx } from "./db.js";
import { HttpError, createAuthUser, devLogin, usingSupabase } from "./auth.js";

// ---------- helpers shared with the client rules ----------
const CAN_RECEIVE_FROM = {
  "O-": ["O-"], "O+": ["O+", "O-"], "A-": ["A-", "O-"], "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"], "B+": ["B+", "B-", "O+", "O-"], "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
};
const isCompatible = (donor, patient) => (CAN_RECEIVE_FROM[patient] || []).includes(donor);
function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const newId = () => crypto.randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x") + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();
const CNIC = /^\d{5}-\d{7}-\d$/;
const PRIVATE = ["email", "phone", "cnicNumber", "cnicImage", "cnicCheck"];
const LOCKED = ["uid", "role", "seeded", "createdAt", "password", "email"];
const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);
const chatIdFor = (a, b) => [a, b].sort().join("__");

function splitProfile(doc) {
  const pub = {}, priv = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "password" || k === "uid" || k === "role" || k === "status" || k === "seeded") continue;
    if (PRIVATE.includes(k)) { if (k !== "email") priv[k] = v; } else pub[k] = v;
  }
  if (typeof priv.cnicImage === "string" && priv.cnicImage.length > 1_500_000) throw new HttpError(413, "CNIC image is too large.");
  return { pub, priv };
}
const toUser = (p, priv) => ({ ...p.data, uid: p.id, role: p.role, status: p.status, ...(p.seeded ? { seeded: true } : {}), ...(priv ? { ...priv.data, email: priv.email } : {}) });

async function profile(uid, c = { query: q }) {
  const r = await c.query("select p.*, pp.email, pp.data as private from profiles p left join profile_private pp on pp.id = p.id where p.id = $1", [uid]);
  return r.rows[0] || null;
}
async function notify(c, to, type, title, body, link) {
  const n = { id: newId(), uid: to, type, title, body, isRead: false, createdAt: nowIso(), ...(link ? { link } : {}) };
  await c.query("insert into notifications (id, uid, is_read, data, created_at) values ($1,$2,false,$3,$4)", [n.id, to, n, n.createdAt]);
}
async function postMessage(c, chatId, senderId, text) {
  const m = { id: newId(), chatId, senderId, text, createdAt: nowIso() };
  await c.query("insert into messages (id, chat_id, sender, data, created_at) values ($1,$2,$3,$4,$5)", [m.id, chatId, senderId, m, m.createdAt]);
  const chat = (await c.query("select * from chats where id = $1 for update", [chatId])).rows[0];
  const other = chat.participants.find((p) => p !== senderId);
  const unread = { ...(chat.data.unread || {}), [other]: ((chat.data.unread || {})[other] || 0) + 1 };
  const data = { ...chat.data, lastMessage: text, lastMessageAt: m.createdAt, lastSenderId: senderId, unread };
  await c.query("update chats set data = $2, updated_at = now() where id = $1", [chatId, data]);
  return other;
}
async function ensureChat(c, a, b) {
  const id = chatIdFor(a, b);
  const data = { id, participants: [a, b].sort(), lastMessage: "", lastMessageAt: nowIso(), lastSenderId: "", unread: {} };
  await c.query("insert into chats (id, participants, data) values ($1,$2,$3) on conflict (id) do nothing", [id, data.participants, data]);
  return id;
}

// ---------- reads ----------
export async function bootstrap(me) {
  if (!me) {
    // Logged-out landing page only needs live counts.
    const [u, r, rec] = await Promise.all([
      q("select id, role, status from profiles"),
      q("select id, status from requests"),
      q("select id from records"),
    ]);
    return {
      users: u.rows.map((x) => ({ uid: x.id, role: x.role, status: x.status })),
      requests: r.rows.map((x) => ({ id: x.id, status: x.status })),
      records: rec.rows.map((x) => ({ id: x.id })),
      donations: [], chats: [], messages: [], notifications: [],
    };
  }
  const meRow = await profile(me);
  if (!meRow) throw new HttpError(401, "Profile not found.");
  const admin = meRow.role === "admin";
  const [profiles, priv, requests, donations, records, chats, notifications] = await Promise.all([
    q("select * from profiles order by created_at"),
    admin ? q("select * from profile_private") : q("select * from profile_private where id = $1", [me]),
    q("select data, status from requests order by created_at desc limit 300"),
    q("select data, status from donations order by created_at desc limit 300"),
    q("select data from records order by created_at desc limit 2000"),
    q("select data from chats where $1 = any(participants) order by updated_at desc", [me]),
    q("select data, is_read from notifications where uid = $1 order by created_at desc limit 200", [me]),
  ]);
  const privBy = new Map(priv.rows.map((x) => [x.id, x]));
  const chatIds = chats.rows.map((x) => x.data.id);
  const messages = chatIds.length ? await q("select data from messages where chat_id = any($1) order by created_at", [chatIds]) : { rows: [] };
  return {
    users: profiles.rows.map((p) => toUser(p, privBy.get(p.id))),
    requests: requests.rows.map((x) => ({ ...x.data, status: x.status })),
    donations: donations.rows.map((x) => ({ ...x.data, status: x.status })),
    records: records.rows.map((x) => x.data),
    chats: chats.rows.map((x) => x.data),
    messages: messages.rows.map((x) => x.data),
    notifications: notifications.rows.map((x) => ({ ...x.data, isRead: x.is_read })),
  };
}

// ---------- validated writes ----------
const arr = (v) => (Array.isArray(v) ? v.slice(0, 200) : []);

export async function sync(me, body) {
  return tx(async (c) => {
    const meRow = await profile(me, c);
    if (!meRow) throw new HttpError(401, "Profile not found.");
    const admin = meRow.role === "admin";
    const approved = meRow.status === "approved" || admin;
    const counts = {};
    const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

    for (const doc of arr(body.users)) {
      if (!doc || typeof doc.uid !== "string") continue;
      const cur = await profile(doc.uid, c);
      if (!cur) continue;
      if (doc.uid === me) {
        const { pub, priv } = splitProfile(doc);
        for (const k of LOCKED) delete pub[k];
        if (!admin) pub.cnicVerified = cur.data.cnicVerified ?? false;
        let status = cur.status;
        if (doc.status === "pending" && ["incomplete", "rejected", "pending"].includes(cur.status)) status = "pending";
        if (admin && doc.status) status = doc.status;
        await c.query("update profiles set data = $2, status = $3, updated_at = now() where id = $1", [me, { ...cur.data, ...pub }, status]);
        await c.query("update profile_private set data = $2, updated_at = now() where id = $1", [me, { ...(cur.private || {}), ...priv }]);
        bump("users");
      } else if (admin && ["approved", "rejected", "pending"].includes(doc.status)) {
        const data = { ...cur.data, ...(typeof doc.cnicVerified === "boolean" ? { cnicVerified: doc.cnicVerified } : {}) };
        await c.query("update profiles set status = $2, data = $3, updated_at = now() where id = $1", [doc.uid, doc.status, data]);
        bump("users");
      }
    }

    for (const doc of arr(body.requests)) {
      if (!doc?.id) continue;
      const cur = (await c.query("select * from requests where id = $1 for update", [doc.id])).rows[0];
      if (!cur) {
        if (doc.uid !== me || !approved) continue;
        if (!CAN_RECEIVE_FROM[doc.bloodType] || !Number.isFinite(doc.lat) || !Number.isFinite(doc.lng)) throw new HttpError(400, "Invalid request.");
        const aiRanking = Array.isArray(doc.aiRanking) ? doc.aiRanking.slice(0, 5).map((x) => ({ uid: str(x?.uid, 60), name: str(x?.name, 80), bloodType: str(x?.bloodType, 3), km: Number(x?.km) || 0, p: Math.max(0, Math.min(1, Number(x?.p) || 0)) })) : [];
        const data = { ...doc, name: meRow.data.fullName, responders: [], status: "open", unitsNeeded: Math.max(1, Math.min(20, Number(doc.unitsNeeded) || 1)), note: str(doc.note), aiRanking };
        await c.query("insert into requests (id, uid, status, data, created_at) values ($1,$2,'open',$3,$4)", [doc.id, me, data, doc.createdAt || nowIso()]);
      } else if (cur.uid === me) {
        const status = ["open", "fulfilled", "closed"].includes(doc.status) ? doc.status : cur.status;
        const data = { ...cur.data, ...doc, id: cur.id, uid: cur.uid, createdAt: cur.data.createdAt, responders: cur.data.responders, status };
        await c.query("update requests set data = $2, status = $3, updated_at = now() where id = $1", [doc.id, data, status]);
      } else {
        const responders = cur.data.responders || [];
        if (!approved || responders.includes(me) || !arr(doc.responders).includes(me)) continue;
        await c.query("update requests set data = $2, updated_at = now() where id = $1", [doc.id, { ...cur.data, responders: [...responders, me] }]);
      }
      bump("requests");
    }

    for (const doc of arr(body.donations)) {
      if (!doc?.id) continue;
      const cur = (await c.query("select * from donations where id = $1", [doc.id])).rows[0];
      if (cur ? cur.uid !== me : doc.uid !== me || !approved) continue;
      const status = doc.status === "closed" ? "closed" : "active";
      const data = { ...(cur?.data || {}), ...doc, uid: me, name: meRow.data.fullName, note: str(doc.note) ?? "", status };
      await c.query("insert into donations (id, uid, status, data, created_at) values ($1,$2,$3,$4,$5) on conflict (id) do update set data = excluded.data, status = excluded.status, updated_at = now()", [doc.id, me, status, data, doc.createdAt || nowIso()]);
      bump("donations");
    }

    for (const doc of arr(body.records)) {
      if (!doc?.id || doc.donorUid !== me) continue;
      const data = { ...doc, donorName: meRow.data.fullName, units: Math.max(1, Math.min(5, Number(doc.units) || 1)) };
      await c.query("insert into records (id, uid, data, created_at) values ($1,$2,$3,$4) on conflict (id) do nothing", [doc.id, me, data, doc.createdAt || nowIso()]);
      bump("records");
    }

    for (const doc of arr(body.chats)) {
      const parts = arr(doc?.participants);
      if (!doc?.id || parts.length !== 2 || !parts.includes(me) || doc.id !== chatIdFor(parts[0], parts[1])) continue;
      const other = parts.find((p) => p !== me);
      if (!(await profile(other, c))) continue;
      const cur = (await c.query("select * from chats where id = $1 for update", [doc.id])).rows[0];
      const data = { ...(cur?.data || {}), id: doc.id, participants: [...parts].sort(), lastMessage: str(doc.lastMessage, 200) ?? "", lastMessageAt: doc.lastMessageAt || nowIso(), lastSenderId: doc.lastSenderId || "", unread: typeof doc.unread === "object" && doc.unread ? doc.unread : {} };
      await c.query("insert into chats (id, participants, data) values ($1,$2,$3) on conflict (id) do update set data = excluded.data, updated_at = now()", [doc.id, data.participants, data]);
      bump("chats");
    }

    for (const doc of arr(body.messages)) {
      if (!doc?.id || doc.senderId !== me || typeof doc.text !== "string" || !doc.text.trim()) continue;
      const chat = (await c.query("select participants from chats where id = $1", [doc.chatId])).rows[0];
      if (!chat || !chat.participants.includes(me)) continue;
      const m = { id: doc.id, chatId: doc.chatId, senderId: me, text: doc.text.trim().slice(0, 2000), createdAt: doc.createdAt || nowIso() };
      await c.query("insert into messages (id, chat_id, sender, data, created_at) values ($1,$2,$3,$4,$5) on conflict (id) do nothing", [m.id, m.chatId, me, m, m.createdAt]);
      bump("messages");
    }

    for (const doc of arr(body.notifications)) {
      if (!doc?.id || typeof doc.uid !== "string") continue;
      const cur = (await c.query("select uid from notifications where id = $1", [doc.id])).rows[0];
      if (cur) {
        if (cur.uid !== me) continue;
        await c.query("update notifications set is_read = $2, data = jsonb_set(data, '{isRead}', to_jsonb($2::boolean)) where id = $1", [doc.id, !!doc.isRead]);
      } else {
        const allowed = doc.uid === me || ["sos", "response", "message"].includes(doc.type) || (admin && doc.type === "verification");
        if (!allowed || !(await profile(doc.uid, c))) continue;
        const n = { id: doc.id, uid: doc.uid, type: doc.type, title: str(doc.title, 120), body: str(doc.body, 300), isRead: false, createdAt: doc.createdAt || nowIso(), ...(doc.link ? { link: str(doc.link, 120) } : {}) };
        await c.query("insert into notifications (id, uid, is_read, data, created_at) values ($1,$2,false,$3,$4) on conflict (id) do nothing", [n.id, n.uid, n, n.createdAt]);
      }
      bump("notifications");
    }
    return { ok: true, saved: counts };
  });
}

// ---------- account ----------
export async function signup(body) {
  const fullName = str(body.fullName, 80)?.trim();
  const email = str(body.email, 120)?.trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!fullName || fullName.length < 3) throw new HttpError(400, "Please enter your full name.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (password.length < 8) throw new HttpError(400, "Use at least 8 characters for your password.");
  const exists = await q("select 1 from profile_private where email = $1", [email]);
  if (exists.rowCount) throw new HttpError(409, "An account with this email already exists. Please log in.");
  const id = await createAuthUser(email, password, { full_name: fullName });
  const createdAt = nowIso();
  await tx(async (c) => {
    await c.query("insert into profiles (id, role, status, data, created_at) values ($1,'user','incomplete',$2,$3)", [id, { fullName, isAvailable: true, totalDonations: 0, createdAt }, createdAt]);
    await c.query("insert into profile_private (id, email, data) values ($1,$2,$3)", [id, email, body.phone ? { phone: str(body.phone, 20) } : {}]);
  });
  return { ok: true, uid: id };
}

export async function passwordReset(body) {
  const email = str(body.email, 120)?.trim().toLowerCase();
  const r = await q("select 1 from profile_private where email = $1", [email || ""]);
  if (!r.rowCount) throw new HttpError(404, "No account found with this email.");
  return { ok: true };
}

export const login = (body) => devLogin(String(body.email || "").trim().toLowerCase(), String(body.password || ""));

// ---------- demo helpers (act as the seeded community, with strict checks) ----------
const REPLIES = [
  "Sure, I can reach the hospital in about 30–40 minutes.",
  "Thanks for reaching out. Which ward should I come to?",
  "I'm available today. Please share the patient's name at the blood bank counter.",
  "No problem. I'll message you when I'm on my way.",
];

/** Auto-approves the caller's own CNIC submission, like the mobile app's reviewer flow. */
export async function demoVerify(me) {
  return tx(async (c) => {
    const p = await profile(me, c);
    if (!p || p.status !== "pending" || p.seeded || !CNIC.test(p.private?.cnicNumber || "")) return { ok: false };
    await c.query("update profiles set status = 'approved', data = data || '{\"cnicVerified\": true}'::jsonb, updated_at = now() where id = $1", [me]);
    await notify(c, me, "verification", "You're verified ✅", "Your CNIC is verified. You can now post requests and donate.", "/app");
    return { ok: true };
  });
}

/** The nearest compatible seeded donor answers the caller's fresh SOS request. */
export async function demoRespond(me, body) {
  return tx(async (c) => {
    const r = (await c.query("select * from requests where id = $1 for update", [String(body.requestId || "")])).rows[0];
    if (!r || r.uid !== me || r.status !== "open" || Date.now() - new Date(r.created_at).getTime() > 15 * 60_000) return { ok: false };
    const responders = r.data.responders || [];
    const donors = (await c.query("select * from profiles where seeded and status = 'approved' and role = 'user'")).rows
      .filter((u) => u.id !== me && !responders.includes(u.id) && u.data.isAvailable && u.data.bloodType && isCompatible(u.data.bloodType, r.data.bloodType) && Number.isFinite(u.data.lat))
      .map((u) => ({ u, km: distanceKm(u.data, r.data) })).filter((x) => x.km <= 15).sort((a, b) => a.km - b.km);
    if (!donors.length || responders.some((id) => donors.some((d) => d.u.id === id))) return { ok: false };
    const who = donors[0].u;
    await c.query("update requests set data = $2, updated_at = now() where id = $1", [r.id, { ...r.data, responders: [...responders, who.id] }]);
    const chatId = await ensureChat(c, me, who.id);
    await postMessage(c, chatId, who.id, `Hi ${String(r.data.name).split(" ")[0]}, I'm ${who.data.bloodType} and can donate at ${r.data.hospital}. When should I come?`);
    await notify(c, me, "response", `${who.data.fullName} can donate`, `${who.data.fullName} (${who.data.bloodType}) responded to your ${r.data.bloodType} request.`, `/chat/${chatId}`);
    return { ok: true, chatId };
  });
}

/** A seeded donor replies once to the caller's latest message. */
export async function demoReply(me, body) {
  return tx(async (c) => {
    const chat = (await c.query("select * from chats where id = $1 for update", [String(body.chatId || "")])).rows[0];
    if (!chat || !chat.participants.includes(me)) return { ok: false };
    const other = chat.participants.find((p) => p !== me);
    const op = await profile(other, c);
    const lastMsg = (await c.query("select sender from messages where chat_id = $1 order by created_at desc limit 1", [chat.id])).rows[0];
    if (!op?.seeded || !lastMsg || lastMsg.sender !== me) return { ok: false };
    const text = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    await postMessage(c, chat.id, other, text);
    await notify(c, me, "message", `New message from ${op.data.fullName}`, text, `/chat/${chat.id}`);
    return { ok: true };
  });
}

export async function health() {
  const r = await q("select (select count(*) from profiles)::int as profiles, (select count(*) from requests)::int as requests, (select count(*) from messages)::int as messages");
  return { ok: true, database: usingSupabase() ? "supabase-postgres" : "postgres (local dev)", auth: usingSupabase() ? "supabase-auth" : "dev", ...r.rows[0] };
}
