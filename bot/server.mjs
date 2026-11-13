/* ==========================================================================
   Spinback RCE — the bot process. This is what runs on Railway.
   --------------------------------------------------------------------------
   Why the bot never came online: this file used to be an interactions endpoint
   only. A server that just answers Discord's signed POSTs holds no gateway
   connection, so Discord has nothing to show in the member list and the bot
   looks offline forever. Interactions endpoints are for commands you register
   and call; they are not a presence.

   This file now does both jobs:
     1. logs in to the Discord gateway with DISCORD_BOT_TOKEN, so the bot shows
        as online with a presence, and answers /dashboard over the gateway;
     2. keeps serving the same signed interactions endpoint as a fallback,
        using the handler in interactions-worker.js unchanged.
   It also answers GET /healthz, which is what Railway watches.
   ========================================================================== */

import { createServer } from 'node:http';
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, Events, MessageFlags } from 'discord.js';
import handler from './interactions-worker.js';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { timingSafeEqual } from 'node:crypto';

const SITE_URL = (process.env.SITE_URL || 'https://spinback-j7ao5f.camelai.app').replace(/\/+$/, '');
/* Hosts hand the token in as an environment variable, and the name people give it
   varies. Look for the usual names, then anything token-shaped, and strip the quotes
   and stray whitespace that come along when a value is pasted into a web form. The
   value itself is never logged - only which variable it came from and its shape. */
const TOKEN_NAMES = ['DISCORD_BOT_TOKEN', 'DISCORD_TOKEN', 'BOT_TOKEN', 'TOKEN', 'DISCORD_BOT', 'DISCORD_APPLICATION_BOT_TOKEN', 'SPINBACK_BOT_TOKEN'];
function cleanEnvValue(v) {
  return String(v == null ? '' : v).trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
}
function readToken(envVars) {
  for (const name of TOKEN_NAMES) {
    const value = cleanEnvValue(envVars[name]);
    if (value) return { token: value, source: name };
  }
  const loose = Object.keys(envVars).find((k) => /token/i.test(k) && !/SECRET|KEY|PUBLIC/i.test(k));
  if (loose) return { token: cleanEnvValue(envVars[loose]), source: loose + ' (matched by name)' };
  return { token: '', source: null };
}
const TOKEN_INFO = readToken(process.env);

/* The website asks this service to swap an OAuth code for a token, so the client secret
   has to live in exactly one place. A code that was not issued to this application fails
   at Discord before it reaches us, so this route cannot be abused as an open proxy. */
const CLIENT_ID = cleanEnvValue(process.env.DISCORD_CLIENT_ID) || '1570023832717361213';
const CLIENT_SECRET = (function () {
  const names = ['DISCORD_CLIENT_SECRET', 'CLIENT_SECRET', 'DISCORD_OAUTH_SECRET', 'OAUTH_SECRET'];
  for (const name of names) {
    const value = cleanEnvValue(process.env[name]);
    if (value) return value;
  }
  for (const key of Object.keys(process.env)) {
    if (/client.?secret/i.test(key)) {
      const value = cleanEnvValue(process.env[key]);
      if (value) return value;
    }
  }
  return '';
})();
const TOKEN = TOKEN_INFO.token;
const tokenShape = !TOKEN ? 'empty'
  : (/^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/.test(TOKEN) ? 'discord-token' : 'unexpected-shape');
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const OWNER_ID = process.env.DISCORD_GUILD_OWNER_ID || '';
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '';
const PORT = Number(process.env.PORT || 8080);
/* Bind every interface: Railway's proxy reaches the container from outside it, so a
   server on 127.0.0.1 would answer nothing and the public domain would 502. */
const HOST = process.env.HOST || '0.0.0.0';

const state = { gateway: 'starting', tag: null, guilds: 0, command: null, since: Date.now(), error: null, lastHeartbeat: null, latencyMs: null };
const log = (...a) => console.log('[spinback]', ...a);

/* What the status page prints as the version. Railway sets RAILWAY_GIT_COMMIT_SHA on every
   deploy from GitHub, so the page can show which commit is live and notice a new deploy. */
const VERSION = 'Spinback RCE bot' + (process.env.RAILWAY_GIT_COMMIT_SHA ? ' ' + String(process.env.RAILWAY_GIT_COMMIT_SHA).slice(0, 7) : '');

/* A stray rejected promise (a reply to an interaction that expired, a REST call that timed
   out) would otherwise end the process, and Railway stops restarting after ten failures. */
process.on('unhandledRejection', (reason) => {
  log('unhandled rejection:', String((reason && reason.stack) || reason).slice(0, 500));
});

/* ---------------------------------------------------------------- gateway -- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  state.gateway = 'online';
  state.tag = c.user.tag;
  state.guilds = c.guilds.cache.size;
  log('logged in as ' + c.user.tag + ' — in ' + c.guilds.cache.size + ' guild(s)');
  try {
    c.user.setPresence({ status: 'online', activities: [{ name: '/dashboard — Spinback RCE', type: 0 }] });
    if (!GUILD_ID) {
      log('WARNING: DISCORD_GUILD_ID is not set, so no command was registered');
      return;
    }
    const guild = c.guilds.cache.get(GUILD_ID) || await c.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      state.error = 'the bot is not in guild ' + GUILD_ID;
      log('WARNING: the bot is not in that server yet — invite it with its own invite link');
      return;
    }
    /* One bulk overwrite: the guild ends up with exactly this command and nothing stale.
       (The old code called .set([]) on the fetched Collection, which is Map.set and
       cleared nothing on Discord.) */
    const saved = await guild.commands.set([{
      name: 'dashboard',
      description: 'Links to the Spinback RCE tools: Kit Studio, Colour Studio and status',
      dm_permission: false,
      default_member_permissions: PermissionFlagsBits.Administrator,
    }]);
    const cmd = saved.find((c) => c.name === 'dashboard');
    state.command = cmd ? cmd.id : null;
    log('/dashboard registered in ' + guild.name + ' (visible to administrators only)');
    /* The website reads this to turn the role ids Discord gives it into names, so it can
       tell a staff role from any other. Role names are already visible to every member. */
    state.guildInfo = {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      /* The icon hash, so the website can show a server's real picture. */
      icon: guild.icon || null,
      roles: guild.roles.cache
        .filter((r) => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, position: r.position })),
    };
    log('exposed ' + state.guildInfo.roles.length + ' role(s) for the website');
  } catch (e) {
    state.error = String((e && e.message) || e);
    log('command registration failed:', state.error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'dashboard') return;
  /* The guild's own owner record is the fallback, so the command works even before the
     owner id variable has been set. */
  const ownerId = OWNER_ID || (state.guildInfo && state.guildInfo.ownerId) || '';
  const isOwner = !!ownerId && interaction.user.id === ownerId;
  const rightGuild = !!GUILD_ID && interaction.guildId === GUILD_ID;
  if (!isOwner || !rightGuild) {
    await interaction.reply({ content: 'This command is only for the server owner.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  /* The owner console was retired: /dashboard on the site now opens the Kit Studio, so the
     reply points at what is really there instead of promising a sign-in page. */
  await interaction.reply({
    content: [
      '**Spinback RCE tools**',
      'Kit Studio: ' + SITE_URL + '/dashboard/kitbuilder.html',
      'Colour Studio: ' + SITE_URL + '/dashboard/colortext.html',
      'Status: ' + SITE_URL + '/status',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  log('dashboard opened for ' + interaction.user.tag);
});

client.on(Events.Error, (e) => log('gateway error:', String((e && e.message) || e)));
/* The gateway heartbeat is the best proof the connection is really alive: the API can answer
   while the gateway is wedged. discord.js reports each acknowledged heartbeat on its debug
   channel. The status page only shows a heartbeat once one has really been seen, so if this
   wording ever changes the page says "not reported" instead of raising a false alarm. */
client.on(Events.Debug, (message) => {
  const text = String(message || '');
  if (!/heartbeat acknowledged/i.test(text)) return;
  state.lastHeartbeat = Date.now();
  const latency = /latency of (\d+)\s*ms/i.exec(text);
  if (latency) state.latencyMs = Number(latency[1]);
});
client.on(Events.ShardDisconnect, (code) => { state.gateway = 'disconnected'; log('gateway disconnected, code', code); });
client.on(Events.ShardReconnecting, () => { state.gateway = 'reconnecting'; log('gateway reconnecting'); });

/* ------------------------------------------------ gateway watchdog ---------- */
/* Discord drops a gateway connection from time to time and discord.js retries by itself.
   Sometimes a reconnect never completes: the process stays healthy, its HTTP routes answer,
   but no command can ever arrive. This notices that and forces a fresh login, slowly, so a
   real Discord outage is not turned into a login storm. */

let forcedLogins = 0;
let lastForced = 0;
let gatewayDownSince = 0;

async function relogin(reason) {
  if (!TOKEN) return;
  if (Date.now() - lastForced < 120000) {
    log('relogin skipped for now (' + reason + ') - last attempt was under two minutes ago');
    return;
  }
  lastForced = Date.now();
  forcedLogins += 1;
  log('forcing a fresh login: ' + reason + ' (attempt ' + forcedLogins + ')');
  state.gateway = 'forcing-login';
  try { client.destroy(); } catch (e) { /* already gone */ }
  try {
    await client.login(TOKEN);
  } catch (e) {
    state.error = String((e && e.message) || e);
    state.gateway = /token|unauthor|401/i.test(state.error) ? 'invalid-token' : 'login-failed';
    log('forced login failed:', state.error);
  }
}

setInterval(() => {
  if (!TOKEN) return;
  if (state.gateway === 'online') { gatewayDownSince = 0; return; }
  if (!gatewayDownSince) gatewayDownSince = Date.now();
  const downFor = Date.now() - gatewayDownSince;
  if (downFor > 180000) relogin('gateway down for ' + Math.round(downFor / 1000) + ' seconds');
}, 30000);


let loginAttempts = 0;
async function connect() {
  if (!TOKEN) {
    state.gateway = 'no-token';
    log('no Discord token found on this service. Looked for: ' + TOKEN_NAMES.join(', '));
    log('Railway -> the service that owns your domain -> Variables -> DISCORD_BOT_TOKEN, then it redeploys.');
    return;
  }
  loginAttempts += 1;
  state.gateway = 'logging-in';
  log('logging in (attempt ' + loginAttempts + ') using ' + TOKEN_INFO.source + ', ' + TOKEN.length + ' characters, shape ' + tokenShape);
  try {
    await client.login(TOKEN);
  } catch (e) {
    state.error = String((e && e.message) || e);
    state.gateway = /token|unauthor|401/i.test(state.error) ? 'invalid-token' : 'login-failed';
    log('login attempt ' + loginAttempts + ' failed:', state.error);
    if (/token|unauthor|401/i.test(state.error)) {
      log('That reads like a token problem: copy it again from the Discord developer portal (Bot -> Reset Token), and check nothing else is running this bot with the same token.');
    }
    if (loginAttempts < 6) {
      const waitMs = Math.min(60000, 5000 * loginAttempts);
      log('retrying in ' + Math.round(waitMs / 1000) + 's');
      const timer = setTimeout(connect, waitMs);
      if (timer.unref) timer.unref();
    }
  }
}
connect();

/* ----------------------------------------------- signed interactions route -- */

function toRequest(req, body) {
  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  });
  const url = 'http://' + (req.headers.host || 'localhost') + (req.url || '/');
  const method = req.method || 'GET';
  return new Request(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

const env = {
  DISCORD_PUBLIC_KEY: PUBLIC_KEY,
  DISCORD_GUILD_ID: GUILD_ID,
  DISCORD_GUILD_OWNER_ID: OWNER_ID,
  SITE_URL,
};

/* --------------------------------------------------------------- RCON ------ */
/* Source RCON is what a Rust server speaks when rcon.web is set to 0. A packet is
   int32 length, int32 id, int32 type, the body, then two null bytes. Type 3 asks to
   authenticate, 2 is a command (and the answer to one), 0 carries a command's output,
   and an auth answer with id -1 means the password was wrong.

   Only a fixed list of harmless commands may be sent, only to public addresses, and
   only a few times a minute: this endpoint is not a port scanner and not a console. */
const RCON_TIMEOUT_MS = 8000;
const RCON_IDLE_MS = 450;
const RCON_ALLOWED = ['serverinfo', 'playerlist', 'status', 'gettime'];
let rconRecent = [];

function rconAllowed() {
  const now = Date.now();
  rconRecent = rconRecent.filter(function (t) { return now - t < 60000; });
  if (rconRecent.length >= 6) return false;
  rconRecent.push(now);
  return true;
}

/* Packets are little-endian. */
function rconPacket(id, type, body) {
  const payload = Buffer.from(String(body), 'utf8');
  const buf = Buffer.alloc(payload.length + 14);
  buf.writeInt32LE(payload.length + 10, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeInt16LE(0, payload.length + 12);
  return buf;
}

/* Pull whatever complete packets have arrived, leaving a partial one for next time. */
function rconParse(buffer) {
  const packets = [];
  let rest = buffer;
  while (rest.length >= 12) {
    const size = rest.readInt32LE(0);
    if (size < 10 || size > 8192) break;
    if (rest.length < size + 4) break;
    packets.push({
      id: rest.readInt32LE(4),
      type: rest.readInt32LE(8),
      body: rest.slice(12, size + 2).toString('utf8'),
    });
    rest = rest.slice(size + 4);
  }
  return { packets: packets, rest: rest };
}

/* Is this literal address somewhere public? Covers the private, loopback, link-local,
   carrier-grade NAT and multicast ranges for IPv4, and the IPv6 equivalents. */
function publicAddress(ip) {
  const a = String(ip || '').toLowerCase();
  if (net.isIPv4(a)) {
    const p = a.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return false;
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return false;
    return true;
  }
  if (net.isIPv6(a)) {
    if (a === '::' || a === '::1') return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return publicAddress(mapped[1]);
    if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a)) return false;
    return true;
  }
  return false;
}

/* A name is resolved here and the connection goes to the address checked, so a public
   looking name that points at a private address (or changes between check and connect)
   cannot reach anything internal. */
async function rconResolve(host) {
  const h = String(host || '').trim().toLowerCase();
  if (net.isIP(h)) return publicAddress(h) ? h : null;
  try {
    const all = await lookup(h, { all: true });
    if (!all.length || all.some((r) => !publicAddress(r.address))) return null;
    return all[0].address;
  } catch (error) {
    return null;
  }
}

/* Nothing on the private internet: that keeps this from being pointed at a local service. */
function rconHostAllowed(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h || h.length > 200) return false;
  if (h === 'localhost' || /\.local$/.test(h) || /\.internal$/.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts.some(function (n) { return !(n >= 0 && n <= 255); })) return false;
    const a = parts[0], b = parts[1];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }
  return /^[a-z0-9][a-z0-9.-]*$/.test(h);
}

async function rconRun(options) {
  const target = rconHostAllowed(options.host) ? await rconResolve(options.host) : null;
  if (!target) {
    return { ok: false, reason: 'refused-host', detail: 'That address is not on the public internet (or does not resolve), so the bot will not connect to it.' };
  }
  return rconConnect(Object.assign({}, options, { address: target }));
}

function rconConnect(options) {
  return new Promise(function (resolve) {
    const started = Date.now();
    const host = String(options.host || '').trim();
    const port = Number(options.port);
    const password = String(options.password || '');
    const asked = String(options.command || 'serverinfo').toLowerCase();
    const command = RCON_ALLOWED.indexOf(asked) > -1 ? asked : 'serverinfo';

    if (!rconHostAllowed(host)) {
      return resolve({ ok: false, reason: 'refused-host', detail: 'That address is not on the public internet, so the bot will not connect to it.' });
    }
    if (!(port >= 1 && port <= 65535)) return resolve({ ok: false, reason: 'refused-port', detail: 'That port number cannot exist.' });
    if (!password) return resolve({ ok: false, reason: 'no-password', detail: 'No RCON password was given for that server.' });

    let socket = null;
    let idle = null;
    let settled = false;
    let buffer = Buffer.alloc(0);
    let authed = false;
    let answer = '';

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(idle);
      try { if (socket) socket.destroy(); } catch (error) { /* already gone */ }
      resolve(Object.assign({ ms: Date.now() - started }, result));
    }

    const timer = setTimeout(function () {
      finish({ ok: false, reason: 'timeout', detail: 'Nothing answered within ' + Math.round(RCON_TIMEOUT_MS / 1000) + ' seconds. Either the port is closed, RCON is off, or rcon.web is set to 1 (this talks the other kind).' });
    }, RCON_TIMEOUT_MS);

    try {
      socket = net.connect({ host: options.address || host, port: port });
    } catch (error) {
      return finish({ ok: false, reason: 'connect-failed', detail: String(error.message || error) });
    }

    socket.on('error', function (error) {
      finish({ ok: false, reason: 'connect-failed', detail: String((error && (error.code || error.message)) || error) });
    });

    socket.on('connect', function () {
      socket.write(rconPacket(1, 3, password));
    });

    socket.on('close', function () {
      if (!settled) finish({ ok: authed, authenticated: authed, command: command, answer: answer.trim().slice(0, 1200), reason: authed ? 'closed' : 'closed-before-auth' });
    });

    socket.on('data', function (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = rconParse(buffer);
      buffer = parsed.rest;
      parsed.packets.forEach(function (packet) {
        if (!authed) {
          if (packet.id === -1) return finish({ ok: false, reason: 'bad-password', detail: 'The server refused that RCON password.' });
          if (packet.type === 2) {
            authed = true;
            socket.write(rconPacket(2, 2, command));
          }
          return;
        }
        if (packet.type === 0) {
          answer += packet.body;
          /* Rust answers in one or more packets; a short silence means it is finished. */
          clearTimeout(idle);
          idle = setTimeout(function () {
            finish({ ok: true, authenticated: true, command: command, answer: answer.trim().slice(0, 1200) });
          }, RCON_IDLE_MS);
        }
      });
    });
  });
}

createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  const statusPaths = ['/', '/health', '/healthz', '/status', '/api/status', '/api/health'];
  /* Every server the bot is in right now. The website asks this before it will set anything
     up: a server Spinback is not in cannot be configured, so the page says so plainly and
     offers the invite instead of pretending otherwise. */
  if (req.method === 'GET' && url === '/api/guilds') {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'cache-control': 'no-store' };
    const guilds = [...client.guilds.cache.values()].map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      ownerId: g.ownerId || null,
    }));
    res.writeHead(200, cors);
    res.end(JSON.stringify({ ready: state.gateway === 'online', gateway: state.gateway, count: guilds.length, guilds }));
    return;
  }

  if (req.method === 'GET' && url === '/api/guild') {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (!state.guildInfo) { res.writeHead(503, cors); res.end(JSON.stringify({ ready: false, reason: state.gateway })); return; }
    res.writeHead(200, cors);
    res.end(JSON.stringify({ ready: true, guild: state.guildInfo }));
    return;
  }
  /* The status page asks this endpoint straight from the browser as well as through the
     site's own proxy, so the read-only status routes have to allow cross-origin reads. */
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-signature-ed25519, x-signature-timestamp',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  /* A stuck gateway cannot ask for help itself, so this exists for a poke. It is rate
     limited inside relogin() and it only ever makes the bot try to log in again. */
  /* Ask a Rust server, over RCON, whether it is really there. The website never sends a
     password to a browser: it calls this with the connection it has stored. */
  if (req.method === 'POST' && url === '/api/rcon/test') {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (!rconAllowed()) {
      res.writeHead(429, cors);
      res.end(JSON.stringify({ ok: false, reason: 'rate-limited', detail: 'Six checks a minute is the limit. Try again shortly.' }));
      return;
    }
    let raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > 4096) { try { req.destroy(); } catch (error) { /* already gone */ } }
    });
    req.on('end', async function () {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (error) { body = {}; }
      let answer;
      try {
        answer = await rconRun({ host: body.host, port: body.port, password: body.password, command: body.command });
      } catch (error) {
        answer = { ok: false, reason: 'unexpected', detail: String(error && error.message ? error.message : error) };
      }
      res.writeHead(200, cors);
      res.end(JSON.stringify(answer));
    });
    return;
  }

  /* Read-only settings hand-off, so the panels in the dashboard actually take effect.
     It stays shut until BOT_SETTINGS_TOKEN is set on this service, because an open
     settings endpoint would be a way to read a server's credentials. */
  if (req.method === 'GET' && url === '/api/site-settings') {
    const cors = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    const expected = cleanEnvValue(process.env.BOT_SETTINGS_TOKEN || '');
    if (!expected) {
      res.writeHead(503, cors);
      res.end(JSON.stringify({ ok: false, reason: 'no-token', detail: 'Set BOT_SETTINGS_TOKEN on this service to the same value as on the website.' }));
      return;
    }
    const given = String(req.headers['x-settings-token'] || '');
    const a = Buffer.from(given), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.writeHead(403, cors);
      res.end(JSON.stringify({ ok: false, reason: 'bad-token' }));
      return;
    }
    const origin = cleanEnvValue(process.env.SITE_ORIGIN || 'https://spinback-j7ao5f.camelai.app');
    try {
      const response = await fetch(origin + '/api/bot/settings', { headers: { 'x-settings-token': given, accept: 'application/json' } });
      const text = await response.text();
      res.writeHead(response.status, cors);
      res.end(text);
    } catch (error) {
      res.writeHead(502, cors);
      res.end(JSON.stringify({ ok: false, reason: 'site-unreachable', detail: String(error && error.message ? error.message : error) }));
    }
    return;
  }

  if (url === '/api/reconnect') {
    const cors = Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS);
    req.resume();
    if (!TOKEN) { res.writeHead(503, cors); res.end(JSON.stringify({ ok: false, reason: 'no-token' })); return; }
    if (state.gateway === 'online') { res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, already: 'online', gateway: state.gateway })); return; }
    await relogin('asked by a request');
    res.writeHead(200, cors);
    res.end(JSON.stringify({ ok: true, gateway: state.gateway, forcedLogins: forcedLogins }));
    return;
  }
  if (req.method === 'POST' && url === '/api/oauth/exchange') {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384 && !tooBig) { tooBig = true; req.destroy(); }
    });
    req.on('end', async () => {
      if (tooBig) return;
      const cors = Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS);
      if (!CLIENT_SECRET) {
        res.writeHead(503, cors);
        res.end(JSON.stringify({ ok: false, error: 'no_client_secret', message: 'this service has no DISCORD_CLIENT_SECRET set' }));
        return;
      }
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (e) { parsed = {}; }
      const code = String(parsed.code || '');
      const redirectUri = String(parsed.redirectUri || '');
      if (!code || !redirectUri) {
        res.writeHead(400, cors);
        res.end(JSON.stringify({ ok: false, error: 'bad_request', message: 'send code and redirectUri' }));
        return;
      }
      try {
        const form = new URLSearchParams();
        form.set('grant_type', 'authorization_code');
        form.set('code', code);
        form.set('redirect_uri', redirectUri);
        const upstream = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          },
          body: form.toString(),
        });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok || !data.access_token) {
          res.writeHead(upstream.status || 502, cors);
          res.end(JSON.stringify({ ok: false, error: data.error || 'exchange_failed', status: upstream.status, description: data.error_description || null }));
          return;
        }
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, access_token: data.access_token, token_type: data.token_type, expires_in: data.expires_in, scope: data.scope }));
      } catch (e) {
        res.writeHead(502, cors);
        res.end(JSON.stringify({ ok: false, error: 'unreachable', message: String((e && e.message) || e).slice(0, 140) }));
      }
    });
    return;
  }
  if (req.method === 'GET' && statusPaths.indexOf(url) !== -1) {
    res.writeHead(200, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS));
    res.end(JSON.stringify({
      service: 'spinback-rce-bot',
      version: VERSION,
      /* Left out until a heartbeat has actually been acknowledged (see the Debug listener). */
      lastHeartbeat: state.lastHeartbeat || undefined,
      latencyMs: state.latencyMs === null ? undefined : state.latencyMs,
      /* online is the field the status page reads. Without it the page assumed the bot
         was up whenever it got an answer at all, which is how a tokenless process could
         be announced as online. */
      online: state.gateway === 'online',
      ok: state.gateway === 'online',
      gateway: state.gateway,
      tag: state.tag,
      guilds: state.guilds,
      command: state.command,
      port: PORT,
      host: HOST,
      tokenPresent: !!TOKEN,
      tokenSource: TOKEN_INFO.source,
      oauthExchange: !!CLIENT_SECRET,
      clientIdPresent: !!CLIENT_ID,
      tokenShape: tokenShape,
      tokenLength: TOKEN.length,
      loginAttempts: loginAttempts,
      lookedFor: TOKEN_NAMES,
      siteUrl: SITE_URL,
      interactions: !!PUBLIC_KEY,
      guildConfigured: !!GUILD_ID && !!(OWNER_ID || (state.guildInfo && state.guildInfo.ownerId)),
      ownerKnown: !!(OWNER_ID || (state.guildInfo && state.guildInfo.ownerId)),
      ownerSource: OWNER_ID ? 'DISCORD_GUILD_OWNER_ID' : (state.guildInfo && state.guildInfo.ownerId ? 'the guild owner record' : null),
      forcedLogins: forcedLogins,
      gatewayDownSeconds: gatewayDownSince ? Math.round((Date.now() - gatewayDownSince) / 1000) : 0,
      error: state.error,
      uptimeSeconds: Math.round((Date.now() - state.since) / 1000),
      /* Only what this process really knows, so the site never shows invented numbers. */
      stats: { guilds: state.guilds, gateway: state.gateway },
      guildInfo: state.guildInfo || null,
    }));
    return;
  }
  /* Discord's interaction payloads are a few kilobytes; anything near a megabyte is not
     Discord, and buffering it without a limit would let anyone fill this process's memory. */
  let raw = '';
  let refused = false;
  req.on('data', (c) => {
    if (refused) return;
    raw += c;
    if (raw.length > 1048576) {
      refused = true;
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end('{"error":"payload too large"}');
      req.destroy();
    }
  });
  req.on('end', async () => {
    if (refused) return;
    try {
      const response = await handler.fetch(toRequest(req, raw), env);
      const text = await response.text();
      const headers = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(response.status, headers);
      res.end(text);
    } catch (e) {
      log('interaction failed:', String((e && e.message) || e));
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"handler failed"}');
    }
  });
}).listen(PORT, HOST, () => {
  log('listening on ' + HOST + ':' + PORT + ' — health at /healthz');
  log('config: token=' + (TOKEN ? 'set' : 'MISSING') + ' guild=' + (GUILD_ID || 'unset') + ' owner=' + (OWNER_ID || 'unset') + ' publicKey=' + (PUBLIC_KEY ? 'set' : 'unset'));
  log('PORT was provided by the platform as "' + String(process.env.PORT || '(not set, defaulted to 8080)') + '"');
  if (!TOKEN) log('the bot has no token, so it will not come online — set DISCORD_BOT_TOKEN on this Railway service');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down');
    Promise.resolve(client.destroy()).catch(() => {}).finally(() => process.exit(0));
  });
}