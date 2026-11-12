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
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, Events } from 'discord.js';
import handler from './interactions-worker.js';

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

const state = { gateway: 'starting', tag: null, guilds: 0, command: null, since: Date.now(), error: null };
const log = (...a) => console.log('[spinback]', ...a);

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
    const existing = await guild.commands.fetch();
    await existing.set([]);
    const cmd = await guild.commands.create({
      name: 'dashboard',
      description: 'Open the Spinback RCE owner console for this server',
      dm_permission: false,
      default_member_permissions: PermissionFlagsBits.Administrator,
    });
    state.command = cmd.id;
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
    await interaction.reply({ content: 'This command is only for the server owner.', ephemeral: true }).catch(() => {});
    return;
  }
  await interaction.reply({
    content: 'Owner console: ' + SITE_URL + '/dashboard\nSign in with Discord and everything is on that page.',
    ephemeral: true,
  }).catch(() => {});
  log('dashboard opened for ' + interaction.user.tag);
});

client.on(Events.Error, (e) => log('gateway error:', String((e && e.message) || e)));
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
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
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
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
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