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