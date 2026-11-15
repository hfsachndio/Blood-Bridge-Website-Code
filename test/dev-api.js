// Local API server for `npm run dev` (Vite proxies /api here). Uses POSTGRES_URL or the local dev database.
import http from "node:http";
import handler from "../api/index.js";

process.env.POSTGRES_URL ||= "postgresql://postgres@localhost:5433/bb_dev";
const port = Number(process.env.API_PORT || 8787);
http.createServer((req, res) => { void handler(req, res); }).listen(port, () => console.log(`API on http://localhost:${port}`));
