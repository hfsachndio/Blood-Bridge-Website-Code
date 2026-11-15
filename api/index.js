import { HttpError, verify } from "./_lib/auth.js";
import * as app from "./_lib/app.js";

/** Single Vercel function; vercel.json rewrites /api/<path> to /api?path=<path>. */
export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const path = (url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+|\/+$/g, "");
  const method = req.method || "GET";
  res.setHeader("cache-control", "no-store");
  try {
    let body = req.body;
    if (method !== "GET" && (body === undefined || typeof body === "string")) {
      if (typeof body !== "string") { const chunks = []; for await (const ch of req) chunks.push(ch); body = Buffer.concat(chunks).toString("utf8"); }
      body = body ? JSON.parse(body) : {};
    }
    body ??= {};
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || null;
    const me = token ? await verify(token) : null;
    if (token && !me) throw new HttpError(401, "Your session has expired. Please log in again.");
    const authed = () => { if (!me) throw new HttpError(401, "Please log in first."); return me; };

    const routes = {
      "GET health": () => app.health(),
      "GET bootstrap": () => app.bootstrap(me),
      "POST sync": () => app.sync(authed(), body),
      "POST signup": () => app.signup(body),
      "POST auth/reset": () => app.passwordReset(body),
      "POST dev/login": () => app.login(body),
      "POST demo/verify": () => app.demoVerify(authed()),
      "POST demo/respond": () => app.demoRespond(authed(), body),
      "POST demo/reply": () => app.demoReply(authed(), body),
    };
    const fn = routes[`${method} ${path}`];
    if (!fn) throw new HttpError(404, "Not found");
    const out = await fn();
    res.statusCode = 200; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(out));
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error(e);
    res.statusCode = status; res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: status >= 500 && !e.status ? "Something went wrong. Please try again." : e.message }));
  }
}
