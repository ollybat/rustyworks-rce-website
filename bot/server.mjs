/* ==========================================================================
   Spinback RCE — the interactions endpoint, served as a plain Node process.
   --------------------------------------------------------------------------
   The handler in interactions-worker.js is written the Worker way: it takes a
   Request, reads the Discord signature and returns a Response. Node 20+ has all
   of that built in, so this file only has to hand it a request and post back the
   answer. No dependencies, no build step, nothing fetched at run time.

   Runs on Railway: it listens on PORT, answers GET /healthz so the platform can
   see it is alive, and passes every POST to the handler, which is where the
   signature check, the one-guild rule and the owner-only rule live.
   ========================================================================== */

import { createServer } from "node:http";
import handler from "./interactions-worker.js";

/* Read once at start-up, so a missing value is visible in the logs immediately. */
const env = {
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY || "",
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || "",
  DISCORD_GUILD_OWNER_ID: process.env.DISCORD_GUILD_OWNER_ID || "",
  SITE_URL: (process.env.SITE_URL || "https://spinback-j7ao5f.camelai.app").replace(/\/+$/, ""),
};

const PORT = Number(process.env.PORT || 8080);
const REQUIRED = ["DISCORD_PUBLIC_KEY", "DISCORD_GUILD_ID", "DISCORD_GUILD_OWNER_ID"];
const missing = REQUIRED.filter((key) => !env[key]);
if (missing.length) {
  console.warn("[spinback] not set: " + missing.join(", ") + " — Discord requests are refused until these exist");
}

/* Turn a Node request into the Request object the handler expects. */
function toRequest(req, body) {
  const host = req.headers.host || "localhost";
  const target = "http://" + host + (req.url || "/");
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) { for (const one of value) headers.append(key, String(one)); }
    else headers.set(key, String(value));
  }
  const method = req.method || "GET";
  const sendBody = method === "GET" || method === "HEAD" ? undefined : body;
  return new Request(target, { method, headers, body: sendBody });
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const method = req.method || "GET";
  const path = (req.url || "/").split("?")[0];

  /* Railway asks this to decide whether the deploy is alive. */
  if (method === "GET" && (path === "/" || path === "/healthz")) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "spinback-rce-bot", ok: true, interactions: "POST /", configured: missing.length === 0 }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const response = await handler.fetch(toRequest(req, body), env);
    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    console.log("[spinback] " + method + " " + path + " -> " + response.status + " in " + (Date.now() - started) + "ms");
  } catch (error) {
    console.error("[spinback] request failed: " + ((error && error.message) || String(error)));
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[spinback] interactions endpoint listening on " + PORT);
});
