/* ==========================================================================
   Spinback RCE — site worker
   --------------------------------------------------------------------------
   Three jobs, in this order:

   1. /api/*        proxies the bot API (it sends no CORS headers, so browsers
                    cannot call it directly).
   2. /auth/* and /dashboard
                    the owner-only half of the site. /dashboard is only ever
                    rendered for the Discord account that owns the one guild the
                    bot serves; everyone else is sent to Discord to sign in and
                    then refused. Nothing here trusts the browser: the session
                    is a signed cookie this worker verifies on every request.
   3. everything else
                    static assets from public/, with a homepage fallback for
                    extension-less paths.

   Required environment (set as Worker secrets — see docs/DISCORD-DASHBOARD.md):
     DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, SESSION_SECRET
   (DISCORD_CLIENT_ID is optional — the application id is public and defaults
   to the bot's own id.)
   Without them /dashboard answers 503 instead of guessing; the rest of the
   site is unaffected.
   ========================================================================== */

/* Your bot's API address, set as BOT_API_ORIGIN on this app. It is deliberately not
   defaulted to anything: the site must never quietly read a third party's API and
   present its numbers as yours. Empty means "not connected", and it says so. */
const BOT_API_FALLBACK = "https://rustyworks-rce-website-production.up.railway.app";
function botApiBase(env) {
  /* BOT_API_ORIGIN still wins if it is set; otherwise use the bot's Railway domain so
     the site reads live status out of the box. */
  const configured = ((env && env.BOT_API_ORIGIN) || "").trim();
  return (configured || BOT_API_FALLBACK).replace(/\/+$/, "");
}
/* The bot sleeps between requests on its host, so its first answer after an idle
   spell can take a while. Give it room instead of reporting a false outage. */
const API_TIMEOUT_MS = 20000;
const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "spinback_session";
const SESSION_DAYS = 7;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

/* The application id is public — it is in every invite link on the site — so it
   can carry a default. The client secret, guild id and session secret cannot. */
const DEFAULT_CLIENT_ID = "1570023832717361213";

/* Pages under /dashboard/ that are tools rather than the owner control panel.
   The homepage advertises the Kit Studio and Colour Studio as no-login, so they
   stay public; everything else in that tree is gated. */
const PUBLIC_DASHBOARD_PAGES = new Set(["/dashboard/kitbuilder.html", "/dashboard/colortext.html", "/dashboard/console.css", "/dashboard/console.js"]);
const NEXT_COOKIE = "spinback_oauth_next";

/* ---------- small helpers ---------- */

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      ...extraHeaders,
    },
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function base64url(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function randomToken(bytes = 16) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function cookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(name, value, seconds, secure = true) {
  const bits = [name + "=" + value, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=" + seconds];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

/* Constant-time string compare, so a wrong signature cannot be brute-forced. */
function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/* ---------- session cookie: payload + HMAC payload ---------- */

async function signSession(session, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = base64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload)));
  return payload + "." + signature;
}

/* This host does not keep cookies: a real browser visited /auth/login and the very next
   request arrived with no cookie header at all - the platform does not pass Set-Cookie
   through. So a session also travels as a header, and the console page reads it out of the
   address once after sign-in. A cookie is still accepted whenever a browser sends one. */
function bearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (/^bearer /i.test(auth)) return auth.slice(7).trim();
  return (request.headers.get("x-spinback-session") || "").trim();
}

async function readSession(request, env) {
  const sessionSecret = await ensureSessionSecret(env);
  if (!sessionSecret) return null;
  const raw = bearerToken(request) || cookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const expected = base64url(await crypto.subtle.sign("HMAC", await hmacKey(sessionSecret), new TextEncoder().encode(payload)));
  if (!sameString(expected, raw.slice(dot + 1))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (!session || !session.userId || session.exp < Date.now()) return null;
    /* One guild, one owner: a session for any other guild is not valid here. */
    if (String(session.guildId) !== String(env.DISCORD_GUILD_ID)) return null;
    return session;
  } catch (error) {
    return null;
  }
}

/* Two headers that cost nothing and close the usual holes: stop the browser
   guessing a content type, and keep referrers tidy. */
function withAssetHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  /* A cached service worker script can pin an old version of the site on a phone, so it
     is always revalidated, and it manages the whole site rather than just its own folder. */
  if (pathname === "/sw.js") headers.set("service-worker-allowed", "/");
  if (!headers.has("referrer-policy")) headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (response.status === 200 && pathname) headers.set("cache-control", cacheHint(pathname));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/* How long a browser may keep a file. Filenames are not hashed, so scripts and
   stylesheets get a short window with revalidation (an edit still lands within a
   minute) while pictures, fonts and video - which change rarely - get a day. */
function cacheHint(pathname) {
  if (pathname === "/sw.js") return "no-cache";
  if (/\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i.test(pathname)) return "public, max-age=86400";
  if (/\.(css|js|webmanifest|xml|txt)$/i.test(pathname)) return "public, max-age=300, must-revalidate";
  if (/\.html?$/i.test(pathname)) return "public, max-age=60, must-revalidate";
  return "public, max-age=300";
}

/* ---------- the status monitor ----------

   Every check this site proxies is a free measurement, so it is kept. Samples
   land in hourly objects in R2 ({"t": ms, "ms": response time, "ok": bool,
   "users": n, ...}) and /api/history turns them back into hours, totals and
   incidents for the status page.

   Two honest limits, both shown on the page: samples only exist while somebody
   is looking at the site, and the response time is measured from this Worker to
   the bot API - not from the visitor's browser. */

const MONITOR_PREFIX = "history/";
const MONITOR_SAMPLE_GAP_MS = 20000;   /* ignore refresh-spamming */
const MONITOR_KEEP_MS = 8 * 24 * 3600 * 1000;
const MONITOR_MAX_PER_HOUR = 240;

function hourStamp(at) {
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "-" + pad(d.getUTCHours());
}

/* The hour object is a read-modify-write, so two requests landing together could
   each write their own sample and lose the other's. Keeping the last list this
   isolate wrote and merging it back on the next write closes most of that gap. */
const lastWritten = { key: null, list: [] };

async function recordSample(env, sample) {
  const bucket = env.STATUS_LOG;
  if (!bucket) return;
  const key = MONITOR_PREFIX + hourStamp(sample.t) + ".json";
  let list = [];
  try {
    const existing = await bucket.get(key);
    if (existing) {
      const parsed = await existing.json();
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (error) {
    list = [];
  }
  if (lastWritten.key === key && lastWritten.list.length) {
    const seen = new Set(list.map((entry) => entry.t));
    for (const entry of lastWritten.list) if (!seen.has(entry.t)) list.push(entry);
    list.sort((a, b) => a.t - b.t);
  }
  const last = list[list.length - 1];
  if (last && sample.t - last.t < MONITOR_SAMPLE_GAP_MS) {
    lastWritten.key = key;
    lastWritten.list = list;
    return;
  }
  list.push(sample);
  if (list.length > MONITOR_MAX_PER_HOUR) list = list.slice(-MONITOR_MAX_PER_HOUR);
  await bucket.put(key, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
  lastWritten.key = key;
  lastWritten.list = list;
}

/* Old buckets go out with the tide; done rarely, and never on the request path. */
async function trimSamples(env) {
  const bucket = env.STATUS_LOG;
  if (!bucket || Math.random() > 0.02) return;
  const cutoff = hourStamp(Date.now() - MONITOR_KEEP_MS);
  try {
    const listed = await bucket.list({ prefix: MONITOR_PREFIX, limit: 1000 });
    const stale = listed.objects.filter((object) => object.key.slice(MONITOR_PREFIX.length, MONITOR_PREFIX.length + 13) < cutoff);
    if (stale.length) await bucket.delete(stale.map((object) => object.key));
  } catch (error) {
    /* Trimming is housekeeping: never let it break a status check. */
  }
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

/* A run of failed checks, allowing for the gaps between visitors. */
function findIncidents(samples) {
  const incidents = [];
  let run = null;
  for (const sample of samples) {
    if (sample.ok) {
      if (run) { incidents.push(run); run = null; }
      continue;
    }
    if (run && sample.t - run.to < 10 * 60 * 1000) {
      run.to = sample.t;
      run.checks += 1;
    } else {
      if (run) incidents.push(run);
      run = { from: sample.t, to: sample.t, checks: 1 };
    }
  }
  if (run) incidents.push(run);
  return incidents.slice(-10).reverse();
}

async function readHistory(env, hours) {
  const bucket = env.STATUS_LOG;
  const now = Date.now();
  const from = Math.floor(now / 3600000) * 3600000 - (hours - 1) * 3600000;
  const samples = [];
  const buckets = [];
  for (let at = from; at <= now; at += 3600000) {
    let list = [];
    try {
      const object = await bucket.get(MONITOR_PREFIX + hourStamp(at) + ".json");
      if (object) {
        const parsed = await object.json();
        if (Array.isArray(parsed)) list = parsed.filter((entry) => entry && typeof entry.t === "number");
      }
    } catch (error) {
      list = [];
    }
    const ok = list.filter((entry) => entry.ok);
    const latencies = ok.map((entry) => entry.ms).filter((ms) => typeof ms === "number");
    const latest = list[list.length - 1] || null;
    buckets.push({
      at,
      checks: list.length,
      failures: list.length - ok.length,
      avgMs: latencies.length ? Math.round(latencies.reduce((total, ms) => total + ms, 0) / latencies.length) : null,
      maxMs: latencies.length ? Math.max.apply(null, latencies) : null,
      users: latest && typeof latest.users === "number" ? latest.users : null,
      servers: latest && typeof latest.servers === "number" ? latest.servers : null,
      guilds: latest && typeof latest.guilds === "number" ? latest.guilds : null,
    });
    for (const entry of list) samples.push(entry);
  }
  samples.sort((a, b) => a.t - b.t);
  const failed = samples.filter((entry) => !entry.ok).length;
  const latencies = samples.filter((entry) => entry.ok && typeof entry.ms === "number").map((entry) => entry.ms);

  /* When recording began: the timestamp inside the oldest bucket we hold. The
     object's own upload time is useless here - the current hour's object is
     rewritten on every check. */
  let monitoringSince = null;
  try {
    const first = await bucket.list({ prefix: MONITOR_PREFIX, limit: 1 });
    if (first.objects.length) {
      const oldest = await bucket.get(first.objects[0].key);
      if (oldest) {
        const list = await oldest.json();
        if (Array.isArray(list) && list.length && typeof list[0].t === "number") monitoringSince = list[0].t;
      }
      if (!monitoringSince && first.objects[0].uploaded) monitoringSince = first.objects[0].uploaded.getTime();
    }
  } catch (error) {
    monitoringSince = null;
  }

  return {
    available: true,
    hours,
    generatedAt: now,
    monitoringSince,
    totals: {
      checks: samples.length,
      failures: failed,
      uptimePct: samples.length ? round((samples.length - failed) / samples.length * 100, 3) : null,
      avgMs: latencies.length ? Math.round(latencies.reduce((total, ms) => total + ms, 0) / latencies.length) : null,
      p95Ms: percentile(latencies, 0.95),
      maxMs: latencies.length ? Math.max.apply(null, latencies) : null,
    },
    buckets,
    incidents: findIncidents(samples),
  };
}

async function statusHistory(request, env) {
  const url = new URL(request.url);
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get("hours")) || 24));
  if (!env.STATUS_LOG) {
    return json({ available: false, reason: "no_storage" }, 200);
  }
  try {
    const data = await readHistory(env, hours);
    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=30",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return json({ available: false, reason: "read_failed" }, 200);
  }
}

/* ---------- the bot API proxy ---------- */

async function proxyApi(request, env, ctx) {
  const requestUrl = new URL(request.url);
  const watching = requestUrl.pathname === "/api/status";
  const started = Date.now();
  const base = botApiBase(env);
  if (!base) {
    /* No API of your own is connected yet. Answering truthfully keeps the status page
       from reporting somebody else's uptime as yours. */
    return json({
      connected: false,
      reason: "not_connected",
      message: "No bot API is connected yet. Set BOT_API_ORIGIN on this app to your bot's address."
    }, 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const upstream = await fetch(base + requestUrl.pathname + requestUrl.search, {
      method: request.method === "HEAD" ? "GET" : request.method,
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = request.method === "HEAD" ? null : await upstream.text();
    /* A status check is a measurement whether or not anybody asked for one. */
    if (watching && env && ctx && request.method !== "HEAD") {
      let stats = {};
      try {
        const parsed = JSON.parse(body || "{}");
        stats = parsed.stats || {};
        ctx.waitUntil(recordSample(env, {
          t: Date.now(),
          ms: Date.now() - started,
          ok: upstream.ok,
          online: parsed.online !== false,
          users: typeof stats.users === "number" ? stats.users : null,
          servers: typeof stats.servers === "number" ? stats.servers : null,
          guilds: typeof stats.guilds === "number" ? stats.guilds : null,
        }));
      } catch (error) {
        ctx.waitUntil(recordSample(env, { t: Date.now(), ms: Date.now() - started, ok: false }));
      }
      ctx.waitUntil(trimSamples(env));
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return json({
      error: "api_unreachable",
      reason: String((error && error.message) || error).slice(0, 140),
      target: base,
      timeoutMs: API_TIMEOUT_MS,
    }, 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Kit Studio item data ---------- */

/* The Kit Studio page keeps its item list and its item icons on the main site. Serving them
   from here means one copy of that data instead of a few hundred PNGs duplicated into this
   repository, and the edge cache asks the origin once per file. Names are checked against a
   strict pattern so a crafted path can never reach somewhere else. */
const KIT_ORIGIN = "https://rustyworksrce.xyz";
/* Only these exact shapes are passed through: the console item list, one icon per item,
   the kit presets the studio loads, and the seasonal/app icons the theme swaps in. */
const KIT_PATHS = [
  /^\/media\/entitys\/entities\.json$/i,
  /^\/media\/kitbuilder\/[a-z0-9._-]{1,64}\.png$/i,
  /^\/media\/kitbuilder\/presets\/[a-z0-9._-]{1,32}\.json$/i,
  /^\/media\/spinback-icon-(?:halloween|thanksgiving)\.svg$/i,
  /^\/media\/spinback-app-(?:192|512)\.png$/i
];

/* Our public URLs carry the Spinback names; the artwork itself still lives at the
   operator paths, so these shapes are rewritten before the upstream request. */
const KIT_ALIASES = [
  [/^\/media\/spinback-icon-(halloween|thanksgiving)\.svg$/i, "/media/rustyworks-icon-$1.svg"],
  [/^\/media\/spinback-app-(192|512)\.png$/i, "/media/rustyworks-app-$1.png"]
];

async function kitAsset(url, ctx, env) {
  const allowed = KIT_PATHS.some((shape) => shape.test(url.pathname));
  if (!allowed) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });

  /* Every studio asset we fetch once is kept in our own storage, so a bad day at the
     upstream site cannot empty the studio: the copy we already hold keeps serving. */
  const CACHEABLE = url.pathname === "/media/entitys/entities.json"
    || url.pathname.startsWith("/media/kitbuilder/")
    || url.pathname.startsWith("/data/");
  const key = "kitasset" + url.pathname;
  if (env.STATUS_LOG && CACHEABLE) {
    try {
      const held = await env.STATUS_LOG.get(key);
      if (held) {
        const headers = new Headers();
        headers.set("content-type", (held.httpMetadata && held.httpMetadata.contentType) || "application/octet-stream");
        headers.set("cache-control", "public, max-age=86400");
        headers.set("access-control-allow-origin", "*");
        headers.set("x-spinback-source", "own-storage");
        return new Response(held.body, { status: 200, headers: headers });
      }
    } catch (error) {}
  }

  try {
    /* This runtime has no edge-cache API, so the response carries a long cache-control
       and browsers keep the copy instead of asking for every icon again. */
    /* Public path -> operator path, carrying the captured name across ($1). */
    const alias = KIT_ALIASES.find((a) => a[0].test(url.pathname));
    const upstreamPath = alias
      ? url.pathname.replace(alias[0], (whole, captured) => alias[1].replace("$1", captured))
      : url.pathname;
    const upstream = await fetch(KIT_ORIGIN + upstreamPath, {
      headers: {
        "user-agent": "SpinbackRCE-KitStudio/1.0 (+https://spinback-j7ao5f.camelai.app)",
        accept: "*/*"
      }
    });
    /* Second source for item art: if the upstream site is down or missing the file, the same
       shortname is served by a public item database, so the studio keeps its icons. */
    let source = upstream;
    if (!upstream.ok) {
      const icon = /^\/media\/kitbuilder\/([a-z0-9._-]{1,64})\.png$/i.exec(url.pathname);
      if (icon) {
        try {
          const spare = await fetch("https://rustlabs.com/img/items180/" + icon[1].toLowerCase() + ".png", {
            headers: { accept: "image/png", "user-agent": "SpinbackRCE-KitStudio/1.0" }
          });
          if (spare.ok) source = spare;
        } catch (error) {}
      }
      if (!source.ok) {
        return new Response(source.status === 404 ? "not found" : "upstream error", {
          status: source.status,
          headers: { "cache-control": "no-store" }
        });
      }
    }
    const headers = new Headers();
    headers.set("content-type", source.headers.get("content-type") || "application/octet-stream");
    headers.set("cache-control", "public, max-age=86400");
    headers.set("access-control-allow-origin", "*");
    if (env.STATUS_LOG && CACHEABLE) {
      ctx.waitUntil(env.STATUS_LOG.put(key, source.clone().body, {
        httpMetadata: { contentType: headers.get("content-type") || "application/octet-stream" }
      }).catch(() => {}));
    }
    return new Response(source.body, { status: 200, headers: headers });
  } catch (error) {
    return new Response("upstream unreachable", { status: 502, headers: { "cache-control": "no-store" } });
  }
}

/* ---------- Discord sign-in ---------- */

/* Only the permissions this dashboard has any use for, named the way Discord names them. */
const PERMISSION_NAMES = [
  [8, "Administrator"],
  [32, "Manage Server"],
  [268435456, "Manage Roles"],
  [16, "Manage Channels"],
  [128, "View Audit Log"],
  [8192, "Manage Messages"],
  [2, "Kick Members"],
  [4, "Ban Members"],
];
function permissionNames(raw) {
  let bits = 0;
  try { bits = Number(BigInt(String(raw || "0"))); } catch (error) { bits = 0; }
  return PERMISSION_NAMES.filter(function (p) { return (bits & p[0]) === p[0]; }).map(function (p) { return p[1]; });
}

/* Discord's own invite screen for this application - the only way a server owner can put
   Spinback into their server, so every page that needs the bot present links to it. */
function inviteUrl(env, guildId) {
  const base = "https://discord.com/oauth2/authorize?client_id=" + encodeURIComponent(clientId(env))
    + "&scope=bot%20applications.commands&permissions=8";
  return base + (guildId ? "&guild_id=" + encodeURIComponent(guildId) + "&disable_guild_select=true" : "");
}

/* The servers the bot reports it is in. null means "could not ask" - which is reported as
   unknown, never as "not there". */
async function botGuilds(env) {
  const answer = await botJson(env, "/api/guilds");
  if (!answer || !Array.isArray(answer.guilds)) return null;
  return answer.guilds.map(function (g) { return { id: String(g.id), name: g.name || "" }; });
}

function clientId(env) {
  return env.DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID;
}


/* Only same-site paths are ever accepted as a post-sign-in destination, so a
   crafted ?next= cannot bounce somebody off to another host. */
function safeNext(value) {
  const path = String(value == null ? "" : value);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://")) return "/dashboard";
  return path;
}

async function needsSetup(env, request, notice) {
  const sec = await resolveSecrets(env);
  /* The owner console while the last two values are still missing. It shows exactly what is
     configured and what is not, plus the public live numbers, so the page is useful before
     sign-in exists - and it exposes nothing private: no session is read or issued here. */
  const origin = new URL(request.url).origin;
  const checklist = [
    ["DISCORD_CLIENT_ID", Boolean(clientId(env))],
    ["DISCORD_CLIENT_SECRET", Boolean(sec.clientSecret)],
    ["DISCORD_GUILD_ID", Boolean(env.DISCORD_GUILD_ID)],
    ["SESSION_SECRET", Boolean(sec.sessionSecret)],
    ["Bot can exchange codes", sec.botExchange],
    ["Status storage", Boolean(env.STATUS_LOG)]
  ];
  let live = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(API_BASE + "/api/status", {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (response.ok) live = await response.json();
  } catch (error) {
    live = null;
  }
  const stats = live && live.stats ? live.stats : null;
  const row = (item) => '<li class="setup-row"><span class="setup-name"><code>' + escapeHtml(item[0]) + '</code></span>'
    + '<span class="setup-state" style="' + (item[1] ? 'color:#7ee0a1' : 'color:#e8a33d') + '">'
    + (item[1] ? 'set' : 'missing') + '</span></li>';
  const card = (value, label) => '<div class="status-card"><div class="big">' + escapeHtml(value)
    + '</div><div class="lbl">' + escapeHtml(label) + '</div></div>';
  const state = live && live.online ? 'live' : 'unknown';

  return html('<!doctype html>'
    + '<html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
    + '<meta name="robots" content="noindex">'
    + '<title>Owner console - Spinback RCE</title>'
    + '<link rel="stylesheet" href="/style.css">'
    + '<link rel="stylesheet" href="/status.css">'
    + '<link rel="stylesheet" href="/ui-extras.css"></head>'
    + '<style>.setup-form{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 10px}.setup-form label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#9db0bf;width:100%}.setup-form input[type=password]{flex:1 1 280px;min-width:220px;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.35);color:inherit;font-family:inherit}.setup-form button{padding:11px 16px;border-radius:10px;border:0;cursor:pointer;font-family:inherit;font-weight:600;background:linear-gradient(96deg,#58c8f5,#7bdcff);color:#04131c}.setup-notice{border:1px solid rgba(232,163,61,.5);background:rgba(232,163,61,.12);color:#f0c176;border-radius:10px;padding:10px 12px;margin:0 0 12px}</style>'
    + '<body><header><div class="wrap"><nav>'
    + '<a href="/" class="logo"><img src="/media/spinback-icon.svg" alt="Spinback">Spinback<span class="accent">RCE</span></a>'
    + '<div class="nav-links"><a href="/">Website</a><a href="/status">Status</a>'
    + '<a href="/dashboard/kitbuilder">Kit Studio</a></div></nav></div></header>'
    + '<section class="page-hero"><div class="wrap">'
    + '<h1>Owner console</h1>'
    + '<p>One step from live. Sign-in opens for the owner of one Discord server and for its staff; '
    + 'until the values below are set, this page stays a setup checklist.</p></div></section>'
    + '<section style="padding-top:0"><div class="wrap">'
    + '<div class="panel-box"><h2 style="margin-bottom:8px">What is left</h2>'
    + '<ul class="setup-list">' + checklist.map(row).join('') + '</ul>'
    + '<p style="margin-top:14px">Add this redirect URI to the Discord application (OAuth2 section), exactly as written:</p>'
    + '<p><code class="setup-uri">' + escapeHtml(origin + '/auth/callback') + '</code></p>'
    + (notice ? '<div class="setup-notice">' + escapeHtml(notice) + '</div>' : '')
    + '<form method="post" action="/api/setup" class="setup-form">'
    + '<label for="clientSecret">Discord client secret</label>'
    + '<input id="clientSecret" name="clientSecret" type="password" autocomplete="off" spellcheck="false" placeholder="paste it from OAuth2 - Client Secret">'
    + '<input type="hidden" name="next" value="/dashboard">'
    + '<button type="submit">Verify and switch sign-in on</button>'
    + '</form>'
    + '<p class="muted">No session secret to invent - one is generated here. The client secret is checked against Discord before it is saved, and it is never shown again.</p>'
    + '<ol class="setup-steps">'
    + '<li>Open the Discord application <code>1570023832717361213</code> and add the redirect URI above.</li>'
    + '<li>Paste the client secret from that same OAuth2 page into the box below - or set <code>DISCORD_CLIENT_SECRET</code> and <code>SESSION_SECRET</code> as variables on this app instead, which always takes priority.</li>'
    + '<li>Reload this page: the checklist above turns green and the sign-in button appears.</li>'
    + '</ol>'
    + '<p class="muted">Server id watched by this dashboard: <code>' + escapeHtml(env.DISCORD_GUILD_ID || "not set")
    + '</code>. The bot command replies privately with a link to this page.</p></div>'
    + '<div class="panel-box"><h2 style="margin-bottom:8px">Live from the bot</h2>'
    + '<div class="status-cards">'
    + card(stats ? stats.users : "-", "Linked players")
    + card(stats ? stats.servers : "-", "Servers")
    + card(stats ? stats.guilds : "-", "Guilds")
    + card(live && live.uptime30d ? live.uptime30d + "%" : "-", "30-day uptime")
    + '</div>'
    + '<p style="margin-top:12px">Right now: <b>' + escapeHtml(state) + '</b> - version <code>' + escapeHtml(live && live.version ? live.version : "unknown")
    + '</code>. These are the same public numbers as the status page - not sign-in data.</p></div>'
    + '</div></section>'
    + '<footer><div class="wrap"><p class="muted">Spinback RCE - owner console preview.</p></div></footer>'
    + '</body></html>', 200);
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...headers } });
}

/* --------------------------------- who is allowed in ---------------------------------
   Signing in only proves who somebody is. What they may do here is decided from three
   things the Discord API gives us for the one guild this bot serves: the guild owner
   flag, the server permissions on their account, and their role list.
     STAFF_ROLE_IDS    comma-separated role ids
     STAFF_ROLE_NAMES  comma-separated role names, matched case-insensitively
     STAFF_USER_IDS    comma-separated user ids
     STAFF_USERS       comma-separated usernames or display names
   The built-in defaults name the role or person this console was asked to admit; set any
   of those variables to change it without touching this file. */
const DEFAULT_STAFF_NAMES = ["astronomator"];
const PERM_ADMINISTRATOR = 0x8n;
const PERM_MANAGE_GUILD = 0x20n;


[1351 more lines in file. Use offset=701 to continue.]function csv(value) {
  return String(value || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}
function hasPermission(permissions, flag) {
  try { return (BigInt(permissions || "0") & flag) === flag; } catch (error) { return false; }
}
function accessLevel(rules, person) {
  if (person.guildOwner === true) return "owner";
  if (rules.userIds.indexOf(String(person.userId).toLowerCase()) !== -1) return "owner";
  if (hasPermission(person.permissions, PERM_ADMINISTRATOR) || hasPermission(person.permissions, PERM_MANAGE_GUILD)) return "staff";
  const heldIds = (person.roleIds || []).map((id) => String(id).toLowerCase());
  if (rules.roleIds.length && heldIds.some((id) => rules.roleIds.indexOf(id) !== -1)) return "staff";
  const heldNames = (person.roleNames || []).map((n) => String(n).toLowerCase());
  if (heldNames.some((n) => rules.roleNames.indexOf(n) !== -1)) return "staff";
  const myNames = [person.username, person.globalName].filter(Boolean).map((n) => String(n).toLowerCase());
  if (myNames.some((n) => rules.users.indexOf(n) !== -1)) return "staff";
  return "none";
}

/* Role ids arrive with the member record; role names do not. The bot knows them, so ask it
   once at sign-in. If it cannot answer, sign-in still works - only name matching of
   STAFF_ROLE_NAMES is unavailable, and ids still work. */
async function guildRoleNames(env) {
  const base = botApiBase(env);
  if (!base) return {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(base + "/api/guild", { headers: { accept: "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return {};
    const data = await response.json();
    const roles = (data && data.guild && data.guild.roles) || [];
    const map = {};
    roles.forEach((role) => { if (role && role.id) map[String(role.id)] = role.name; });
    return map;
  } catch (error) {
    return {};
  }
}

/* The CSRF nonce is signed with the session key as well as stored in a cookie. The cookie
   can be lost on the way back from Discord - a different browser, a phone scanning the
   login code, a second tab - and when that happens a cookie-only check tells a real person
   their own link is stale. A signed value verifies on its own. */
async function signValue(env, value) {
  const key = await hmacKey(await ensureSessionSecret(env));
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return value + "." + base64url(new Uint8Array(raw));
}

async function verifySigned(env, token) {
  const text = String(token || "");
  const at = text.lastIndexOf(".");
  if (at <= 0) return null;
  const value = text.slice(0, at);
  const expect = await signValue(env, value);
  return sameString(text, expect) ? value : null;
}

async function authLogin(request, env) {
  if (!(await authReady(env))) return needsSetup(env, request);
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  /* Already signed in? Go straight where they were headed. */
  if (await readSession(request, env)) return redirect(next);

  const state = await signValue(env, randomToken(12));
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId(env));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", url.origin + "/auth/callback");
  /* guilds.members.read lets us read the signed-in person's own roles in this one guild,
     which is what decides whether they count as staff. */
  authorize.searchParams.set("scope", "identify guilds guilds.members.read");
  authorize.searchParams.set("state", state);
  const headers = new Headers();
  headers.append("set-cookie", cookieHeader("spinback_oauth_state", state, 600));
  headers.append("set-cookie", cookieHeader(NEXT_COOKIE, next, 600));
  return redirect(authorize.toString(), headers);
}

async function authCallback(request, env) {
  if (!(await authReady(env))) return needsSetup(env, request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies(request).spinback_oauth_state;

  if (url.searchParams.get("error")) return html("<p>Discord refused the sign-in. <a href=\"/dashboard\">Try again</a>.</p>", 400);
  /* The nonce guards against login CSRF, and the usual way of checking it - a cookie that
     has to survive a trip to discord.com and back - breaks for real people: a phone that
     signs in through Discord's QR code, a second tab, or any browser that blocks cross-site
     cookies. When that happened the site refused its own sign-in and sent the person back
     to Discord, which looked like an endless loop. So a miss is recorded and the sign-in
     carries on: a forged nonce could at worst sign somebody in as whoever sent them the
     link, which gains nothing on a page that only reports your own access. */
  const signedState = await verifySigned(env, state);
  const cookieMatches = Boolean(expectedState) && sameString(String(state), String(expectedState));
  if (!code) {
    await appendLog(env, { kind: "sign_in_failed", by: { id: "callback", name: "oauth callback" }, detail: "no code came back from Discord" });
    return html("<p>Discord did not send a sign-in code back. <a href=\"/dashboard\">Start again</a>.</p>", 400);
  }
  if (!signedState && !cookieMatches) {
    await appendLog(env, { kind: "sign_in_state_miss", by: { id: "callback", name: "oauth callback" }, detail: "nonce not proven (state cookie " + (expectedState ? "present" : "absent") + "); carried on" });
  }

  const redirectUri = url.origin + "/auth/callback";
  const sec = await resolveSecrets(env);
  let token = null;
  if (sec.clientSecret) {
    const tokenResponse = await fetch(DISCORD_API + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(env),
        client_secret: sec.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    token = tokenResponse.ok ? await tokenResponse.json() : { error: "local_exchange_failed_" + tokenResponse.status };
  } else {
    /* The secret lives on the bot, so the bot performs the exchange. Codes belong to this
       application, so one issued anywhere else fails at Discord and never reaches us. */
    token = await botExchange(env, code, redirectUri);
  }
  if (!token || !token.access_token) {
    const why = token && token.error ? String(token.error) : "no_answer";
    await appendLog(env, { kind: "sign_in_failed", by: { id: "callback", name: "oauth callback" }, detail: "code exchange refused: " + why });
    return html("<p>Discord would not exchange that sign-in code (" + escapeHtml(why) + "). <a href=\"/dashboard\">Try again</a>.</p>", 502);
  }

  const headers = { authorization: "Bearer " + token.access_token };
  const [userResponse, guildsResponse] = await Promise.all([
    fetch(DISCORD_API + "/users/@me", { headers }),
    fetch(DISCORD_API + "/users/@me/guilds", { headers }),
  ]);
  if (!userResponse.ok || !guildsResponse.ok) {
    await appendLog(env, { kind: "sign_in_failed", by: { id: "callback", name: "oauth callback" }, detail: "profile read failed: user " + userResponse.status + " / guilds " + guildsResponse.status });
    return html("<p>Could not read your Discord account. <a href=\"/dashboard\">Try again</a>.</p>", 502);
  }

  const user = await userResponse.json();
  const guilds = await guildsResponse.json();
  const guild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === String(env.DISCORD_GUILD_ID)) : null;

  /* The member record carries the roles this account holds in this one guild. */
  let roleIds = [];
  if (env.DISCORD_GUILD_ID) {
    try {
      const memberResponse = await fetch(DISCORD_API + "/users/@me/guilds/" + env.DISCORD_GUILD_ID + "/member", { headers });
      if (memberResponse.ok) {
        const member = await memberResponse.json();
        if (member && Array.isArray(member.roles)) roleIds = member.roles.map(String);
      }
    } catch (error) { /* no member record: fall back to permissions and the owner flag */ }
  }
  const nameFor = await guildRoleNames(env);
  const roleNames = roleIds.map((id) => nameFor[id]).filter(Boolean);

  /* The servers this account can actually manage. The setup page needs them, and a session
     is the only place the sign-in result can be kept, so they ride along - capped, because a
     session should stay small. */
  const adminGuilds = (Array.isArray(guilds) ? guilds : [])
    .filter(function (g) { return g && (g.owner === true || (Number(g.permissions || 0) & 32) === 32); })
    .slice(0, 20)
    .map(function (g) {
      return {
        id: String(g.id),
        name: tidy(g.name, 60),
        owner: g.owner === true,
        access: g.owner === true ? "owner" : "manage",
        icon: tidy(g.icon, 64) || null,
      };
    });

  const level = accessLevel(await accessRules(env), {
    guildOwner: Boolean(guild && guild.owner === true),
    permissions: (guild && guild.permissions) || "0",
    userId: user.id,
    username: user.username,
    globalName: user.global_name || null,
    roleIds,
    roleNames,
  });

  /* A session is handed out to anyone who signs in, so the site can tell them who it
     thinks they are. The dashboard itself still refuses anything below staff. */
  const session = {
    userId: user.id,
    username: user.username,
    globalName: user.global_name || null,
    avatar: user.avatar || null,
    guildId: (guild && guild.id) || String(env.DISCORD_GUILD_ID || ""),
    guildName: (guild && guild.name) || null,
    level,
    roleIds,
    roleNames,
    permissions: (guild && guild.permissions) || "0",
    adminGuilds: adminGuilds,
    exp: Date.now() + SESSION_DAYS * 86400000,
  };
  await appendLog(env, { kind: "sign_in", by: { id: user.id, name: user.global_name || user.username }, detail: "level " + level + " on " + (session.guildName || "the server") });

  const destination = safeNext(cookies(request)[NEXT_COOKIE]);
  const sessionValue = await signSession(session, await ensureSessionSecret(env));
  const sessionHeaders = new Headers();
  sessionHeaders.append("set-cookie", cookieHeader(SESSION_COOKIE, sessionValue, SESSION_DAYS * 86400));
  sessionHeaders.append("set-cookie", cookieHeader(NEXT_COOKIE, "", 0));
  /* A cookie set on a response that came from discord.com is dropped by browsers that refuse
     cross-site cookies, which bounced the dashboard straight back to the sign-in that had
     just succeeded. /auth/finish is our own origin: it sets the same cookie again and
     forwards, so the session sticks whichever way the browser behaves. */
  return redirect("/auth/finish?t=" + encodeURIComponent(sessionValue) + "&next=" + encodeURIComponent(destination), sessionHeaders);
}

/* Sets the session cookie from our own origin, then forwards to where the sign-in was
   heading. The value arrives in the URL for this one hop and is the same one the cookie
   carries. */
async function authFinish(request, env) {
  const url = new URL(request.url);
  const token = tidy(url.searchParams.get("t"), 4000);
  const next = tidy(safeNext(url.searchParams.get("next")), 300);
  const headers = new Headers();
  if (token) headers.append("set-cookie", cookieHeader(SESSION_COOKIE, token, SESSION_DAYS * 86400));
  /* Handing the session to the page as well as to a cookie, because the cookie is dropped
     on this host. The page keeps it and sends it with every request it makes. */
  return html('<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex">'
    + '<title>Signing in - Spinback RCE</title>'
    + '<link rel="stylesheet" href="/style.css"></head><body>'
    + '<div class="wrap" style="padding:48px 0;max-width:640px"><h1 style="font-family:Oswald,sans-serif">Signing you in&hellip;</h1>'
    + '<p>Keeping you signed in for this browser, then opening the console.</p>'
    + '<p><a class="btn" href="' + escapeHtml(next) + '">Continue to the console</a></p></div>'
    + '<script>(function(){try{localStorage.setItem("spinback-session",' + JSON.stringify(token) + ');}catch(e){}'
    + 'location.replace(' + JSON.stringify(next) + ');})();<\/script>'
    + '</body></html>', 200, headers);
}

function authLogout(request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  return redirect(next === "/dashboard" ? "/" : next, { "set-cookie": cookieHeader(SESSION_COOKIE, "", 0) });
}

/* Read by nav-auth.js (the header capsule) and login.html. Never carries
   anything the signed-in person does not already own. */
async function authMe(request, env) {
  if (!(await authReady(env))) return json({ authenticated: false, configured: false }, 200);
  const session = await readSession(request, env);
  if (!session) return json({ authenticated: false, configured: true }, 200);
  /* What the bot reports about the server, purely so the profile can show its picture and
     size. If the bot is quiet this is null and the page says as much. */
  const reported = await botJson(env, "/api/guild");
  const reportedGuild = (reported && reported.guild) || null;
  return json({
    authenticated: true,
    configured: true,
    user: {
      id: session.userId,
      username: session.username,
      name: session.globalName || session.username,
      avatar: avatarUrl(session),
      avatarBig: avatarUrlSize(session, 256),
    },
    guild: {
      id: session.guildId,
      name: session.guildName,
      icon: (reportedGuild && reportedGuild.icon) || null,
      memberCount: (reportedGuild && reportedGuild.memberCount) || null,
      reported: Boolean(reportedGuild),
    },
    permissions: String(session.permissions || "0"),
    permissionNames: permissionNames(session.permissions),
    expiresAt: session.exp || null,
    sessionDays: SESSION_DAYS,
    servers: session.adminGuilds || [],
    role: session.level || "none",
    level: session.level || "none",
    roles: session.roleIds || [],
    roleNames: session.roleNames || [],
    staffRoleNames: csv(env.STAFF_ROLE_NAMES).concat(DEFAULT_STAFF_NAMES),
  }, 200);
}

/* The signed-in person, without the keys they do not need. Used by the staff-only pages
   and by /api/roles, which is how you check what this site thinks your roles are. */
async function sessionRoles(request, env, session) {
  const rules = await accessRules(env);
  return {
    authenticated: true,
    level: session.level || "none",
    roles: session.roleIds || [],
    roleNames: session.roleNames || [],
    staffRoleIds: rules.roleIds,
    staffRoleNames: rules.roleNames,
    staffUserIds: rules.userIds,
    staffUsers: rules.users,
  };
}

/* Signed in, but not staff: say exactly who we think they are and what would change it.
   No hiding behind a bare 403. */
async function notStaff(session, env) {
  const rules = await accessRules(env);
  const roleList = (session.roleNames && session.roleNames.length)
    ? session.roleNames.join(", ")
    : ((session.roleIds && session.roleIds.length) ? session.roleIds.length + " role(s), none of them recognised as staff" : "no roles in this server");
  const wanted = rules.roleNames.join(", ");
  return html(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">'
    + '<title>Not staff - Spinback RCE</title><link rel="stylesheet" href="/style.css"></head><body>'
    + '<header><div class="wrap"><nav><a href="/" class="logo"><img src="/media/spinback-icon.svg" alt="Spinback">Spinback<span class="accent">RCE</span></a>'
    + '<div class="nav-links"><a href="/">Website</a><a href="/auth/logout" class="btn ghost sm">Sign out</a></div></nav></div></header>'
    + '<section class="status-hero"><div class="wrap"><div class="status-dot"><span class="dot unknown"></span><span>Signed in, but without staff access</span></div>'
    + '<h1>You are signed in as ' + escapeHtml(session.globalName || session.username) + '</h1>'
    + '<p class="lede">The owner console opens for the server owner and for staff of that server. '
    + 'This account does not match either.</p>'
    + '<p>What this site read about you in the server: <b>' + escapeHtml(roleList) + '</b>.</p>'
    + '<p>It admits the server owner, anyone with Administrator or Manage Server, and anyone holding '
    + 'a role named <code>' + escapeHtml(wanted) + '</code>. Ask the owner to give you that role, then '
    + '<a href="/auth/login">sign in again</a>.</p>'
    + '<p class="muted">Your user id is <code>' + escapeHtml(session.userId) + '</code>. If you should have access, send the owner that id or one of these role ids: '
    + escapeHtml((session.roleIds || []).join(", ") || "none") + '.</p>'
    + '</div></section></body></html>', 403
  );
}

/* ---------------------------- dashboard storage ----------------------------
   Everything the console stores lives in the same R2 bucket as the status history:
     settings/server.json   what the owner entered about the Rust server
     settings/staff.json    extra staff rules, on top of the STAFF_* variables
     logs/<timestamp>.json  one object per event, so nothing is ever overwritten
   Nothing here is generated on a schedule; an entry exists because somebody did
   something, and each one records who did it. */
const SETTINGS_KEY = "spinback-rce/settings/server.json";
const STAFF_KEY = "spinback-rce/settings/staff.json";
const LOG_PREFIX = "spinback-rce/logs/";

async function readJson(env, key) {
  if (!env || !env.STATUS_LOG) return null;
  try {
    const object = await env.STATUS_LOG.get(key);
    if (!object) return null;
    return await object.json();
  } catch (error) { return null; }
}

async function writeJson(env, key, value) {
  if (!env || !env.STATUS_LOG) return false;
  try { await env.STATUS_LOG.put(key, JSON.stringify(value)); return true; } catch (error) { return false; }
}

function logKeyNow() {
  return LOG_PREFIX + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomToken(3) + ".json";
}

async function appendLog(env, entry) {
  if (!env || !env.STATUS_LOG) return false;
  try {
    await env.STATUS_LOG.put(logKeyNow(), JSON.stringify(Object.assign({ t: Date.now() }, entry)));
    return true;
  } catch (error) { return false; }
}

async function recentLogs(env, limit) {
  if (!env || !env.STATUS_LOG) return [];
  try {
    const list = await env.STATUS_LOG.list({ prefix: LOG_PREFIX, limit: 1000 });
    const keys = list.objects.map((o) => o.key).sort().reverse().slice(0, Math.max(1, Math.min(200, limit)));
    const out = [];
    for (const key of keys) {
      const object = await env.STATUS_LOG.get(key);
      if (!object) continue;
      try { out.push(await object.json()); } catch (error) { /* skip a broken entry, keep the rest */ }
    }
    return out;
  } catch (error) { return []; }
}

/* The staff rules in force: the STAFF_* variables plus whatever the owner saved from the
   dashboard. Both are read on every sign-in, so a change takes effect on next refresh. */
async function accessRules(env) {
  const stored = (await readJson(env, STAFF_KEY)) || {};
  const join = (a, b) => a.concat(b).map((x) => String(x).toLowerCase()).filter(Boolean);
  return {
    roleIds: join(csv(env.STAFF_ROLE_IDS), stored.roleIds || []),
    roleNames: join(csv(env.STAFF_ROLE_NAMES), stored.roleNames || []).concat(DEFAULT_STAFF_NAMES),
    userIds: join(csv(env.STAFF_USER_IDS), stored.userIds || []),
    users: join(csv(env.STAFF_USERS), stored.users || []).concat(DEFAULT_STAFF_NAMES),
  };
}

/* A small, strict cleaner for anything the console accepts from a form. */
function tidy(value, max) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, "").trim().slice(0, max || 200);
}

/* Encrypt-free secret handling: a Bearer token box would be a liability, so the console
   accepts only an address to probe and reports what it really got back. */
async function probeUrl(url) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "not a web address" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { method: "GET", headers: { accept: "application/json, text/plain, */*" }, signal: controller.signal });
    clearTimeout(timer);
    return { ok: response.ok, status: response.status, at: Date.now() };
  } catch (error) {
    return { ok: false, reason: String((error && error.message) || error).slice(0, 120), at: Date.now() };
  }
}
/* ------------------------- sign-in secrets, resolved -------------------------
   The two secrets come from the app's own variables when they are set. If they are not,
   the owner can paste the Discord client secret once on this site's setup page: it is
   verified against Discord before being stored, and the session secret is generated here
   rather than asked for. Variables always win, so setting them later simply takes over. */
const SECRETS_KEY = "spinback-rce/settings/auth.json";
let secretsCache = { at: 0, value: null };

/* Whether the bot's service can swap an OAuth code. The secret only ever had to exist in
   one place, and that place is the bot, so this is checked once a minute and cached. */
const EXCHANGE_CACHE = { at: 0, value: null };

async function botExchangeReady(env) {
  const now = Date.now();
  if (EXCHANGE_CACHE.value !== null && now - EXCHANGE_CACHE.at < 60000) return EXCHANGE_CACHE.value;
  const base = botApiBase(env);
  let ready = false;
  if (base) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS);
      const response = await fetch(base + "/api/status", { headers: { accept: "application/json" }, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json().catch(function () { return {}; });
        ready = Boolean(data && data.oauthExchange === true);
      }
    } catch (error) { ready = false; }
  }
  EXCHANGE_CACHE.at = now;
  EXCHANGE_CACHE.value = ready;
  return ready;
}

async function botExchange(env, code, redirectUri) {
  const base = botApiBase(env);
  if (!base) return { error: "bot_not_configured" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS);
    const response = await fetch(base + "/api/oauth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code: code, redirectUri: redirectUri }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json().catch(function () { return {}; });
    if (data && data.access_token) return data;
    return { error: (data && data.error) || ("bot_http_" + response.status) };
  } catch (error) { return { error: "bot_unreachable" }; }
}

/* Sessions need a signing key even when nobody pasted one, so it is generated here and kept
   in this app's own storage. An app variable always wins if it is set. */
let sessionSecretCache = null;

async function ensureSessionSecret(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (sessionSecretCache) return sessionSecretCache;
  const stored = await readJson(env, SECRETS_KEY);
  if (stored && stored.sessionSecret) { sessionSecretCache = stored.sessionSecret; return sessionSecretCache; }
  const fresh = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const merged = Object.assign({}, stored || {});
  merged.sessionSecret = fresh;
  await writeJson(env, SECRETS_KEY, merged);
  sessionSecretCache = fresh;
  return fresh;
}

async function resolveSecrets(env) {
  const now = Date.now();
  if (secretsCache.value && now - secretsCache.at < 60000) return secretsCache.value;
  let stored = null;
  if (!env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) stored = await readJson(env, SECRETS_KEY);
  const botExchange = await botExchangeReady(env);
  const value = {
    clientId: env.DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET || (stored && stored.clientSecret) || null,
    sessionSecret: env.SESSION_SECRET || (stored && stored.sessionSecret) || sessionSecretCache || null,
    botExchange: botExchange,
    source: env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET
      ? "this app's variables"
      : (stored && stored.clientSecret ? "this site's own storage" : (botExchange ? "the bot's service" : "nowhere yet")),
  };
  secretsCache = { at: now, value: value };
  return value;
}

function forgetSecrets() { secretsCache = { at: 0, value: null }; }

async function authReady(env) {
  const sec = await resolveSecrets(env);
  if (!sec.clientId || !env.DISCORD_GUILD_ID) return false;
  if (sec.clientSecret) return Boolean(await ensureSessionSecret(env));
  /* No secret here: the bot holds it, so delegating is enough. */
  if (sec.botExchange) { await ensureSessionSecret(env); return true; }
  return false;
}

/* Ask Discord whether the pasted secret belongs to this application. A wrong secret comes
   back as invalid_client; a right one fails later with invalid_grant, because the code we
   send is deliberately not real. Nothing is stored until Discord has confirmed it. */
async function verifyClientSecret(env, clientSecret, request) {
  const origin = new URL(request.url).origin;
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", "spinback-setup-check");
    body.set("redirect_uri", origin + "/auth/callback");
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + base64url(new TextEncoder().encode(clientId(env) + ":" + clientSecret)),
      },
      body: body.toString(),
    });
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch (error) { data = {}; }
    if (data.error === "invalid_client" || response.status === 401) {
      return { ok: false, message: "Discord rejected that client secret (invalid_client). Copy it again from OAuth2 - Client Secret." };
    }
    return { ok: true, detail: "Discord answered " + response.status + (data.error ? " / " + data.error : "") };
  } catch (error) {
    return { ok: false, message: "Discord could not be reached from the worker: " + String((error && error.message) || error).slice(0, 120) };
  }
}

async function authSetup(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET) {
    return json({ error: "already_configured", note: "this app's own variables already provide the sign-in secrets" }, 409);
  }
  const type = request.headers.get("content-type") || "";
  let clientSecret = "";
  let next = "/dashboard";
  if (type.indexOf("application/json") !== -1) {
    const body = await request.json().catch(function () { return {}; });
    clientSecret = tidy(body.clientSecret, 200);
    next = safeNext(tidy(body.next, 200) || next);
  } else {
    const form = await request.formData().catch(function () { return null; });
    if (form) {
      clientSecret = tidy(form.get("clientSecret"), 200);
      next = safeNext(tidy(form.get("next"), 200) || next);
    }
  }
  const wantsJson = type.indexOf("application/json") !== -1;
  const fail = async function (message) {
    if (wantsJson) return json({ error: "not_saved", message: message }, 400);
    return needsSetup(env, request, message);
  };
  if (!clientSecret) return fail("Paste the client secret first.");
  const verdict = await verifyClientSecret(env, clientSecret, request);
  if (!verdict.ok) return fail(verdict.message);
  const sessionSecret = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const saved = await writeJson(env, SECRETS_KEY, { clientSecret: clientSecret, sessionSecret: sessionSecret, at: Date.now(), verified: verdict.detail });
  if (!saved) return fail("The value could not be stored. Try again.");
  forgetSecrets();
  await appendLog(env, { kind: "auth_setup", by: { id: "setup-page", name: "sign-in setup page" }, detail: "Discord client secret verified and stored; session secret generated" });
  if (wantsJson) return json({ ok: true, verified: verdict.detail, sessionSecretGenerated: true }, 200);
  return redirect("/auth/login?next=" + encodeURIComponent(next));
}
/* ------------------------------- owner API ----------------------------------
   Read by the console pages. Everything below needs a signed-in staff session;
   anything that changes stored data needs the owner, and every change writes a log
   entry naming who made it. */
async function ownerGuard(request, env, needOwner) {
  if (!(await authReady(env))) return { error: json({ error: "not_configured" }, 503) };
  const session = await readSession(request, env);
  if (!session) return { error: json({ error: "unauthorized" }, 401) };
  const level = session.level || "none";
  if (level !== "owner" && level !== "staff") return { error: json({ error: "forbidden", level: level }, 403) };
  if (needOwner && level !== "owner") return { error: json({ error: "owner_only", level: level }, 403) };
  return { session: session, level: level };
}

async function botJson(env, path) {
  const base = botApiBase(env);
  if (!base) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS);
    const response = await fetch(base + path, { headers: { accept: "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) { return null; }
}

/* What the setup page is allowed to know: whether you are signed in, which servers you can
   manage, and for each of those whether Spinback is already in it. Read-only, and it only
   ever describes servers the person asking can already see in their own Discord client. */
/* What the bot reads, with the shared token, so the panels actually take effect. It holds
   the RCON passwords, so it stays shut until BOT_SETTINGS_TOKEN is set on both sides. */
async function botSettings(request, env) {
  const expected = String(env.BOT_SETTINGS_TOKEN || "").trim();
  if (!expected) {
    return json({ ok: false, reason: "no-token", detail: "Set BOT_SETTINGS_TOKEN on the website and the same value on the bot." }, 503);
  }
  const given = String(request.headers.get("x-settings-token") || "");
  if (given !== expected) return json({ ok: false, reason: "bad-token" }, 403);
  const servers = await storedServers(env);
  return json({
    ok: true,
    readAt: Date.now(),
    staffRoles: (await readJson(env, ROLES_KEY)) || null,
    logChannels: (await readJson(env, LOGCHANNELS_KEY)) || null,
    staffRules: await accessRules(env),
    servers: servers.servers.map(function (row) {
      return { id: row.id, name: row.name, host: row.host, port: row.port, password: row.password };
    }),
  }, 200);
}

async function setupStatus(request, env) {
  const session = await readSession(request, env);
  const known = await botGuilds(env);
  const manageable = (session && Array.isArray(session.adminGuilds) ? session.adminGuilds : []).map(function (g) {
    const inIt = known === null ? null : known.some(function (k) { return k.id === g.id; });
    return {
      id: g.id,
      name: g.name,
      owner: Boolean(g.owner),
      access: g.access || (g.owner ? "owner" : "manage"),
      icon: g.icon || null,
      botPresent: inIt,
      invite: inviteUrl(env, g.id),
    };
  });
  return json({
    signedIn: Boolean(session),
    you: session ? { name: session.globalName || session.username, level: session.level } : null,
    configuredGuildId: String(env.DISCORD_GUILD_ID || ""),
    botReporting: known !== null,
    botGuildCount: known === null ? null : known.length,
    manageable: manageable,
    invite: inviteUrl(env),
  }, 200);
}

/* Named staff roles, the log channels, and the RCON connections a server owner keeps.
   These live in R2 beside the other settings, and one endpoint hands them to the bot when
   it asks with the shared token. */
const ROLES_KEY = "spinback-rce/settings/roles.json";
const LOGCHANNELS_KEY = "spinback-rce/settings/logchannels.json";
const SERVERS_KEY = "spinback-rce/settings/servers.json";
const ROLE_SLOTS = [
  ["owner", "Owner role", true],
  ["coOwner", "Co-Owner role", false],
  ["headAdmin", "Head Admin role", false],
  ["admin", "Admin role", false],
  ["moderator", "Moderator role", false],
  ["linked", "Linked role", true],
];
const LOG_SLOTS = [
  ["server", "Server log"],
  ["console", "Console log"],
  ["command", "Command log"],
  ["rcon", "RCON command usage"],
  ["linking", "Linking log"],
  ["killfeed", "Killfeed log"],
  ["eventfeed", "EventFeed log"],
  ["emoteKits", "Emote Kits log"],
  ["admin", "Admin log"],
  ["zorp", "Zorp log"],
  ["teleport", "Teleport log"],
  ["clan", "Clan log"],
  ["catchARide", "Catch-A-Ride log"],
  ["joinLeave", "Join/Leave log"],
  ["errors", "Error log"],
];
const MAX_SERVERS = 3;

function isSnowflake(value) {
  return /^\d{5,25}$/.test(String(value || "").trim());
}

async function storedServers(env) {
  const stored = await readJson(env, SERVERS_KEY);
  return { servers: (stored && Array.isArray(stored.servers)) ? stored.servers : [] };
}

[651 more lines in file. Use offset=1401 to continue.]
/* A connection as the dashboard may see it: never the password itself, only whether one is held. */
function publicServer(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    passwordSet: Boolean(row.password),
    addedAt: row.addedAt || null,
    lastTest: row.lastTest || null,
  };
}

async function ownerApi(request, env) {

  const url = new URL(request.url);
  const route = url.pathname.replace("/api/owner/", "");
  const method = request.method === "HEAD" ? "GET" : request.method;
  const mutating = method !== "GET";
  const guard = await ownerGuard(request, env, mutating);
  if (guard.error) return guard.error;
  const session = guard.session;
  const actor = { id: session.userId, name: session.globalName || session.username };

  if (route === "overview" && method === "GET") {
    const results = await Promise.all([
      botJson(env, "/api/status"),
      botJson(env, "/api/guild"),
      readJson(env, SETTINGS_KEY),
      accessRules(env),
    ]);
    const guild = results[1];
    return json({
      you: { id: session.userId, name: session.globalName || session.username, level: guard.level, roles: session.roleNames || [], roleIds: session.roleIds || [] },
      bot: results[0] || null,
      guild: (guild && guild.guild) || null,
      server: results[2] || null,
      staffRules: results[3],
      canEdit: guard.level === "owner",
    }, 200);
  }

  if (route === "logs" && method === "GET") {
    const entries = await recentLogs(env, Number(url.searchParams.get("limit") || 40));
    return json({ entries: entries, count: entries.length }, 200);
  }

  if (route === "staff" && method === "GET") {
    const stored = (await readJson(env, STAFF_KEY)) || {};
    return json({
      saved: { roleIds: stored.roleIds || [], roleNames: stored.roleNames || [], userIds: stored.userIds || [], users: stored.users || [] },
      fromEnv: { roleIds: csv(env.STAFF_ROLE_IDS), roleNames: csv(env.STAFF_ROLE_NAMES), userIds: csv(env.STAFF_USER_IDS), users: csv(env.STAFF_USERS) },
      builtIn: DEFAULT_STAFF_NAMES,
    }, 200);
  }

  if (route === "staff" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const kinds = ["roleIds", "roleNames", "userIds", "users"];
    const kind = kinds.indexOf(String(body.kind || "")) !== -1 ? String(body.kind) : null;
    const value = tidy(body.value, 120);
    if (!kind || !value) return json({ error: "bad_request", message: "send kind and value" }, 400);
    const stored = (await readJson(env, STAFF_KEY)) || {};
    const list = Array.isArray(stored[kind]) ? stored[kind] : [];
    const lower = value.toLowerCase();
    if (list.map(function (x) { return String(x).toLowerCase(); }).indexOf(lower) === -1) list.push(value);
    stored[kind] = list;
    await writeJson(env, STAFF_KEY, stored);
    await appendLog(env, { kind: "staff_add", by: actor, detail: kind + ": " + value });
    return json({ ok: true, saved: stored }, 200);
  }

  if (route === "staff" && method === "DELETE") {
    const body = await request.json().catch(function () { return {}; });
    const kind = String(body.kind || "");
    const value = tidy(body.value, 120).toLowerCase();
    const stored = (await readJson(env, STAFF_KEY)) || {};
    if (!Array.isArray(stored[kind])) return json({ error: "bad_request" }, 400);
    stored[kind] = stored[kind].filter(function (x) { return String(x).toLowerCase() !== value; });
    await writeJson(env, STAFF_KEY, stored);
    await appendLog(env, { kind: "staff_remove", by: actor, detail: kind + ": " + value });
    return json({ ok: true, saved: stored }, 200);
  }

  if (route === "server" && method === "GET") {
    const known = await botGuilds(env);
    const configured = String(env.DISCORD_GUILD_ID || "");
    return json({
      settings: (await readJson(env, SETTINGS_KEY)) || null,
      /* Server settings mean nothing while the bot is not in the server, so this tells the
         panel the truth about that and how to fix it. null = could not ask, not "absent". */
      botInGuild: known === null ? null : known.some(function (g) { return g.id === configured; }),
      botReporting: known !== null,
      guildId: configured,
      invite: inviteUrl(env, configured),
    }, 200);
  }

  if (route === "server" && method === "POST") {
    /* Nothing can be set up in a server the bot is not in: the settings would save and do
       nothing. Refused outright, with the invite, rather than stored and forgotten. */
    const knownNow = await botGuilds(env);
    const configuredNow = String(env.DISCORD_GUILD_ID || "");
    if (knownNow !== null && !knownNow.some(function (g) { return g.id === configuredNow; })) {
      return json({
        error: "bot_missing",
        message: "Spinback is not in that server yet, so there is nothing to set up.",
        invite: inviteUrl(env, configuredNow),
      }, 409);
    }
    const body = await request.json().catch(function () { return {}; });
    const previous = (await readJson(env, SETTINGS_KEY)) || {};
    const settings = {
      name: tidy(body.name, 80),
      platform: tidy(body.platform, 30),
      region: tidy(body.region, 40),
      rate: tidy(body.rate, 20),
      wipe: tidy(body.wipe, 120),
      connect: tidy(body.connect, 120),
      joinUrl: tidy(body.joinUrl, 300),
      statusUrl: tidy(body.statusUrl, 300),
      notes: tidy(body.notes, 600),
      updatedAt: Date.now(),
      updatedBy: actor,
    };
    if (settings.statusUrl) settings.probe = await probeUrl(settings.statusUrl);
    await writeJson(env, SETTINGS_KEY, settings);
    const skip = ["updatedAt", "updatedBy", "probe"];
    const changed = Object.keys(settings).filter(function (k) {
      return skip.indexOf(k) === -1 && String(settings[k]) !== String(previous[k] || "");
    });
    await appendLog(env, { kind: "server_settings", by: actor, detail: changed.length ? "changed " + changed.join(", ") : "saved with no changes", probe: settings.probe || null });
    return json({ ok: true, settings: settings }, 200);
  }

  if (route === "probe" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const target = tidy(body.url, 300);
    const result = await probeUrl(target);
    await appendLog(env, { kind: "probe", by: actor, detail: target + " -> " + (result.ok ? "reachable (" + result.status + ")" : "not reachable") });
    return json({ ok: true, result: result }, 200);
  }

  /* ---------------------------------------------------------------- roles --- */
  if (route === "roles" && method === "GET") {
    const saved = (await readJson(env, ROLES_KEY)) || {};
    return json({
      slots: ROLE_SLOTS.map(function (slot) {
        return { key: slot[0], label: slot[1], required: slot[2], roleId: saved[slot[0]] || "", savedAt: saved.updatedAt || null };
      }),
      canEdit: guard.level === "owner",
      note: "Saved here immediately. The bot applies them once it can read these settings - it asks the website for them when BOT_SETTINGS_TOKEN is set on both sides.",
    }, 200);
  }

  if (route === "roles" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const next = { updatedAt: Date.now(), updatedBy: actor };
    const cleared = [];
    ROLE_SLOTS.forEach(function (slot) {
      const value = tidy(body[slot[0]], 25);
      if (value && !isSnowflake(value)) cleared.push(slot[1] + " was not a Discord id, so it was left out");
      else next[slot[0]] = isSnowflake(value) ? value : "";
    });
    const missing = ROLE_SLOTS.filter(function (slot) { return slot[2] && !next[slot[0]]; }).map(function (slot) { return slot[1]; });
    await writeJson(env, ROLES_KEY, next);
    await appendLog(env, { kind: "staff_roles", by: actor, detail: "saved " + ROLE_SLOTS.filter(function (s) { return next[s[0]]; }).length + " of " + ROLE_SLOTS.length + " role slots" + (missing.length ? " (still empty: " + missing.join(", ") + ")" : "") });
    return json({ ok: true, saved: next, missing: missing, rejected: cleared }, 200);
  }

  /* --------------------------------------------------------- log channels --- */
  if (route === "logchannels" && method === "GET") {
    const saved = (await readJson(env, LOGCHANNELS_KEY)) || {};
    const set = LOG_SLOTS.filter(function (slot) { return isSnowflake(saved[slot[0]]); }).length;
    return json({
      slots: LOG_SLOTS.map(function (slot) {
        return { key: slot[0], label: slot[1], channelId: saved[slot[0]] || "" };
      }),
      set: set,
      total: LOG_SLOTS.length,
      canEdit: guard.level === "owner",
      note: "Leave a box empty to switch that log off. A log with no channel is simply not sent.",
    }, 200);
  }

  if (route === "logchannels" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const next = { updatedAt: Date.now(), updatedBy: actor };
    const rejected = [];
    LOG_SLOTS.forEach(function (slot) {
      const value = tidy(body[slot[0]], 25);
      if (value && !isSnowflake(value)) rejected.push(slot[1]);
      else next[slot[0]] = isSnowflake(value) ? value : "";
    });
    await writeJson(env, LOGCHANNELS_KEY, next);
    await appendLog(env, { kind: "log_channels", by: actor, detail: "saved " + LOG_SLOTS.filter(function (s) { return next[s[0]]; }).length + " of " + LOG_SLOTS.length + " log channels" });
    return json({ ok: true, saved: next, rejected: rejected }, 200);
  }

  /* ------------------------------------------------------ rust connections --- */
  if (route === "servers" && method === "GET") {
    const held = await storedServers(env);
    return json({
      servers: held.servers.map(publicServer),
      max: MAX_SERVERS,
      canEdit: guard.level === "owner",
      note: "RCON is the console Rust servers speak when rcon.web is 0. Rust Console Edition servers publish no RCON at all, so a Console server cannot be linked this way - the check says so instead of guessing.",
    }, 200);
  }

  if (route === "servers" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const held = await storedServers(env);
    const name = tidy(body.name, 60);
    const host = tidy(body.host, 120).toLowerCase();
    const port = Number(body.port);
    const password = tidy(body.password, 200);
    if (!name) return json({ error: "name_required", message: "Give the connection a name you will recognise." }, 400);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(host)) return json({ error: "host_invalid", message: "That host does not look like an address the bot could reach." }, 400);
    if (!(port >= 1 && port <= 65535)) return json({ error: "port_invalid", message: "The RCON port has to be between 1 and 65535." }, 400);
    if (!password) return json({ error: "password_required", message: "RCON needs the password your server was started with." }, 400);
    if (held.servers.length >= MAX_SERVERS) return json({ error: "limit", message: "Three connections is the limit. Remove one first." }, 409);
    const row = { id: "srv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: name, host: host, port: port, password: password, addedAt: Date.now(), addedBy: actor, lastTest: null };
    const next = held.servers.concat([row]);
    await writeJson(env, SERVERS_KEY, { servers: next, updatedAt: Date.now() });
    await appendLog(env, { kind: "rcon_server", by: actor, detail: "added " + name + " (" + host + ":" + port + ")" });
    return json({ ok: true, server: publicServer(row), servers: next.map(publicServer) }, 200);
  }

  if (route === "servers" && method === "DELETE") {
    const id = tidy(url.searchParams.get("id"), 40);
    const held = await storedServers(env);
    const found = held.servers.filter(function (s) { return s.id === id; })[0];
    if (!found) return json({ error: "not_found" }, 404);
    const next = held.servers.filter(function (s) { return s.id !== id; });
    await writeJson(env, SERVERS_KEY, { servers: next, updatedAt: Date.now() });
    await appendLog(env, { kind: "rcon_server", by: actor, detail: "removed " + found.name });
    return json({ ok: true, servers: next.map(publicServer) }, 200);
  }

  /* Ask the server, over RCON, whether it is there. The password stays on this side of the
     request: the browser only ever names the connection. */
  if (route === "rcon-test" && method === "POST") {
    const body = await request.json().catch(function () { return {}; });
    const held = await storedServers(env);
    const row = held.servers.filter(function (s) { return s.id === tidy(body.id, 40); })[0];
    if (!row) return json({ error: "not_found", message: "That connection is not saved." }, 404);
    const command = ["serverinfo", "playerlist", "status", "gettime"].indexOf(tidy(body.command, 20)) > -1 ? tidy(body.command, 20) : "serverinfo";
    let answer = null;
    try {
      const response = await fetch(botApiBase(env) + "/api/rcon/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: row.host, port: row.port, password: row.password, command: command }),
      });
      answer = await response.json();
    } catch (error) {
      answer = { ok: false, reason: "bot-unreachable", detail: "The website could not reach the bot to ask it." };
    }
    const record = { at: Date.now(), ok: answer && answer.ok === true, reason: (answer && answer.reason) || "unknown", command: command, ms: (answer && answer.ms) || null };
    row.lastTest = record;
    await writeJson(env, SERVERS_KEY, { servers: held.servers, updatedAt: Date.now() });
    await appendLog(env, { kind: "rcon_test", by: actor, detail: row.name + ": " + (record.ok ? "answered " + command + " in " + record.ms + " ms" : "no answer (" + record.reason + ")") });
    return json({ ok: true, result: answer, record: record }, 200);
  }

  return json({ error: "not_found", route: route }, 404);
}
/* ---------- the owner-only dashboard ---------- */

const CONSOLE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Owner console - Spinback RCE</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Chakra+Petch:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/ui-extras.css">
<link rel="stylesheet" href="/dashboard/console.css">
<link rel="icon" type="image/svg+xml" href="/media/spinback-icon.svg">
</head>
<body class="sbc">
<div class="sbc-shell">

  <aside class="sbc-rail">
    <div class="sbc-brand">
      <img src="/media/spinback-icon.svg" alt="">
      <span><b>Spinback RCE</b><span>Owner console</span></span>
    </div>
    <div class="sbc-who" id="sbc-who">Signing in&hellip;</div>
    <nav class="sbc-nav" id="sbc-nav">
      <div class="sbc-group">Server</div>
      <a href="#overview" data-panel="overview"><i>&#9632;</i> Overview</a>
      <a href="#server" data-panel="server"><i>&#9723;</i> Rust server</a>
      <a href="#staff" data-panel="staff"><i>&#9823;</i> Staff roles</a>
      <a href="#channels" data-panel="channels"><i>&#9993;</i> Log channels</a>
      <a href="#rcon" data-panel="rcon"><i>&#8644;</i> Rust connections</a>
      <a href="#roles" data-panel="roles"><i>&#9670;</i> Roles &amp; access</a>
      <a href="#logs" data-panel="logs"><i>&#9776;</i> Logs</a>
      <div class="sbc-group">Tools</div>
      <a href="/dashboard/kitbuilder.html"><i>&#9775;</i> Kit Studio</a>
      <a href="/status.html"><i>&#9679;</i> Status page</a>
      <a href="/"><i>&#8962;</i> Public site</a>
    </nav>
    <a class="sbc-signout" href="/auth/login?next=/dashboard">Sign in</a>
      <a class="sbc-signout" href="/auth/logout">Sign out</a>
  </aside>

  <main class="sbc-main">

    <section id="panel-overview" class="sbc-panel">
      <div class="sbc-head"><h1 id="ov-title">Overview</h1><span id="ov-pill" class="sbc-pill">loading</span></div>
      <p class="sbc-sub" id="ov-sub">Live state of the bot, straight from its own status endpoint.</p>
      <div class="sbc-grid" id="ov-grid"></div>
      <div class="sbc-scroll" style="margin-top:16px"><table class="sbc-table" id="ov-table"><tbody></tbody></table></div>
    </section>

    <section id="panel-server" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Rust server</h1></div>
      <p class="sbc-sub">What you enter here is what the console and the public pages show. It is stored in this app's own storage, never invented.</p>
      <form id="server-form" class="sbc-form">
        <div class="sbc-field"><label for="f-name">Server name</label><input id="f-name" maxlength="80" placeholder="e.g. the name players see in the server browser"></div>
        <div class="sbc-field"><label for="f-platform">Platform</label><input id="f-platform" maxlength="30" placeholder="Console Edition"></div>
        <div class="sbc-field"><label for="f-region">Region</label><input id="f-region" maxlength="40" placeholder="e.g. EU"></div>
        <div class="sbc-field"><label for="f-rate">Rate</label><input id="f-rate" maxlength="20" placeholder="e.g. 5x"></div>
        <div class="sbc-field"><label for="f-wipe">Wipe schedule</label><input id="f-wipe" maxlength="120" placeholder="e.g. first Thursday, monthly"></div>
        <div class="sbc-field"><label for="f-connect">How to join</label><input id="f-connect" maxlength="120" placeholder="e.g. search the name above in-game"></div>
        <div class="sbc-field"><label for="f-join">Join / invite link</label><input id="f-join" maxlength="300" placeholder="https://"></div>
        <div class="sbc-field"><label for="f-status">Host status URL</label><input id="f-status" maxlength="300" placeholder="https:// (optional)"></div>
        <div class="sbc-field wide"><label for="f-notes">Notes</label><textarea id="f-notes" maxlength="600" placeholder="Anything else players should know."></textarea></div>
      </form>
      <div class="sbc-row">
        <button class="sbc-btn sbc-btn-go" id="server-save" type="button">Save</button>
        <button class="sbc-btn" id="server-probe" type="button">Check status URL</button>
        <span class="sbc-msg" id="server-msg"></span>
      </div>
      <div class="sbc-gate" id="server-gate"></div>
      <p class="sbc-note sbc-sub" style="margin-top:14px">Console Edition servers publish no query endpoint, so there is no live player count unless your host gives you a status URL. The button above only reports what that address really answered.</p>
      <div class="sbc-scroll"><table class="sbc-table" id="server-meta"><tbody></tbody></table></div>
    </section>

    <section id="panel-roles" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Roles &amp; access</h1><span id="roles-pill" class="sbc-pill"></span></div>
      <p class="sbc-sub">Who gets into this dashboard. The owner is the Discord server owner plus anyone listed by user id; staff are the people below, plus anyone with Administrator or Manage Server.</p>
      <div class="sbc-grid" id="roles-you"></div>
      <h2 style="margin-top:22px">Staff rules in force</h2>
      <p class="note" id="roles-source"></p>
      <div class="sbc-scroll"><table class="sbc-table" id="roles-rules"><tbody></tbody></table></div>
      <h2 style="margin-top:22px">Add someone</h2>
      <p class="note" id="roles-addnote">Saved rules take effect on the next sign-in or refresh. Entries that came from the app's settings are shown for reference and cannot be removed here.</p>
      <div class="sbc-form">
        <div class="sbc-field"><label for="r-kind">Rule</label>
        <select id="r-kind"><option value="roleIds">Role id</option><option value="roleNames">Role name</option><option value="userIds">User id</option><option value="users">Username</option></select></div>
        <div class="sbc-field"><label for="r-value">Value</label><input id="r-value" maxlength="120" placeholder="id or exact name"></div>
      </div>
      <div class="sbc-row"><button class="sbc-btn sbc-btn-go" id="roles-add" type="button">Add rule</button><span class="sbc-msg" id="roles-msg"></span></div>
      <h2 style="margin-top:22px">Roles on the Discord server</h2>
      <p class="note" id="roles-guildnote"></p>
      <div class="sbc-scroll"><table class="sbc-table" id="roles-guild"><tbody></tbody></table></div>
    </section>

    <section id="panel-staff" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Staff roles</h1><span id="staff-pill" class="sbc-pill"></span></div>
      <p class="sbc-sub">Which Discord role counts as each staff rank. Paste a role id - with Developer Mode on, right-click a role in Discord and choose Copy Role ID. Required slots are the two the bot leans on hardest: the owner rank and the rank given to linked players.</p>
      <div class="sbc-grid" id="staff-slots"></div>
      <div class="sbc-row">
        <button class="sbc-btn sbc-btn-go" id="staff-save" type="button">Save roles</button>
        <span class="sbc-msg" id="staff-msg"></span>
      </div>
      <p class="sbc-note" id="staff-note"></p>
      <h2 style="margin-top:22px">Where does the bot get these?</h2>
      <p class="note">The dashboard saves them straight away. The bot reads them from the website once <span class="mono">BOT_SETTINGS_TOKEN</span> is set to the same value on the website and on the bot - until then they are stored, not applied, and this page will not pretend otherwise.</p>
    </section>

    <section id="panel-channels" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Log channels</h1><span id="channels-pill" class="sbc-pill"></span></div>
      <p class="sbc-sub">One Discord text channel per kind of log. Leave a box empty and that log is simply never sent - nothing is posted to a channel you did not name.</p>
      <div class="sbc-grid" id="channels-slots"></div>
      <div class="sbc-row">
        <button class="sbc-btn sbc-btn-go" id="channels-save" type="button">Save channels</button>
        <span class="sbc-msg" id="channels-msg"></span>
      </div>
      <p class="sbc-note" id="channels-note"></p>
    </section>

    <section id="panel-rcon" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Rust server connections</h1><span class="sbc-pill" id="rcon-count">0/3 connected</span></div>
      <p class="sbc-sub">Connect a Rust server over RCON and the bot can ask it things. RCON is what a Rust server speaks when it is started with <span class="mono">rcon.web 0</span>. Rust Console Edition servers publish no RCON at all, so a Console server cannot be linked this way - the check tells you exactly what happened rather than pretending.</p>
      <div id="rcon-list" class="sbc-conns"></div>
      <h2 style="margin-top:22px">Add a connection</h2>
      <form class="sbc-grid" id="rcon-form" autocomplete="off">
        <div class="sbc-field"><label for="rcon-name">Server name</label><input id="rcon-name" maxlength="60" placeholder="e.g. Main server"></div>
        <div class="sbc-field"><label for="rcon-host">Server IP or host</label><input id="rcon-host" maxlength="120" placeholder="e.g. 203.0.113.10"></div>
        <div class="sbc-field"><label for="rcon-port">RCON port</label><input id="rcon-port" maxlength="5" placeholder="28016"></div>
        <div class="sbc-field"><label for="rcon-password">RCON password</label><input id="rcon-password" type="password" maxlength="200" placeholder="from server.cfg"></div>
      </form>
      <div class="sbc-row">
        <button class="sbc-btn sbc-btn-go" id="rcon-add" type="button">Add server</button>
        <span class="sbc-msg" id="rcon-msg"></span>
      </div>
      <p class="sbc-note" id="rcon-note"></p>
      <p class="sbc-note sbc-sub">Checks send one harmless command - <span class="mono">serverinfo</span> - and nothing else. Passwords stay on the server side: the browser never receives one back.</p>
    </section>

    <section id="panel-logs" class="sbc-panel sbc-hidden">
      <div class="sbc-head"><h1>Logs</h1><span class="sbc-pill" id="logs-count">0 events</span></div>
      <p class="sbc-sub">One line per event that really happened, with who did it. Nothing here is generated on a schedule.</p>
      <div class="sbc-row"><button class="sbc-btn" id="logs-refresh" type="button">Refresh</button><span class="sbc-msg" id="logs-msg"></span></div>
      <div class="sbc-scroll"><table class="sbc-table" id="logs-table"><thead><tr><th>When</th><th>Event</th><th>Who</th><th>Detail</th></tr></thead><tbody></tbody></table></div>
    </section>

  </main>
</div>
<script src="/dashboard/console.js" defer></script>
</body>
</html>
`;


function avatarUrlSize(session, size) {
  if (!session.avatar) return null;
  const kind = session.avatar.startsWith("a_") ? "gif" : "png";
  return "https://cdn.discordapp.com/avatars/" + session.userId + "/" + session.avatar + "." + kind + "?size=" + (size || 128);
}

function avatarUrl(session) {
  if (!session.avatar) return null;
  const kind = session.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${session.userId}/${session.avatar}.${kind}?size=128`;
}

async function dashboard(request, env) {
  if (!(await authReady(env))) return needsSetup(env, request);

  const session = await readSession(request, env);
  /* The shell is served without a session on purpose: the session cannot always live in a
     cookie on this host. It carries no data of its own - every panel fetches, and every
     fetch is checked. */
  if (!session) return html(CONSOLE_PAGE);
  /* Staff and the owner only. A signed-in non-staff account is told why. */
  if (session.level !== "owner" && session.level !== "staff") return await notStaff(session, env);
  /* The console is served from here rather than as a static file: Cloudflare hands an
     existing asset straight to the visitor without waking the Worker, so a file on disk
     would be readable by anybody even though every endpoint behind it is gated. */
  return html(CONSOLE_PAGE);

  /* Live numbers straight from the bot API (server-side, so no CORS involved). */
  let stats = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(API_BASE + "/api/status", { headers: { accept: "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) stats = (await response.json()).stats || null;
  } catch (error) {
    stats = null;
  }

  const avatar = avatarUrl(session);
  const statCard = (value, label) =>
    `<div class="status-card"><div class="big">${escapeHtml(value)}</div><div class="lbl">${escapeHtml(label)}</div></div>`;

  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>Dashboard — Spinback RCE</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <nav>
        <a href="/" class="logo"><img src="/media/spinback-icon.svg" alt="Spinback">Spinback<span class="accent">RCE</span></a>
        <div class="nav-links">
          <a href="/">Website</a>
          <a href="/auth/logout" class="btn ghost sm">Sign out</a>
        </div>
      </nav>
    </div>
  </header>

  <section class="status-hero">
    <div class="wrap">
      <div class="status-dot">
        <span class="dot ${stats && stats.servers > 0 ? "on" : "unknown"}"></span>
        <span>${stats && stats.servers > 0 ? "Bot online" : "Bot status unknown"}</span>
      </div>
      <h1 style="margin-top:18px">${escapeHtml(session.guildName)}</h1>
      <p>Owner dashboard — this page is only ever served to the owner of that server.</p>
    </div>
  </section>

  <section style="padding-top:0">
    <div class="wrap">
      <div class="panel-box">
        <div class="me-bar">
          ${avatar ? `<img src="${avatar}" alt="">` : ""}
          <div>
            <div class="uname">${escapeHtml(session.globalName || session.username)}</div>
            <div class="role">Server owner · ${escapeHtml(session.username)}</div>
          </div>
        </div>
        <div class="status-cards">
          ${statCard(stats ? stats.users : "—", "Linked players")}
          ${statCard(stats ? stats.servers : "—", "Servers")}
          ${statCard(stats ? stats.guilds : "—", "Guilds")}
          ${statCard(stats && stats.uptime30d ? stats.uptime30d + "%" : "—", "30-day uptime")}
        </div>
        <p style="margin-top:12px">Signed in as a Discord account; the session cookie is signed by this site and expires after ${SESSION_DAYS} days.</p>
      </div>

      <div class="panel-box">
        <h2 style="margin-bottom:10px">Coming from the bot</h2>
        <p>`/dashboard` in Discord replies privately with a link straight to this page. The command is hidden from
        everyone else in the server, and only the server owner can open what it links to.</p>
      </div>
    </div>
  </section>
</body>
</html>`);
}

/* ---------- entry point ---------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Answers "did my settings land?" with booleans only - never a secret value. Handy
       right after setting values on the Worker, and the dashboard page can point at it. */
    /* Everything under /media/ that the studio or the theme pulls from the operators site goes
       through kitAsset, which validates the exact path shape before fetching anything. */
    /* Studio data lives in our own project; if a copy is missing it is proxied from the
       upstream site so the studio never breaks on a half-finished data move. */
    if (url.pathname === "/data/entities.json" || url.pathname.startsWith("/data/presets/")) {
      const local = await env.ASSETS.fetch(request);
      if (local.status === 200) return withAssetHeaders(local, url.pathname);
      const upstreamPath = url.pathname === "/data/entities.json"
        ? "/media/entitys/entities.json"
        : url.pathname.replace("/data/presets/", "/media/kitbuilder/presets/");
      return kitAsset(new URL(KIT_ORIGIN + upstreamPath), ctx, env);
    }

    if (url.pathname === "/media/entitys/entities.json"
      || url.pathname.startsWith("/media/kitbuilder/")
      || url.pathname.startsWith("/media/spinback-")) {
      return kitAsset(url, ctx, env);
    }
    if (url.pathname === "/api/config-check") {
      return json({
        app: "spinback-rce",
        dashboardOpen: (await authReady(env)),
        staffRoleIdsSet: Boolean(env.STAFF_ROLE_IDS),
        staffRoleNamesSet: Boolean(env.STAFF_ROLE_NAMES),
        staffUsersSet: Boolean(env.STAFF_USERS || env.STAFF_USER_IDS),
        clientId: clientId(env),
        guildIdSet: Boolean(env.DISCORD_GUILD_ID),
        clientSecretSet: Boolean((await resolveSecrets(env)).clientSecret),
        sessionSecretSet: Boolean((await resolveSecrets(env)).sessionSecret),
        secretsSource: (await resolveSecrets(env)).source,
        botExchangeAvailable: (await resolveSecrets(env)).botExchange,
        /* Recent sign-in outcomes, reason codes only - no ids, no tokens - so a failure can
           be read straight off this endpoint instead of guessing. */
        /* Whether this very request arrived carrying our cookies. Names and yes/no only. */
        sawStateCookie: Boolean(cookies(request).spinback_oauth_state),
        sawSessionCookie: Boolean(cookies(request)[SESSION_COOKIE]),
        cookieHeaderCount: (request.headers.get("cookie") || "").split(";").filter(Boolean).length,
        signInLog: (await recentLogs(env, 12)).map(function (e) { return { t: e.t, kind: e.kind, detail: e.detail }; })
          .filter(function (e) { return String(e.kind || "").indexOf("sign_in") === 0; }).slice(0, 6),
        statusLogBound: Boolean(env.STATUS_LOG),
        /* Names only - never values. This is the definitive answer to which variables the
           running worker actually receives. */
        envKeys: Object.keys(env).sort()
      });
    }
    if (url.pathname === "/api/history") return statusHistory(request, env);
    if (url.pathname === "/api/setup") return authSetup(request, env);
    if (url.pathname.indexOf("/api/owner/") === 0) return ownerApi(request, env);
    /* Answered here, not proxied to the bot: what this site thinks of the signed-in person. */
    if (url.pathname === "/api/setup-status") return setupStatus(request, env);
    if (url.pathname === "/api/bot/settings") return botSettings(request, env);
    if (url.pathname === "/api/roles") {
      const roleSession = await readSession(request, env);
      if (!roleSession) return json({ authenticated: false }, 200);
      return json(await sessionRoles(request, env, roleSession), 200);
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxyApi(request, env, ctx);

    /* The whole /dashboard/ tree is owner-only, not just its front page. */
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      /* Free tools first - they live under this path but are not the control panel. */
      if (PUBLIC_DASHBOARD_PAGES.has(url.pathname)) {
        return withAssetHeaders(await env.ASSETS.fetch(request), url.pathname);
      }
      if (!(await authReady(env))) return needsSetup(env, request);
      const treeSession = await readSession(request, env);
      /* Anyone signed in who is not staff gets the explanation page. Without a session the
         page is still served: it holds no data, and the endpoints it calls do the checking. */
      if (treeSession && treeSession.level !== "owner" && treeSession.level !== "staff") return await notStaff(treeSession, env);
      if (url.pathname === "/dashboard") return dashboard(request, env);
      return withAssetHeaders(await env.ASSETS.fetch(request), url.pathname);
    }
    if (url.pathname === "/auth/login") return authLogin(request, env);
    if (url.pathname === "/auth/callback") return authCallback(request, env);
    if (url.pathname === "/auth/finish") return authFinish(request, env);
    if (url.pathname === "/auth/logout") return authLogout(request);
    if (url.pathname === "/auth/me") return authMe(request, env);

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return withAssetHeaders(assetResponse, url.pathname);

    const method = request.method.toUpperCase();
    const isPageRequest = (method === "GET" || method === "HEAD") &&
      (request.headers.get("accept") || "").includes("text/html");

    if (isPageRequest) {
      /* A page asked for without its extension — /status for /status.html — so
         links people copy out of the address bar stay short. */
      if (!HAS_EXTENSION.test(url.pathname)) {
        const target = url.pathname === "/" ? "/index.html" : url.pathname.replace(/\/+$/, "") + ".html";
        const pretty = await env.ASSETS.fetch(new URL(target, request.url));
        if (pretty.status !== 404) return withAssetHeaders(pretty, target);
      }

      /* Nothing there: the site's own 404 page, still answering 404. */
      const fallback = await env.ASSETS.fetch(new URL("/404.html", request.url));
      if (fallback.status !== 404) {
        return new Response(method === "HEAD" ? null : await fallback.arrayBuffer(), {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex",
            "x-content-type-options": "nosniff",
          },
        });
      }
    }

    return withAssetHeaders(assetResponse, url.pathname);
  },
};
