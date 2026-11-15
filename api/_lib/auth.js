import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { q } from "./db.js";

export const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
export const usingSupabase = () => !!(SUPABASE_URL() && SERVICE_KEY());

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const DEV_SECRET = () => process.env.DEV_AUTH_SECRET || "blood-bridge-local-dev";
const sign = (uid) => crypto.createHmac("sha256", DEV_SECRET()).update(uid).digest("base64url");

const cache = new Map();
/** Resolves a bearer token to the Supabase user id (or the local dev token in development). */
export async function verify(token) {
  if (!token) return null;
  if (!usingSupabase()) {
    const [uid, mac] = token.split(".");
    if (!uid || !mac) return null;
    const a = Buffer.from(sign(uid)), b = Buffer.from(mac);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? uid : null;
  }
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.uid;
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, { headers: { apikey: SERVICE_KEY(), authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  if (cache.size > 500) cache.clear();
  cache.set(token, { uid: user.id, exp: Date.now() + 60_000 });
  return user.id;
}

/** Creates a confirmed auth user (Supabase Admin API) and returns its id. */
export async function createAuthUser(email, password, meta = {}) {
  if (!usingSupabase()) {
    const r = await q("insert into auth.users (email, encrypted_password) values ($1, $2) returning id", [email, await bcrypt.hash(password, 10)]).catch((e) => {
      if (e.code === "23505") throw new HttpError(409, "An account with this email already exists. Please log in.");
      throw e;
    });
    return r.rows[0].id;
  }
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY(), authorization: `Bearer ${SERVICE_KEY()}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.msg || body.message || body.error_description || body.error || "");
    if (res.status === 422 || /already/i.test(msg)) throw new HttpError(409, "An account with this email already exists. Please log in.");
    if (/password/i.test(msg)) throw new HttpError(400, msg);
    throw new HttpError(502, msg || "Could not create the account.");
  }
  return body.id;
}

export async function devLogin(email, password) {
  if (usingSupabase()) throw new HttpError(404, "Not found");
  const r = await q("select id, encrypted_password from auth.users where email = $1", [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.encrypted_password))) throw new HttpError(401, "Incorrect email or password.");
  return { uid: u.id, token: `${u.id}.${sign(u.id)}` };
}
