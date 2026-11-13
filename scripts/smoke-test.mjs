/* Smoke test for the whole site: builds it, then asks the built worker for every page and
   every file those pages, the service worker and the manifest refer to, without a browser or
   the network. Exits non-zero if anything is wrong, so CI can stop a broken deploy.

     node scripts/smoke-test.mjs

   What it would have caught: the /dashboard redirect that looped every page, the header logo
   that 404'd, and the offline page the service worker needed but nobody shipped. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnv, loadWorker } from "./local-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });

const client = join(repo, "build", "client");
const worker = await loadWorker(repo);
/* An address nothing listens on: no check below may depend on the internet. */
const env = createEnv(client, { BOT_API_ORIGIN: "http://127.0.0.1:9" });
const pending = [];
const ctx = { waitUntil(p) { pending.push(p); }, passThroughOnException() {} };
const ORIGIN = "http://localhost";
const HTML = { accept: "text/html" };

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed += 1; return; }
  failures.push(name + (detail ? " - " + detail : ""));
}
async function get(path, init = {}) {
  return worker.fetch(new Request(ORIGIN + path, init), env, ctx);
}

/* ---- pages ---- */
const pages = [
  ["/", "Spinback RCE"],
  ["/status", "Status"],
  ["/status.html", "Status"],
  ["/dashboard/kitbuilder.html", "Kit Studio"],
  ["/dashboard/colortext.html", "Colour Studio"],
  ["/404.html", "Page not found"],
  ["/offline.html", "Offline"],
];
for (const [path, title] of pages) {
  const r = await get(path, { headers: HTML });
  const body = await r.text();
  check("page " + path + " answers 200", r.status === 200, "got " + r.status);
  check("page " + path + " has its title", new RegExp("<title>[^<]*" + title).test(body));
  check("page " + path + " sends nosniff", r.headers.get("x-content-type-options") === "nosniff");
}

/* ---- redirects: /dashboard goes to the Kit Studio, and nothing else loops ---- */
for (const path of ["/dashboard", "/dashboard/"]) {
  const r = await get(path, { headers: HTML, redirect: "manual" });
  check(path + " redirects to the Kit Studio", r.status === 302 && /\/dashboard\/kitbuilder\.html$/.test(r.headers.get("location") || ""), r.status + " " + r.headers.get("location"));
}

/* ---- missing pages get the 404 page with a real 404 status ---- */
for (const path of ["/no-such-page", "/a/deeper/missing/page"]) {
  const r = await get(path, { headers: HTML });
  const body = await r.text();
  check(path + " answers 404 with the not-found page", r.status === 404 && body.includes("Page not found"), "got " + r.status);
}

/* ---- every file a page refers to ---- */
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".html")) htmlFiles.push(full);
  }
})(client);

const LIVE = /^\/(api|auth)(\/|$)/;            // answered by the bot or retired, checked below
const UPSTREAM = /^\/media\/(kitbuilder\/|entitys\/)/; // proxied from the operator's site
const refs = new Map();
for (const file of htmlFiles) {
  const pagePath = "/" + relative(client, file).split("\\").join("/");
  const src = readFileSync(file, "utf8").replace(/<script\b[^>]*type="application\/ld\+json"[\s\S]*?<\/script>/g, "");
  for (const m of src.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const ref = m[1].trim();
    if (!ref || /^(https?:|mailto:|data:|javascript:|#|tel:)/i.test(ref) || ref.startsWith("//")) continue;
    const target = new URL(ref, ORIGIN + pagePath).pathname;
    if (LIVE.test(target) || UPSTREAM.test(target)) continue;
    if (!refs.has(target)) refs.set(target, pagePath);
  }
}
/* the service worker's precache list: one missing file stops it installing at all */
const sw = readFileSync(join(client, "sw.js"), "utf8");
const offline = (/const OFFLINE = '([^']+)'/.exec(sw) || [])[1];
const keep = ((/const KEEP = \[([^\]]*)\]/.exec(sw) || [])[1] || "").match(/'[^']+'/g) || [];
for (const entry of keep) {
  const path = entry === "OFFLINE" ? offline : entry.slice(1, -1);
  refs.set(path, "sw.js precache");
}
if (offline) refs.set(offline, "sw.js precache");
/* manifest icons */
for (const name of ["manifest.json", "manifest.webmanifest"]) {
  try {
    const manifest = JSON.parse(readFileSync(join(client, name), "utf8"));
    for (const icon of manifest.icons || []) refs.set(new URL(icon.src, ORIGIN + "/").pathname, name);
  } catch {}
}
/* sitemap */
const sitemap = readFileSync(join(client, "sitemap.xml"), "utf8");
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) refs.set(new URL(m[1]).pathname, "sitemap.xml");

for (const [path, from] of refs) {
  const r = await get(path, { headers: { accept: path.endsWith(".html") || !/\.[a-z0-9]+$/i.test(path) ? "text/html" : "*/*" } });
  check("referenced file " + path + " (from " + from + ") answers 200", r.status === 200, "got " + r.status);
  await r.arrayBuffer();
}

/* ---- retired and owner-only endpoints ---- */
{
  const r = await get("/auth/me", { headers: { accept: "application/json" } });
  const data = await r.json().catch(() => ({}));
  check("/auth/me says sign-in is retired", r.status === 200 && data.retired === true && data.authenticated === false);
  const setup = await get("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("/api/setup is shut", setup.status === 410, "got " + setup.status);
  const owner = await get("/api/owner/servers", { headers: { accept: "application/json" } });
  check("/api/owner/* refuses a visitor with no session", owner.status >= 400 && owner.status < 500 || owner.status === 503, "got " + owner.status);
  const settings = await get("/api/bot/settings", { headers: { "x-settings-token": "guess" } });
  check("/api/bot/settings refuses without the shared token", settings.status === 503 || settings.status === 403, "got " + settings.status);
}

/* ---- the website API proxy is read-only ---- */
{
  const r = await get("/api/status", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  check("the website API proxy rejects write methods", r.status === 405 && data.error === "method_not_allowed", "got " + r.status + " " + JSON.stringify(data));
}

/* ---- the status monitor's arithmetic ---- */
{
  const hour = (t) => {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + "-" + p(d.getUTCHours());
  };
  const now = Date.now();
  const samples = [
    { t: now - 120000, ms: 100, ok: true },
    { t: now - 90000, ms: 300, ok: true },
    { t: now - 60000, ok: false },
    { t: now - 30000, ms: 200, ok: true },
  ];
  const key = "history/" + hour(now) + ".json";
  /* all four inside the current hour unless the hour just turned; then skip the check */
  if (samples.every((s) => hour(s.t) === hour(now))) {
    await env.STATUS_LOG.put(key, JSON.stringify(samples));
    const r = await get("/api/history?hours=24", { headers: { accept: "application/json" } });
    const data = await r.json().catch(() => ({}));
    const totals = data.totals || {};
    check("/api/history answers", r.status === 200 && data.available === true, "got " + r.status);
    check("history counts every check", totals.checks === 4, JSON.stringify(totals));
    check("history counts the failure", totals.failures === 1, JSON.stringify(totals));
    check("history uptime is 75%", totals.uptimePct === 75, JSON.stringify(totals));
    check("history average is over answered checks only", totals.avgMs === 200, JSON.stringify(totals));
    check("history has 24 hourly buckets", Array.isArray(data.buckets) && data.buckets.length === 24, String(data.buckets && data.buckets.length));
    check("history finds the incident", Array.isArray(data.incidents) && data.incidents.length === 1);
  }
}

await Promise.allSettled(pending);

console.log("\n" + passed + " checks passed, " + failures.length + " failed.");
if (failures.length) {
  for (const f of failures) console.log("  FAIL " + f);
  process.exit(1);
}
