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
  } catch (e) {
    state.error = String((e && e.message) || e);
    log('command registration failed:', state.error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'dashboard') return;
  const isOwner = !!OWNER_ID && interaction.user.id === OWNER_ID;
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
  if (req.method === 'GET' && statusPaths.indexOf(url) !== -1) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
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
      tokenShape: tokenShape,
      tokenLength: TOKEN.length,
      loginAttempts: loginAttempts,
      lookedFor: TOKEN_NAMES,
      siteUrl: SITE_URL,
      interactions: !!PUBLIC_KEY,
      guildConfigured: !!GUILD_ID && !!OWNER_ID,
      error: state.error,
      uptimeSeconds: Math.round((Date.now() - state.since) / 1000),
      /* Only what this process really knows, so the site never shows invented numbers. */
      stats: { guilds: state.guilds, gateway: state.gateway },
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