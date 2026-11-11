/* ==========================================================================
   RustyWorks RCE — site worker
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

const API_BASE = "https://api.rustyworksrce.xyz";
const API_TIMEOUT_MS = 8000;
const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "rw_session";
const SESSION_DAYS = 7;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

/* The application id is public — it is in every invite link on the site — so it
   can carry a default. The client secret, guild id and session secret cannot. */
const DEFAULT_CLIENT_ID = "1468652543012896854";
const NEXT_COOKIE = "rw_oauth_next";

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

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = cookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const expected = base64url(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), new TextEncoder().encode(payload)));
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

/* ---------- the bot API proxy ---------- */

async function proxyApi(request) {
  const requestUrl = new URL(request.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const upstream = await fetch(API_BASE + requestUrl.pathname + requestUrl.search, {
      method: request.method === "HEAD" ? "GET" : request.method,
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    return new Response(request.method === "HEAD" ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return json({ error: "api_unreachable" }, 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Discord sign-in ---------- */

function clientId(env) {
  return env.DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID;
}

function authConfigured(env) {
  return Boolean(clientId(env) && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID && env.SESSION_SECRET);
}

/* Only same-site paths are ever accepted as a post-sign-in destination, so a
   crafted ?next= cannot bounce somebody off to another host. */
function safeNext(value) {
  const path = String(value == null ? "" : value);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://")) return "/dashboard";
  return path;
}

function needsSetup(env) {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard not configured</title><link rel="stylesheet" href="/style.css"></head>
<body><header><div class="wrap"><nav><a href="/" class="logo">RustyWorks<span class="accent">RCE</span></a></nav></div></header>
<section class="page-hero"><div class="wrap"><h1>Dashboard needs a few secrets</h1>
<p>Set <code>DISCORD_CLIENT_SECRET</code>, <code>DISCORD_GUILD_ID</code> and
<code>SESSION_SECRET</code> on this Worker, then reload. Until then the dashboard stays closed —
the rest of the site works normally.</p>
<p><a class="btn" href="/">Back to the site</a></p></div></section></body></html>`, 503);
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...headers } });
}

async function authLogin(request, env) {
  if (!authConfigured(env)) return needsSetup(env);
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  /* Already signed in? Go straight where they were headed. */
  if (await readSession(request, env)) return redirect(next);

  const state = randomToken(16);
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId(env));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", url.origin + "/auth/callback");
  authorize.searchParams.set("scope", "identify guilds");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "none");
  const headers = new Headers();
  headers.append("set-cookie", cookieHeader("rw_oauth_state", state, 600));
  headers.append("set-cookie", cookieHeader(NEXT_COOKIE, next, 600));
  return redirect(authorize.toString(), headers);
}

async function authCallback(request, env) {
  if (!authConfigured(env)) return needsSetup(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies(request).rw_oauth_state;

  if (url.searchParams.get("error")) return html("<p>Discord refused the sign-in. <a href=\"/dashboard\">Try again</a>.</p>", 400);
  if (!code || !state || !expectedState || !sameString(state, expectedState)) {
    return html("<p>That sign-in link is stale or came from somewhere else. <a href=\"/dashboard\">Start again</a>.</p>", 400);
  }

  const tokenResponse = await fetch(DISCORD_API + "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: url.origin + "/auth/callback",
    }),
  });
  if (!tokenResponse.ok) return html("<p>Discord would not exchange that sign-in code. <a href=\"/dashboard\">Try again</a>.</p>", 502);
  const token = await tokenResponse.json();

  const headers = { authorization: "Bearer " + token.access_token };
  const [userResponse, guildsResponse] = await Promise.all([
    fetch(DISCORD_API + "/users/@me", { headers }),
    fetch(DISCORD_API + "/users/@me/guilds", { headers }),
  ]);
  if (!userResponse.ok || !guildsResponse.ok) return html("<p>Could not read your Discord account. <a href=\"/dashboard\">Try again</a>.</p>", 502);

  const user = await userResponse.json();
  const guilds = await guildsResponse.json();
  const guild = Array.isArray(guilds) ? guilds.find((g) => String(g.id) === String(env.DISCORD_GUILD_ID)) : null;

  /* owner === true is only set for guilds the signed-in account owns, which is
     exactly the rule for this dashboard. */
  /* Signed in, but not the owner of the one guild this bot serves. The login
     page explains what that means; no session cookie is handed out. */
  if (!guild || guild.owner !== true) return redirect("/login.html?denied=1");

  const session = {
    userId: user.id,
    username: user.username,
    globalName: user.global_name || null,
    avatar: user.avatar || null,
    guildId: guild.id,
    guildName: guild.name,
    exp: Date.now() + SESSION_DAYS * 86400000,
  };

  const sessionHeaders = new Headers();
  sessionHeaders.append("set-cookie", cookieHeader(SESSION_COOKIE, await signSession(session, env.SESSION_SECRET), SESSION_DAYS * 86400));
  sessionHeaders.append("set-cookie", cookieHeader(NEXT_COOKIE, "", 0));
  return redirect(safeNext(cookies(request)[NEXT_COOKIE]), sessionHeaders);
}

function authLogout(request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  return redirect(next === "/dashboard" ? "/" : next, { "set-cookie": cookieHeader(SESSION_COOKIE, "", 0) });
}

/* Read by nav-auth.js (the header capsule) and login.html. Never carries
   anything the signed-in person does not already own. */
async function authMe(request, env) {
  if (!authConfigured(env)) return json({ authenticated: false, configured: false }, 200);
  const session = await readSession(request, env);
  if (!session) return json({ authenticated: false, configured: true }, 200);
  return json({
    authenticated: true,
    configured: true,
    user: {
      id: session.userId,
      username: session.username,
      name: session.globalName || session.username,
      avatar: avatarUrl(session),
    },
    guild: { id: session.guildId, name: session.guildName },
    role: "owner",
  }, 200);
}

/* ---------- the owner-only dashboard ---------- */

function avatarUrl(session) {
  if (!session.avatar) return null;
  const kind = session.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${session.userId}/${session.avatar}.${kind}?size=128`;
}

async function dashboard(request, env) {
  if (!authConfigured(env)) return needsSetup(env);

  const session = await readSession(request, env);
  if (!session) return redirect("/auth/login");

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
  <title>Dashboard — RustyWorks RCE</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <nav>
        <a href="/" class="logo"><img src="/media/rustyworks-icon.svg" alt="RustyWorks">RustyWorks<span class="accent">RCE</span></a>
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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxyApi(request);

    /* The whole /dashboard/ tree is owner-only, not just its front page. */
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      if (!authConfigured(env)) return needsSetup(env);
      if (!(await readSession(request, env))) {
        return redirect("/auth/login?next=" + encodeURIComponent(url.pathname + url.search));
      }
      if (url.pathname === "/dashboard") return dashboard(request, env);
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === "/auth/login") return authLogin(request, env);
    if (url.pathname === "/auth/callback") return authCallback(request, env);
    if (url.pathname === "/auth/logout") return authLogout(request);
    if (url.pathname === "/auth/me") return authMe(request, env);

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const method = request.method.toUpperCase();
    const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
    if ((method === "GET" || method === "HEAD") && acceptsHtml && !HAS_EXTENSION.test(url.pathname)) {
      return env.ASSETS.fetch(new URL("/index.html", request.url));
    }

    return assetResponse;
  },
};
