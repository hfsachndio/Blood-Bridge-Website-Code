import pg from "pg";

/** Supabase connection strings carry sslmode/pooler query params that node-postgres doesn't need. */
export function connectionConfig(url) {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname) || u.searchParams.get("host")?.startsWith("/");
  const host = u.searchParams.get("host");
  for (const k of [...u.searchParams.keys()]) if (k !== "host") u.searchParams.delete(k);
  return { connectionString: u.toString(), ...(host ? { host } : {}), ssl: local ? false : { rejectUnauthorized: false } };
}

export const dbUrl = () => process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;

let pool;
export function db() {
  if (!pool) {
    const url = dbUrl();
    if (!url) throw Object.assign(new Error("Database is not configured."), { status: 503 });
    pool = new pg.Pool({ ...connectionConfig(url), max: process.env.VERCEL ? 3 : 8, idleTimeoutMillis: 10000 });
  }
  return pool;
}
export const q = (text, params) => db().query(text, params);

export async function tx(fn) {
  const c = await db().connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; }
  finally { c.release(); }
}
