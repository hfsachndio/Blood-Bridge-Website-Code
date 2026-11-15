/**
 * Runs before `vite build` on Vercel: creates the Supabase schema (idempotent), then seeds the
 * demo community once: auth users via the Admin API, profiles, requests, offers and records.
 * Skips quietly when no database is configured (e.g. a plain local build).
 */
import pg from "pg";
import { seed } from "../src/lib/seed";
// @ts-expect-error plain JS module shared with the API
import { connectionConfig } from "../api/_lib/db.js";
// @ts-expect-error plain JS module shared with the API
import { SCHEMA_SQL, DEV_AUTH_SQL } from "../api/_lib/schema.js";
// @ts-expect-error plain JS module shared with the API
import { createAuthUser, usingSupabase } from "../api/_lib/auth.js";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) { console.log("[setup-db] no database configured, skipping"); process.exit(0); }
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) process.env.POSTGRES_URL = url;

const client = new pg.Client(connectionConfig(url));
await client.connect();
try {
  await client.query("select pg_advisory_lock(424242)");
  if (!usingSupabase()) await client.query(DEV_AUTH_SQL);
  await client.query(SCHEMA_SQL);
  console.log("[setup-db] schema ready (RLS + realtime publication)");
  const { rows } = await client.query("select count(*)::int as n from public.profiles");
  if (rows[0].n > 0) { console.log(`[setup-db] already seeded (${rows[0].n} profiles)`); }
  else {
    const data = seed();
    const map = new Map<string, string>();
    for (const u of data.users) {
      const found = await client.query("select id from auth.users where lower(email) = $1", [u.email]);
      const id = found.rows[0]?.id ?? (await createAuthUser(u.email, u.password!, { full_name: u.fullName }));
      map.set(u.uid, id);
    }
    // Swap the seed's readable ids ("u-ahmed") for the real auth user ids everywhere.
    const remap = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/"(u-[a-z]+)"/g, (m, k: string) => (map.has(k) ? `"${map.get(k)}"` : m)));
    const d = remap({ users: data.users, requests: data.requests, donations: data.donations, records: data.records });
    await client.query("begin");
    for (const u of d.users) {
      const { uid, email, password, role, status, seeded, phone, cnicNumber, cnicImage, ...pub } = u;
      void password; void seeded;
      await client.query("insert into public.profiles (id, role, status, seeded, data, created_at) values ($1,$2,$3,true,$4,$5)", [uid, role, status, pub, u.createdAt]);
      await client.query("insert into public.profile_private (id, email, data) values ($1,$2,$3)", [uid, email, { ...(phone ? { phone } : {}), ...(cnicNumber ? { cnicNumber } : {}), ...(cnicImage ? { cnicImage } : {}) }]);
    }
    for (const r of d.requests) await client.query("insert into public.requests (id, uid, status, data, created_at) values ($1,$2,$3,$4,$5)", [r.id, r.uid, r.status, r, r.createdAt]);
    for (const p of d.donations) await client.query("insert into public.donations (id, uid, status, data, created_at) values ($1,$2,$3,$4,$5)", [p.id, p.uid, p.status, p, p.createdAt]);
    for (const r of d.records) await client.query("insert into public.records (id, uid, data, created_at) values ($1,$2,$3,$4)", [r.id, r.donorUid, r, r.createdAt]);
    await client.query("commit");
    console.log(`[setup-db] seeded ${d.users.length} users, ${d.requests.length} requests, ${d.donations.length} offers, ${d.records.length} records`);
  }
} finally {
  await client.query("select pg_advisory_unlock(424242)").catch(() => {});
  await client.end();
}
