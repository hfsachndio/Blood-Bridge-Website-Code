/**
 * Talks to the real backend: Supabase Auth for sessions, the /api serverless functions
 * (service role, validated writes) and Supabase Realtime for live updates.
 * Without VITE_SUPABASE_URL (local dev) it falls back to the API's dev login.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;
export const usingSupabase = !!(URL_ && KEY_);

let sb: SupabaseClient | null = null;
export function supabase() {
  if (!usingSupabase) return null;
  sb ??= createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "bloodbridge-auth" } });
  return sb;
}

const DEV_KEY = "bloodbridge-dev-token";
let devToken: string | null = (() => { try { return localStorage.getItem(DEV_KEY); } catch { return null; } })();

export async function getToken(): Promise<string | null> {
  const c = supabase();
  if (c) { const { data } = await c.auth.getSession(); return data.session?.access_token ?? null; }
  return devToken;
}

export async function api<T = unknown>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const token = await getToken();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Signs in and returns the auth user id. */
export async function signInWithPassword(email: string, password: string): Promise<string> {
  const c = supabase();
  if (c) {
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error(error?.message === "Invalid login credentials" ? "Incorrect email or password." : error?.message || "Login failed.");
    return data.user.id;
  }
  const r = await api<{ token: string; uid: string }>("dev/login", { email, password });
  devToken = r.token; try { localStorage.setItem(DEV_KEY, r.token); } catch { /* ignore */ }
  return r.uid;
}

export async function signOut() {
  const c = supabase();
  if (c) await c.auth.signOut();
  devToken = null; try { localStorage.removeItem(DEV_KEY); } catch { /* ignore */ }
}

/** Current session's user id, if any. */
export async function sessionUid(): Promise<string | null> {
  const c = supabase();
  if (c) { const { data } = await c.auth.getSession(); return data.session?.user.id ?? null; }
  if (!devToken) return null;
  return devToken.split(".")[0] ?? null;
}

/** Subscribes to row changes on every app table; RLS limits events to rows this user can read. */
export function subscribeChanges(onChange: () => void): () => void {
  const c = supabase();
  if (!c) return () => {};
  const ch = c.channel("bloodbridge-live");
  for (const table of ["profiles", "requests", "donations", "records", "chats", "messages", "notifications"]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  ch.subscribe();
  return () => { void c.removeChannel(ch); };
}
