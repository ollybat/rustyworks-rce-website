/* Runs the real bot (bot/server.mjs) against a stand-in for Discord and a pretend website,
   and drives every command, button, menu, form and suggestion through it.

     node scripts/simulate-bot.mjs

   What it proves, without Discord, a token or npm install:
   - typed form values reach the bot (discord.js shapes, not the raw API);
   - every interaction gets its first answer inside Discord's three seconds, even when a save
     to the website or an RCON check is slow (the website here answers saves after 1.8 s);
   - no handler replies twice or edits before replying;
   - every reply, panel and form fits Discord's limits;
   - settings are really saved (the pretend website records every save) and the linked role
     and the log channels are really used.
   Exits non-zero if anything fails. RCON goes to 203.0.113.10, a documentation address that
   never answers, so those checks fail on purpose and exercise the slow path. */
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "sim-settings-token";
const SLOW_SAVE_MS = 1800;
const SLOW_CHECK_MS = 2000;

const links = Array.from({ length: 45 }, (_, i) => ({
  userId: "1000000000000" + String(210 + i).padStart(5, "0"), gamertag: i === 0 ? "PlayerOne" : "Player" + (i + 1), at: "2026-11-01T00:00:00.000Z", by: "100000000000000201",
}));
const initial = {
  ok: true,
  staffRoles: {},
  logChannels: {},
  servers: [{ id: "srv1", name: "Main", host: "203.0.113.10", port: 28016, hasPassword: true, password: "secret" }],
  kits: { binds: [{ emote: "salute", kits: ["STARTER"], cooldown: 60, roleId: null }], locked: false, authSpawn: {},
    giveCommand: 'kit givetoplayer {kit} "{player}"', listCommand: "kit list", known: [] },
  links,
  pending: [],
  linkPanel: null,
};

/* What the pretend website holds. Saves are merged into it the way worker.js merges them,
   so the bot's periodic re-read sees everything saved so far. */
const store = JSON.parse(JSON.stringify(initial));
function merge(into, body) {
  for (const key of ["staffRoles", "logChannels", "kits"]) if (body[key] && typeof body[key] === "object") into[key] = Object.assign({}, into[key], body[key]);
  for (const key of ["servers", "links", "pending"]) if (Array.isArray(body[key])) into[key] = body[key];
  if ("linkPanel" in body) into.linkPanel = body.linkPanel;
}
const writes = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const site = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url.startsWith("/api/bot/settings")) {
    if (req.headers["x-settings-token"] !== TOKEN) return send(403, { ok: false, reason: "bad-token" });
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || "{}");
      writes.push(body);
      merge(store, body);
      await delay(SLOW_SAVE_MS);
      return send(200, { ok: true });
    }
    return send(200, Object.assign({ ok: true }, store));
  }
  /* someone editing settings on the website's Settings page */
  if (req.url === "/__sim/edit" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    merge(store, JSON.parse(raw || "{}"));
    return send(200, { ok: true });
  }
  if (req.url === "/api/config-check") { await delay(SLOW_CHECK_MS); return send(200, { app: "spinback-rce" }); }
  if (req.url === "/__sim/writes") return send(200, writes);
  send(404, { ok: false });
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const siteUrl = "http://127.0.0.1:" + site.address().port;

/* The pretend Rust server: accepts RCON connections and never answers (see sim/net-sim.mjs). */
const silentSockets = new Set();
const silentRcon = createNetServer((socket) => { silentSockets.add(socket); socket.on("error", () => {}); socket.on("close", () => silentSockets.delete(socket)); });
await new Promise((r) => silentRcon.listen(0, "127.0.0.1", r));
const SIM_SILENT_RCON = "127.0.0.1:" + silentRcon.address().port;

/* The bot keeps a copy of its settings in a file; the simulation gives it a fresh one. */
const settingsDir = mkdtempSync(join(tmpdir(), "spinback-sim-"));
const SETTINGS_FILE = join(settingsDir, "settings.json");

function runBot(extraEnv, scenario, { stopWith } = {}) {
  const child = spawn(process.execPath, ["--import", join(repo, "scripts", "sim", "register.mjs"), join(repo, "bot", "server.mjs")], {
    cwd: repo,
    env: Object.assign({}, process.env, {
      PORT: "0",
      HOST: "127.0.0.1",
      DISCORD_BOT_TOKEN: "simsimsimsimsimsimsimsim.simsim.simsimsimsimsimsimsimsimsim",
      DISCORD_GUILD_ID: "1",
      BOT_SETTINGS_TOKEN: TOKEN,
      SITE_URL: siteUrl,
      SITE_ORIGIN: siteUrl,
      SETTINGS_RELOAD_MS: "2500",
      /* 203.0.113.10 never answers on CI (locally it may refuse at once): keep each silent
         RCON wait well above Discord's deferral point but short enough for the whole tour */
      RCON_TIMEOUT_MS: "2500",
      SETTINGS_FILE,
      SIM_SILENT_RCON,
      SIM_OWNER_ID: "100000000000000999",
      SIM_SCENARIO: join(repo, "scripts", "sim", scenario),
    }, extraEnv),
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve) => {
    let result = null;
    let output = "";
    let stopSentAt = null;
    child.stdout.on("data", (chunk) => {
      output += chunk;
      for (const line of String(chunk).split("\n")) {
        if (!line.startsWith("SIM_RESULT ")) continue;
        result = JSON.parse(line.slice(11));
        if (stopWith) { stopSentAt = Date.now(); child.kill(stopWith); }
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const killer = setTimeout(() => { child.kill("SIGKILL"); }, 300000);
    child.on("exit", (code, signal) => {
      clearTimeout(killer);
      resolve({ result, output, code, signal, stopMs: stopSentAt ? Date.now() - stopSentAt : null });
    });
  });
}

function report(name, run) {
  if (!run.result) {
    console.log(run.output.split("\n").slice(-40).join("\n"));
    console.log(name + ": the bot did not finish the simulation (exit code " + run.code + ").");
    return { total: 0, failed: 1, interactions: 0 };
  }
  console.log(name + ": " + run.result.interactions + " interactions, " + run.result.total + " checks, " + run.result.failed + " failed.");
  for (const f of run.result.failures) console.log("  FAIL " + f.name + (f.detail ? "\n       " + f.detail : ""));
  return run.result;
}

/* The bot's own HTTP API, checked while run 1 is up: Railway's health check says only "alive",
   public status leaks nothing internal, and the routes meant for the website's server side
   refuse anyone without BOT_SETTINGS_TOKEN. */
const portProbe = createServer();
await new Promise((r) => portProbe.listen(0, "127.0.0.1", r));
const botPort = portProbe.address().port;
await new Promise((r) => portProbe.close(r));
async function apiChecks() {
  const base = "http://127.0.0.1:" + botPort;
  const out = [];
  const request = (path, options) => fetch(base + path, Object.assign({ signal: AbortSignal.timeout(4000) }, options || {}));
  let health = null;
  for (let i = 0; i < 100 && !health; i++) {
    try { const r = await request("/healthz"); if (r.ok) health = await r.json(); } catch (e) { /* not up yet */ }
    if (!health) await new Promise((r) => setTimeout(r, 100));
  }
  out.push(["/healthz answers with liveness only", !!health && Object.keys(health).sort().join(",") === "ok,service"]);
  const pub = await (await request("/api/status")).json().catch(() => ({}));
  const secret = ["host", "port", "tokenPresent", "tokenSource", "tokenShape", "tokenLength", "lookedFor", "loginAttempts", "siteUrl", "ownerSource", "error", "guildInfo"];
  out.push(["public /api/status shows no internals", pub.online !== undefined && secret.every((k) => !(k in pub))]);
  const full = await (await request("/api/status", { headers: { "x-settings-token": TOKEN } })).json().catch(() => ({}));
  out.push(["the website (with the token) still gets full diagnostics", "tokenShape" in full && "guildInfo" in full]);
  for (const [path, method] of [["/api/guilds", "GET"], ["/api/guild", "GET"], ["/api/rcon/test", "POST"], ["/api/reconnect", "POST"]]) {
    const r = await request(path, Object.assign({ method }, method === "POST" ? { body: "{}", headers: { "content-type": "application/json" } } : {}));
    out.push([path + " refuses a request without the token", r.status === 403]);
  }
  const wrongToken = await request("/api/guilds", { headers: { "x-settings-token": TOKEN + "x" } });
  out.push(["a wrong token is refused too", wrongToken.status === 403]);
  const guilds = await request("/api/guilds", { headers: { "x-settings-token": TOKEN } });
  out.push(["the right token reads guild metadata", guilds.status === 200]);
  const getReconnect = await request("/api/reconnect", { headers: { "x-settings-token": TOKEN } });
  out.push(["reconnect needs POST", getReconnect.status === 405]);
  const privateRcon = await (await request("/api/rcon/test", { method: "POST", headers: { "content-type": "application/json", "x-settings-token": TOKEN },
    body: JSON.stringify({ host: "192.168.1.10", port: 28016, password: "x" }) })).json().catch(() => ({}));
  out.push(["RCON to a private address is refused", privateRcon.reason === "refused-host"]);
  const docRcon = await (await request("/api/rcon/test", { method: "POST", headers: { "content-type": "application/json", "x-settings-token": TOKEN },
    body: JSON.stringify({ host: "192.0.2.10", port: 28016, password: "x" }) })).json().catch(() => ({}));
  out.push(["RCON to a documentation range is refused", docRcon.reason === "refused-host"]);
  return out;
}

/* Run 1: the full tour, with the website keeping settings. */
const apiPromise = apiChecks();
const first = await runBot({ PORT: String(botPort) }, "scenario.mjs");
const api = await apiPromise;
if (first.result) console.log("Bot registered: /" + first.result.commands.join(", /"));
const one = report("Run 1 (website storage)", first);

/* Between runs: the settings file was written, whole, and owner-only (it holds passwords). */
const between = [];
let saved = null;
try { saved = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")); } catch (e) { saved = null; }
between.push(["the settings file is written", !!saved]);
between.push(["it holds the saved roles and servers", !!(saved && saved.staffRoles && saved.staffRoles.owner && Array.isArray(saved.servers) && saved.servers.length)]);
between.push(["it is readable by the bot's own user only (0600)", process.platform === "win32" || (existsSync(SETTINGS_FILE) && (statSync(SETTINGS_FILE).mode & 0o077) === 0)]);
between.push(["no half-written temp file is left", !existsSync(SETTINGS_FILE + ".tmp")]);

/* Run 2: a restart with no BOT_SETTINGS_TOKEN and a volume: settings come back from the file,
   the traffic guards work, and SIGTERM lets the bot finish and leave cleanly. */
const second = await runBot({ BOT_SETTINGS_TOKEN: "", SETTINGS_RELOAD_MS: "600000" }, "scenario-restart.mjs", { stopWith: "SIGTERM" });
const two = report("Run 2 (volume storage, restart)", second);
between.push(["SIGTERM ends the bot cleanly (exit 0)", second.code === 0]);
between.push(["the shutdown is quick (under 10 s)", second.stopMs !== null && second.stopMs < 10000]);
between.push(["the shutdown is logged", /shutting down \(SIGTERM\)/.test(second.output)]);
between.push(["the shutdown waits for the press still running", /1 interaction\(s\) still running/.test(second.output) && second.stopMs > 500]);
site.close();
for (const socket of silentSockets) socket.destroy();
silentRcon.close();
rmSync(settingsDir, { recursive: true, force: true });

for (const a of api) between.push(["HTTP API: " + a[0], a[1]]);
const betweenFailed = between.filter((b) => !b[1]);
console.log("HTTP API, storage and shutdown: " + between.length + " checks, " + betweenFailed.length + " failed.");
for (const b of betweenFailed) console.log("  FAIL " + b[0]);
const failed = one.failed + two.failed + betweenFailed.length;
console.log((one.interactions + two.interactions) + " interactions, " + (one.total + two.total + between.length) + " checks, " + failed + " failed.");
process.exit(failed ? 1 : 0);
