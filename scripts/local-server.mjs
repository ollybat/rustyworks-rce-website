/* Local test server: runs the built worker under plain Node, with the ASSETS binding
   backed by build/client and an in-memory stand-in for the STATUS_LOG bucket, so the
   whole site can be clicked through without wrangler or a Cloudflare account.

     node scripts/build.mjs && node scripts/local-server.mjs      # http://localhost:8787

   Upstream calls (bot API, item icons) go to the real internet, so they fail politely
   when offline - which is also a good test of the fallbacks. Optional: EXTRA_ENV='{"KEY":"v"}'
   adds variables to env. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const repo = resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8787);
const root = join(repo, "build", "client");
const worker = (await import(pathToFileURL(join(repo, "build", "server", "worker.js")).href + "?t=" + Date.now())).default;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4" };
const ASSETS = { async fetch(req) {
  const u = new URL(typeof req === "string" || req instanceof URL ? String(req) : req.url);
  let p = decodeURIComponent(u.pathname);
  const tries = p.endsWith("/") ? [p + "index.html"] : [p, p + ".html", p + "/index.html"];
  for (const t of tries) {
    const f = join(root, t);
    if (!f.startsWith(root)) break;
    try { const s = await stat(f); if (s.isFile()) return new Response(await readFile(f), { status: 200, headers: { "content-type": TYPES[extname(f)] || "application/octet-stream" } }); } catch {}
  }
  return new Response("Not found", { status: 404 });
} };
const store = new Map();
const R2 = {
  async get(k) { const v = store.get(k); if (!v) return null; return { body: v.body, httpMetadata: v.meta, async json() { return JSON.parse(new TextDecoder().decode(v.body)); }, async text() { return new TextDecoder().decode(v.body); } }; },
  async put(k, body, opts = {}) { const b = body instanceof ReadableStream ? new Uint8Array(await new Response(body).arrayBuffer()) : typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body); store.set(k, { body: b, meta: opts.httpMetadata }); },
  async delete(k) { (Array.isArray(k) ? k : [k]).forEach((x) => store.delete(x)); },
  async list(o = {}) { const objects = [...store.keys()].filter((k) => k.startsWith(o.prefix || "")).sort().map((key) => ({ key })); return { objects, truncated: false }; },
};
const env = { ASSETS, STATUS_LOG: R2, DISCORD_GUILD_ID: "1553825462315257868", ...(process.env.EXTRA_ENV ? JSON.parse(process.env.EXTRA_ENV) : {}) };
createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = new Request("http://localhost:" + port + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const pending = [];
  try {
    const out = await worker.fetch(r, env, { waitUntil: (p) => pending.push(p), passThroughOnException() {} });
    const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) { console.error("WORKER THREW", req.url, e); res.writeHead(500); res.end(String(e)); }
}).listen(port, () => console.log("listening " + port));
