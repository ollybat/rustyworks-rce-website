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
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "sim-settings-token";

/* Reserve a loopback port for the real HTTP listener so this simulation can also
   exercise the public health/status routes and the authenticated internal routes. */
const portProbe = createServer();
await new Promise((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolve);
});
const botPort = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
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

const child = spawn(process.execPath, ["--import", join(repo, "scripts", "sim", "register.mjs"), join(repo, "bot", "server.mjs")], {
  cwd: repo,
  env: Object.assign({}, process.env, {
    PORT: String(botPort),
    HOST: "127.0.0.1",
    DISCORD_BOT_TOKEN: "simsimsimsimsimsimsimsim.simsim.simsimsimsimsimsimsimsimsim",
    DISCORD_GUILD_ID: "1",
    BOT_SETTINGS_TOKEN: TOKEN,
    SITE_URL: siteUrl,
    SITE_ORIGIN: siteUrl,
    SETTINGS_RELOAD_MS: "2500",
    SIM_OWNER_ID: "100000000000000999",
    SIM_SCENARIO: join(repo, "scripts", "sim", "scenario.mjs"),
  }),
  stdio: ["ignore", "pipe", "pipe"],
});

let result = null;
let output = "";

const apiChecksPromise = (async function () {
  const base = "http://127.0.0.1:" + botPort;
  const failures = [];
  function check(name, passed, detail) {
    if (!passed) failures.push({ name: "HTTP API: " + name, detail: detail || "" });
  }
  async function request(path, options) {
    return fetch(base + path, Object.assign({ signal: AbortSignal.timeout(3000) }, options || {}));
  }

  let health = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await request("/healthz");
      if (response.ok) { health = response; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!health) {
    check("Railway health endpoint starts", false, "GET /healthz did not answer");
    return failures;
  }

  const healthData = await health.json().catch(() => ({}));
  check("Railway health endpoint is minimal", healthData.ok === true
    && healthData.service === "spinback-rce-bot"
    && Object.keys(healthData).sort().join(",") === "ok,service", JSON.stringify(healthData));

  const statusResponse = await request("/api/status");
  const statusData = await statusResponse.json().catch(() => ({}));
  const privateFields = [
    "host", "port", "tokenPresent", "tokenSource", "tokenShape", "tokenLength",
    "lookedFor", "loginAttempts", "siteUrl", "ownerKnown", "ownerSource",
    "forcedLogins", "gatewayDownSeconds", "error", "guildInfo",
  ];
  check("public status omits internal diagnostics", statusResponse.ok
    && privateFields.every((key) => !(key in statusData)), JSON.stringify(statusData));

  for (const [path, method, body] of [
    ["/api/reconnect", "POST", "{}"],
    ["/api/rcon/test", "POST", "{}"],
    ["/api/guild", "GET"],
    ["/api/guilds", "GET"],
  ]) {
    const response = await request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body } : {}),
    });
    check(path + " rejects anonymous access", response.status === 403, "got " + response.status);
  }

  const methodCheck = await request("/api/reconnect", {
    method: "GET",
    headers: { "x-settings-token": TOKEN },
  });
  check("reconnect requires POST even with the shared token", methodCheck.status === 405, "got " + methodCheck.status);

  const trustedGuilds = await request("/api/guilds", {
    headers: { "x-settings-token": TOKEN },
  });
  check("trusted Worker credential can read guild metadata", trustedGuilds.status === 200, "got " + trustedGuilds.status);
  return failures;
})();
child.stdout.on("data", (chunk) => {
  output += chunk;
  for (const line of String(chunk).split("\n")) if (line.startsWith("SIM_RESULT ")) result = JSON.parse(line.slice(11));
});
child.stderr.on("data", (chunk) => { output += chunk; });
const killer = setTimeout(() => { child.kill("SIGKILL"); }, 120000);
const code = await new Promise((r) => child.on("exit", r));
clearTimeout(killer);
site.close();

if (!result) {
  console.log(output.split("\n").slice(-40).join("\n"));
  console.log("The bot did not finish the simulation (exit code " + code + ").");
  process.exit(1);
}
const apiFailures = await apiChecksPromise;
console.log("Bot registered: /" + result.commands.join(", /"));
console.log(result.interactions + " interactions, " + result.total + " checks, " + result.failed + " interaction checks failed.");
for (const f of result.failures) console.log("  FAIL " + f.name + (f.detail ? "\n       " + f.detail : ""));
console.log("HTTP API: " + (8 - apiFailures.length) + " route checks passed, " + apiFailures.length + " failed.");
for (const f of apiFailures) console.log("  FAIL " + f.name + (f.detail ? "\n       " + f.detail : ""));
process.exit(result.failed || apiFailures.length ? 1 : 0);
