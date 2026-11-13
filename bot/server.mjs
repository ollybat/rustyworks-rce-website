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
import net from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isPublicAddress, rconHostAllowed } from './network-guard.mjs';
import {
  COMMANDS, LOG_TYPES, ROLE_SLOTS, dispatchCommand, optionMap, customId, modalFields, autocompleteChoices,
  setupPanel, rolesModal, linkedRoleModal, logTypeMenu, channelMenu, serverModal, serverPicker,
  testAndSaveServer, kitsPanel, bindModal, bindList, bindRoleMenu, emoteGuide,
  helpHome, helpDetail, setupStatus, cooldownsPanel, serverSnapshot,
  setupState, gatePayload, staffRoleNames, userPanel, linkPanelPayload, linkModal,
  forcelinkPicker, forcelinkModal, adviceOnGamertag, unlinkPicker, unlinkConfirm,
  transferPicker, transferModal, rosterPanel, pendingPanel, channelPickerForPanel,
  kitGivePanel, kitRefreshPanel, kitRefreshModal, kitSpawnPanel, kitSpawnModal,
  kitAddPanel, kitAddModal, giveKit, authSpawnNote,
  refreshCooldowns, permissionNote, wrongGuildNote, pingReply,
} from './commands.mjs';

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
  const loose = Object.keys(envVars).find((k) => /token/i.test(k) && !/SECRET|KEY|PUBLIC|SETTINGS/i.test(k));
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

/* -------------------------------------------------------------- settings ---- */
/* Roles, logging channels, servers and kit settings are kept here and mirrored to the
   website whenever BOT_SETTINGS_TOKEN is set. A save the website refuses is reported to
   whoever asked for it, so nothing quietly pretends to have been stored. */
const settings = {
  staffRoles: {},
  logChannels: {},
  servers: [],
  kits: { binds: [], locked: false, authSpawn: {}, giveCommand: '', listCommand: '', giveCooldownSeconds: 30, installCodes: {}, known: [] },
  installs: {},
  links: [],
  pending: [],
  linkPanel: null,
};
const cooldowns = new Map();
const activeKitGives = new Set();
let settingsTimer = null;
let persistQueue = Promise.resolve();

function settingsToken() { return cleanEnvValue(process.env.BOT_SETTINGS_TOKEN || ''); }

/* Internal bot routes are for the trusted website Worker only. This credential is
   stored in server-side environment variables and never sent to browser code. */
function settingsAuthFailure(req) {
  const expected = settingsToken();
  if (!expected) return { status: 503, body: { ok: false, reason: 'no-settings-token' } };
  const supplied = String(req.headers['x-settings-token'] || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { status: 403, body: { ok: false, reason: 'forbidden' } };
  }
  return null;
}

function requireSettingsAuth(req, res) {
  const failure = settingsAuthFailure(req);
  if (!failure) return false;
  res.writeHead(failure.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(failure.body));
  return true;
}

function panelEmbed(color, title, description) { return { color: color, title: title, description: description }; }
function panelRow(components) { return { type: 1, components: components }; }
function panelButton(id, label, style) { return { type: 2, custom_id: id, label: label, style: style || 2 }; }

async function persistSettingsNow(sections) {
  const token = settingsToken();
  if (!token) return { ok: false, detail: 'BOT_SETTINGS_TOKEN is not set on this service, so the website cannot be written to' };
  const all = {
    staffRoles: settings.staffRoles,
    logChannels: settings.logChannels,
    servers: settings.servers,
    kits: settings.kits,
    links: settings.links,
    pending: settings.pending,
    linkPanel: settings.linkPanel,
  };
  const outgoing = {};
  (Array.isArray(sections) && sections.length ? sections : Object.keys(all)).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(all, key)) outgoing[key] = all[key];
  });
  try {
    const res = await fetch(SITE_URL + '/api/bot/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-settings-token': token },
      body: JSON.stringify(outgoing),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(function () { return {}; });
    if (res.ok && body && body.ok !== false) return { ok: true, detail: '' };
    return { ok: false, detail: 'the website answered ' + res.status + (body && body.reason ? ' (' + body.reason + ')' : '') };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error) };
  }
}

function persistSettings(sections) {
  /* Serialize saves so quick updates cannot arrive out of order. Send only the
     sections that changed so the bot cannot overwrite newer website edits. */
  const run = () => persistSettingsNow(sections);
  const pending = persistQueue.then(run, run);
  persistQueue = pending.then(() => undefined, () => undefined);
  return pending;
}


async function loadSettings() {
  const token = settingsToken();
  if (!token) { log('BOT_SETTINGS_TOKEN is not set, so saved settings cannot be read from the website'); return; }
  try {
    /* full=1 asks for the RCON passwords: only this service talks to RCON, and the website
       hides them from anything running in a browser. */
    const res = await fetch(SITE_URL + '/api/bot/settings?full=1', {
      headers: { 'x-settings-token': token, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { log('settings read answered ' + res.status); return; }
    const body = await res.json();
    if (body && body.staffRoles) settings.staffRoles = body.staffRoles;
    if (body && body.logChannels) settings.logChannels = body.logChannels;
    if (body && Array.isArray(body.servers)) settings.servers = body.servers;
    if (body && body.kits && typeof body.kits === 'object') settings.kits = Object.assign(settings.kits, body.kits);
    if (body && Array.isArray(body.links)) settings.links = body.links;
    if (body && Array.isArray(body.pending)) settings.pending = body.pending;
    if (body && body.linkPanel && typeof body.linkPanel === 'object') settings.linkPanel = body.linkPanel;
    log('loaded ' + Object.keys(settings.staffRoles).length + ' role slot(s), ' + Object.keys(settings.logChannels).length
      + ' log channel(s), ' + settings.servers.length + ' server(s), ' + settings.kits.binds.length + ' bind(s)');
  } catch (error) {
    log('settings read failed:', String((error && error.message) || error));
  }
}

async function saveServer(s) {
  const entry = {
    id: s.id || 'srv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(s.name || 'server').slice(0, 60),
    host: String(s.host || '').trim(),
    port: Number(s.port),
    password: String(s.password || ''),
  };
  const at = settings.servers.findIndex(function (x) { return x.id === entry.id; });
  if (at > -1) settings.servers[at] = entry; else settings.servers.push(entry);
  return persistSettings(['servers']);
}

function installKitCode(raw, text) {
  const key = createHash('sha256').update(String(raw)).digest('hex').slice(0, 20);
  const records = settings.kits.installCodes || (settings.kits.installCodes = {});
  records[key] = { at: new Date().toISOString(), chars: text.length, head: text.slice(0, 400) };
  const keys = Object.keys(records).sort(function (a, b) {
    return String(records[a].at).localeCompare(String(records[b].at));
  });
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(function (k) { delete records[k]; });
  persistSettings(['kits']).catch(function () {});
  return Object.keys(records).length;
}

function setAuthSpawn(group, kit) {
  const name = String(group || '').trim();
  if (!name) return;
  if (kit && String(kit).trim()) settings.kits.authSpawn[name] = String(kit).trim().slice(0, 60);
  else delete settings.kits.authSpawn[name];
  persistSettings(['kits']).catch(function () {});
}

function pruneCooldowns() {
  const now = Date.now();
  cooldowns.forEach(function (expiresAt, key) {
    if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) <= now) cooldowns.delete(key);
  });
}
function cooldownCount() { pruneCooldowns(); return cooldowns.size; }

function cooldownList() {
  pruneCooldowns();
  const rows = [];
  cooldowns.forEach(function (value, key) {
    const parts = String(key).split('\u0000');
    const user = parts[0] || 'unknown';
    const kit = parts.slice(1).join('\u0000') || 'unknown';
    const left = Math.max(0, Math.ceil((Number(value) - Date.now()) / 1000));
    rows.push({ sort: Number(value), text: user + ' -> ' + kit + ' (' + left + 's left)' });
  });
  return rows.sort(function (a, b) { return a.sort - b.sort; }).map(function (row) { return row.text; });
}

function reserveKitGive(gamertag, kit, cooldownSeconds) {
  pruneCooldowns();
  const user = String(gamertag || '').trim().toLowerCase();
  const item = String(kit || '').trim().toLowerCase();
  const key = user + '\u0000' + item;
  const seconds = Math.max(0, Math.min(86400, Math.floor(Number(cooldownSeconds) || 0)));
  const expiresAt = Number(cooldowns.get(key) || 0);
  if (expiresAt > Date.now()) {
    return { ok: false, key: key, remainingSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)), inProgress: false };
  }
  if (activeKitGives.has(key)) return { ok: false, key: key, remainingSeconds: 1, inProgress: true };
  activeKitGives.add(key);
  return { ok: true, key: key, cooldownSeconds: seconds };
}

function finishKitGive(reservation, succeeded) {
  if (!reservation || !reservation.key) return;
  activeKitGives.delete(reservation.key);
  if (succeeded && Number(reservation.cooldownSeconds) > 0) {
    cooldowns.set(reservation.key, Date.now() + Number(reservation.cooldownSeconds) * 1000);
    /* The map is memory-only by design, but still bounded against high-volume staff use. */
    if (cooldowns.size > 5000) {
      const oldest = [...cooldowns.entries()].sort((a, b) => Number(a[1]) - Number(b[1]));
      oldest.slice(0, cooldowns.size - 5000).forEach(function (entry) { cooldowns.delete(entry[0]); });
    }
  }
}

function clearCooldowns(scope, target) {
  const wanted = String(target || '').trim().toLowerCase();
  let cleared = 0;
  cooldowns.forEach(function (value, key) {
    const parts = String(key).split('\u0000');
    const user = parts[0] || '';
    const kit = parts.slice(1).join('\u0000') || '';
    let hit = false;
    if (scope === 'all-users' || scope === 'all-kits') hit = true;
    else if (scope === 'user') hit = !!wanted && user.toLowerCase() === wanted;
    else if (scope === 'kit') hit = !!wanted && kit.toLowerCase() === wanted;
    if (hit) { cooldowns.delete(key); cleared += 1; }
  });
  return cleared;
}

function saveBind(data, keepRole, preserve) {
  const emote = String(data.emote || '').trim().slice(0, 60);
  if (!emote) return null;
  const kits = [data.kit1, data.kit2, data.kit3]
    .map(function (k) { return String(k || '').trim().slice(0, 60); })
    .filter(Boolean).slice(0, 3);
  if (!kits.length) return null;
  const cooldown = Math.max(0, Math.min(86400, Math.round(Number(data.cooldown) || 0)));
  const at = settings.kits.binds.findIndex(function (b) { return b.emote.toLowerCase() === emote.toLowerCase(); });
  const previous = at > -1 ? settings.kits.binds[at] : null;
  let roleId = keepRole || null;
  if (!roleId && preserve && previous) roleId = previous.roleId || null;
  const entry = { emote: emote, kits: kits, cooldown: cooldown, roleId: roleId };
  if (at > -1) settings.kits.binds[at] = entry; else settings.kits.binds.push(entry);
  persistSettings(['kits']).catch(function () {});
  return entry;
}

function removeBind(emote) {
  const wanted = String(emote || '').toLowerCase();
  const before = settings.kits.binds.length;
  settings.kits.binds = settings.kits.binds.filter(function (b) { return b.emote.toLowerCase() !== wanted; });
  persistSettings(['kits']).catch(function () {});
  return before - settings.kits.binds.length;
}

/* ------------------------------------------------------- links and staff ---- */
/* A link is a Discord account with the gamertag it belongs to. Everything player-facing
   hangs off it: kits by role, auth groups, the roster. Storage is honest about limits: an
   unconfirmed request is a request, not proof, and the panels say so. */
function normaliseGamertag(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function findLinkByGamertag(gamertag) {
  const wanted = normaliseGamertag(gamertag).toLowerCase();
  return settings.links.filter(function (l) { return String(l && l.gamertag || '').toLowerCase() === wanted; })[0] || null;
}
function findLinkByUser(userId) {
  return settings.links.filter(function (l) { return l.userId === String(userId); })[0] || null;
}
function addLink(userId, gamertag, by) {
  const tag = normaliseGamertag(gamertag);
  const id = String(userId || '').trim();
  if (!tag || !id) return { ok: false, reason: 'empty' };
  if (!/^[0-9]{15,25}$/.test(id)) return { ok: false, reason: 'bad-user-id', detail: 'That Discord account id does not look valid.' };
  settings.links = settings.links.filter(function (l) {
    return l.gamertag.toLowerCase() !== tag.toLowerCase() && l.userId !== id;
  });
  settings.links.push({ userId: id, gamertag: tag, at: new Date().toISOString(), by: String(by || id) });
  settings.pending = settings.pending.filter(function (p) {
    return p.userId !== id && p.gamertag.toLowerCase() !== tag.toLowerCase();
  });
  persistSettings(['links', 'pending']).catch(function () {});
  return { ok: true, gamertag: tag, userId: id };
}
function removeLink(which) {
  const wanted = normaliseGamertag(which);
  const before = settings.links.length;
  settings.links = settings.links.filter(function (l) {
    return l.gamertag.toLowerCase() !== wanted.toLowerCase() && l.userId !== wanted;
  });
  settings.pending = settings.pending.filter(function (p) { return p.userId !== wanted; });
  persistSettings(['links', 'pending']).catch(function () {});
  return before - settings.links.length;
}
function moveLink(gamertag, newUserId, newGamertag) {
  const current = findLinkByGamertag(gamertag);
  if (!current) return { ok: false, reason: 'missing', detail: 'That link is no longer on record.' };
  const id = String(newUserId || '').trim();
  const tag = normaliseGamertag(newGamertag) || current.gamertag;
  if (!/^[0-9]{15,25}$/.test(id)) {
    return { ok: false, reason: 'bad-user-id', detail: 'A Discord user id is 15 to 25 digits. With Developer Mode on, right-click the account and Copy User ID.' };
  }
  const already = findLinkByUser(id);
  if (already && already.gamertag.toLowerCase() !== current.gamertag.toLowerCase()) {
    return { ok: false, reason: 'user-taken', detail: 'That Discord account is already linked to ' + already.gamertag + '. Unlink it first, then transfer.' };
  }
  const tagOwner = findLinkByGamertag(tag);
  if (tagOwner && tagOwner.gamertag.toLowerCase() !== current.gamertag.toLowerCase()) {
    return { ok: false, reason: 'tag-taken', detail: 'The gamertag ' + tagOwner.gamertag + ' is already linked to <@' + tagOwner.userId + '>.' };
  }
  settings.links = settings.links.filter(function (l) { return l !== current; });
  settings.links.push({ userId: id, gamertag: tag, at: current.at, by: current.by || id, movedAt: new Date().toISOString() });
  persistSettings(['links']).catch(function () {});
  return { ok: true, gamertag: tag, userId: id };
}
function requestLink(userId, gamertag) {
  const tag = normaliseGamertag(gamertag);
  const id = String(userId || '').trim();
  if (!tag) return { ok: false, reason: 'empty' };
  if (!/^[0-9]{15,25}$/.test(id)) return { ok: false, reason: 'bad-user-id', detail: 'Discord did not provide a valid account id.' };
  const taken = findLinkByGamertag(tag);
  if (taken) {
    const mine = taken.userId === String(userId);
    return { ok: false, reason: mine ? 'already-yours' : 'taken', detail: mine
      ? 'That gamertag is already linked to your account.'
      : 'That gamertag is already linked. If it is yours, ask staff to move it with /user transfer.' };
  }
  const otherRequest = settings.pending.filter(function (p) {
    return String(p.userId) !== id && String(p.gamertag || '').toLowerCase() === tag.toLowerCase();
  })[0];
  if (otherRequest) return { ok: false, reason: 'pending-taken', detail: 'That gamertag is already waiting for confirmation from another Discord account.' };
  settings.pending = settings.pending.filter(function (p) { return String(p.userId) !== id; });
  if (settings.pending.length >= 500) return { ok: false, reason: 'queue-full', detail: 'The waiting list is full. Ask staff to clear old requests before trying again.' };
  settings.pending.push({ userId: id, gamertag: tag, at: new Date().toISOString() });
  persistSettings(['links', 'pending']).catch(function () {});
  return { ok: true, gamertag: tag };
}

/* The roles saved in step 1 of setup are the staff roles. Administrator, Manage Server and
   the guild owner always count, so a server can never lock itself out. */
function memberRoleIds(member) {
  if (!member) return [];
  const roles = member.roles;
  if (Array.isArray(roles)) return roles.map(String);
  if (roles && roles.cache && typeof roles.cache.keys === 'function') return Array.from(roles.cache.keys());
  return [];
}
function hasAdminBypass(interaction) {
  const guild = interaction.guild;
  if (guild && guild.ownerId && interaction.user && guild.ownerId === interaction.user.id) return true;
  const perms = interaction.member && interaction.member.permissions;
  try {
    if (perms && typeof perms.has === 'function') {
      return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
    }
    if (typeof perms === 'string') {
      const bits = BigInt(perms);
      if ((bits & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator)) return true;
    }
  } catch (error) { /* a string permission we cannot read falls through to the role check */ }
  return false;
}
function isStaff(interaction) {
  if (hasAdminBypass(interaction)) return true;
  const ids = ROLE_SLOTS.map(function (s) { return (settings.staffRoles || {})[s[0]]; }).filter(Boolean);
  if (!ids.length) return false;
  const held = memberRoleIds(interaction.member);
  return ids.some(function (id) { return held.indexOf(String(id)) > -1; });
}
/* Before any staff role is saved there is nothing to check against, so only the people who
   could finish setup may act. After that, the saved roles decide. */
function permitted(interaction, ctx) {
  const state = setupState(ctx);
  return state.rolesSaved ? isStaff(interaction) : hasAdminBypass(interaction);
}

async function postLinkPanel(channelId) {
  try {
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(function () { return null; });
    if (!channel || typeof channel.send !== 'function') return { ok: false, detail: 'The bot cannot post in that channel.' };
    const message = await channel.send(linkPanelPayload());
    settings.linkPanel = { channelId: channelId, messageId: (message && message.id) || null, at: new Date().toISOString() };
    const wrote = await persistSettings(['linkPanel']);
    return { ok: true, saved: wrote.ok, detail: wrote.detail || '' };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error) };
  }
}

/* When a kit is given by picking a player first, the picked gamertag is remembered here for
   the next screen. Entries expire and the map is bounded so abandoned forms cannot accumulate. */
const pendingGive = new Map();
const PENDING_GIVE_TTL_MS = 10 * 60 * 1000;
function rememberPendingGive(userId, gamertag) {
  const now = Date.now();
  pendingGive.forEach(function (entry, key) {
    if (!entry || entry.expiresAt <= now) pendingGive.delete(key);
  });
  if (pendingGive.size >= 500 && !pendingGive.has(String(userId))) {
    const oldest = pendingGive.keys().next().value;
    if (oldest !== undefined) pendingGive.delete(oldest);
  }
  pendingGive.set(String(userId), { gamertag: String(gamertag || ''), expiresAt: now + PENDING_GIVE_TTL_MS });
}
function takePendingGive(userId) {
  const key = String(userId);
  const entry = pendingGive.get(key);
  pendingGive.delete(key);
  return entry && entry.expiresAt > Date.now() ? entry.gamertag : '';
}

async function writeRconAudit(actorId, options, result) {
  const channelId = String((settings.logChannels || {}).rcon || '');
  if (!channelId) return;
  const command = String((options && options.command) || 'serverinfo').replace(/[\r\n]+/g, ' ').slice(0, 120);
  const host = String((options && options.host) || 'unknown').slice(0, 100);
  const port = Number(options && options.port);
  const destination = host + (Number.isInteger(port) ? ':' + port : '');
  const ok = !!(result && result.ok);
  const embed = panelEmbed(ok ? 0x3ba55d : 0xdc4c4c, ok ? 'RCON command completed' : 'RCON command failed',
    'Requested by: ' + (actorId ? '<@' + actorId + '>' : 'unknown') +
    '\nDestination: ' + destination +
    '\nCommand: ' + command +
    '\nResult: ' + (ok ? 'success' : String((result && result.reason) || 'no answer')) +
    (Number.isFinite(Number(result && result.ms)) ? '\nTime: ' + Math.round(Number(result.ms)) + ' ms' : ''));
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && typeof channel.send === 'function') await channel.send({ embeds: [embed] });
  } catch (error) {
    log('RCON audit log could not be posted:', String((error && error.message) || error).slice(0, 200));
  }
}

function botCtx() {
  return {
    siteUrl: SITE_URL,
    settings: settings,
    guildInfo: state.guildInfo || null,
    gateway: state.gateway,
    ping: function () { return client.ws.ping; },
    uptime: function () { return (Date.now() - state.since) / 1000; },
    commandCount: function () { return state.commandNames ? state.commandNames.length : 0; },
    storeTokenSet: function () { return !!settingsToken(); },
    servers: function () { return settings.servers; },
    kits: function () { return settings.kits; },
    links: function () { return settings.links; },
    pendingLinks: function () { return settings.pending; },
    linkPanel: function () { return settings.linkPanel; },
    saveServer: saveServer,
    installKit: installKitCode,
    setKnownKits: function (names) {
      const seen = new Set();
      settings.kits.known = (Array.isArray(names) ? names : [])
        .map((name) => String(name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60))
        .filter((name) => {
          const key = name.toLowerCase();
          if (!name || seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 100);
      persistSettings(['kits']).catch(function () {});
      return settings.kits.known.length;
    },
    addLink: addLink,
    removeLink: removeLink,
    moveLink: moveLink,
    requestLink: requestLink,
    setAuthSpawn: setAuthSpawn,
    clearCooldowns: clearCooldowns,
    cooldownCount: cooldownCount,
    cooldownList: cooldownList,
    reserveKitGive: reserveKitGive,
    finishKitGive: finishKitGive,
    setDelivery: function (delivery) {
      settings.kits.listCommand = String(delivery.listCommand || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
      settings.kits.giveCommand = String(delivery.giveCommand || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
      settings.kits.giveCooldownSeconds = Math.max(0, Math.min(86400, Math.floor(Number(delivery.giveCooldownSeconds) || 0)));
      return persistSettings(['kits']);
    },
    setKnownKits: function (names) {
      const seen = new Set();
      settings.kits.known = (Array.isArray(names) ? names : [])
        .map((name) => String(name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60))
        .filter((name) => {
          const key = name.toLowerCase();
          if (!name || seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 100);
      persistSettings(['kits']).catch(function () {});
      return settings.kits.known.length;
    },
    rconTest: async function (o) {
      const result = await rconRun(Object.assign({}, o, { allowAny: false }));
      await writeRconAudit(this.actorId, o, result);
      return result;
    },
    rconRun: async function (o) {
      const result = await rconRun(Object.assign({}, o, { allowAny: true }));
      await writeRconAudit(this.actorId, o, result);
      return result;
    },
  };
}

/* ----------------------------------------------------------- interactions ---- */
/* /ping, /setup and /kits, and their buttons, menus and modals. Everything answers only
   inside the one guild this bot is configured for, and the configuration commands need
   Administrator or Manage Server. Their panels are ephemeral, so a role list or a channel
   choice is never posted into the channel. */

function mayConfigure(interaction) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  try {
    return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
  } catch (error) { return false; }
}

async function answerModal(interaction, payload) {
  const body = Object.assign({}, payload);
  if (body.flags === undefined) body.flags = 64;
  try { await interaction.reply(body); } catch (error) { log('modal reply failed:', String((error && error.message) || error)); }
}

async function answerPanel(interaction, payload) {
  const body = Object.assign({}, payload);
  delete body.flags;
  if (body.components === undefined) body.components = [];
  try { await interaction.update(body); } catch (error) { log('panel update failed:', String((error && error.message) || error)); }
}

function autocompleteChoicesFor(interaction, ctx) {
  const focused = interaction.options && typeof interaction.options.getFocused === 'function'
    ? interaction.options.getFocused(true)
    : null;
  const opts = optionMap(interaction);
  return autocompleteChoices(ctx, interaction.commandName, opts.__sub, focused);
}

async function runAutocomplete(interaction) {
  const ctx = botCtx();
  if (!permitted(interaction, ctx)) return await interaction.respond([]);
  const choices = autocompleteChoicesFor(interaction, ctx);
  return await interaction.respond(choices);
}

async function routeInteraction(interaction) {
  try {
    const rightGuild = !!GUILD_ID && interaction.guildId === GUILD_ID;
    if (!rightGuild) {
      if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
        await interaction.respond([]).catch(function () {});
      } else if (typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
        await interaction.reply({ embeds: [wrongGuildNote()], flags: 64 }).catch(function () {});
      }
      return;
    }
    if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) return await runAutocomplete(interaction);
    if (interaction.isChatInputCommand()) return await runCommand(interaction);
    if (interaction.isModalSubmit()) return await runModal(interaction);
    if (interaction.isButton()) return await runButton(interaction);
    if (interaction.isStringSelectMenu()) return await runSelect(interaction);
    if (typeof interaction.isChannelSelectMenu === 'function' && interaction.isChannelSelectMenu()) return await runSelect(interaction);
    if (typeof interaction.isRoleSelectMenu === 'function' && interaction.isRoleSelectMenu()) return await runSelect(interaction);
    return;
  } catch (error) {
    const reference = Date.now().toString(36);
    const message = String((error && (error.stack || error.message)) || error);
    log('interaction failed [' + reference + ']:', message.slice(0, 1200));
    if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
      try { await interaction.respond([]); } catch (e) { /* expired autocomplete */ }
      return;
    }
    const body = { embeds: [panelEmbed(0xdc4c4c, 'That failed', 'The bot could not complete this action. Please try again. Reference: ' + reference)], flags: 64 };
    try {
      if (interaction.deferred || interaction.replied) {
        delete body.flags;
        await interaction.editReply(body);
      } else await interaction.reply(body);
    } catch (e) { /* already answered or expired */ }
  }
}

async function runCommand(interaction) {
  const name = interaction.commandName;
  if (name !== 'ping' && name !== 'help' && name !== 'setup' && name !== 'kits' && name !== 'user' && name !== 'server') return;
  const ctx = botCtx();
  ctx.actorId = String((interaction.user && interaction.user.id) || '');
  if (name !== 'ping' && name !== 'help' && !permitted(interaction, ctx)) {
    await interaction.reply({ embeds: [permissionNote(ctx)], flags: 64 }).catch(function () {});
    return;
  }
  const opts = optionMap(interaction);
  /* Everything that changes something carries a panel, so the first reply is deferred while
     a panel is assembled or a server is asked a question. */
  const slow = name !== 'ping' && name !== 'help';
  if (slow) await interaction.deferReply({ flags: 64 }).catch(function () {});
  const payload = await Promise.resolve(dispatchCommand(ctx, name, opts.__sub, opts)).catch(function (error) {
    const reference = Date.now().toString(36);
    log('command failed [' + reference + ']:', String((error && (error.stack || error.message)) || error).slice(0, 1200));
    return { embeds: [panelEmbed(0xdc4c4c, 'That did not work',
      'The bot could not complete this action. Please try again. Reference: ' + reference)] };
  });
  if (payload && payload.postPanelTo) {
    const posted = await postLinkPanel(payload.postPanelTo);
    const body = posted.ok
      ? { embeds: [panelEmbed(0x3ba55d, 'Link panel posted', 'It is in <#' + payload.postPanelTo + '> now. Members press **Link account** there; staff can always confirm one by hand with /user forcelink.'
        + (posted.saved ? '' : ' Note: the website could not be told, so the panel id lives in this bot memory only.'))] }
      : { embeds: [panelEmbed(0xdc4c4c, 'Could not post it there', String(posted.detail || '').slice(0, 300))] };
    if (slow) { await interaction.editReply(body).catch(function () {}); return; }
    await interaction.reply(body).catch(function () {});
    return;
  }
  if (slow) {
    const body = Object.assign({}, payload);
    /* flags belong on the first reply only; the deferral already made it ephemeral. */
    delete body.flags;
    await interaction.editReply(body).catch(function (e) { log('editReply failed:', String((e && e.message) || e)); });
    return;
  }
  await interaction.reply(payload).catch(function (e) { log('reply failed:', String((e && e.message) || e)); });
}

async function runButton(interaction) {
  const id = customId(interaction);
  const ctx = botCtx();
  ctx.actorId = String((interaction.user && interaction.user.id) || '');
  if (id === 'ping:again') return await answerPanel(interaction, await pingReply(ctx));
  /* /server buttons re-ask the same read-only question, so they are one line. */
  if (id.indexOf('server:') === 0) return await answerPanel(interaction, await serverSnapshot(ctx, id.slice('server:'.length)));
  /* The link panel is a member action, so its buttons work for everyone in the server and
     are handled before the staff check. */
  if (id === 'link:start') return await interaction.showModal(linkModal());
  if (id === 'link:cancel') return await answerModal(interaction, { embeds: [panelEmbed(0x3ba55d, 'Left alone', 'Your link is unchanged.')] });
  if (id === 'link:unlink') {
    const mine = findLinkByUser(interaction.user.id);
    return await answerModal(interaction, mine
      ? { embeds: [panelEmbed(0xfaa81a, 'Unlink your account?', 'On record: ' + mine.gamertag + '. Anything set up against this link stops matching once it is removed.')],
        components: [panelRow([panelButton('link:unlink:go', 'Yes, unlink me', 4), panelButton('link:cancel', 'Keep it', 2)])] }
      : { embeds: [panelEmbed(0xfaa81a, 'Nothing to unlink', 'No link is on record for your account.')],
        components: [panelRow([panelButton('link:start', 'Link account', 1)])] });
  }
  if (id === 'link:unlink:go') {
    const gone = removeLink(interaction.user.id);
    return await answerModal(interaction, { embeds: [panelEmbed(gone ? 0x3ba55d : 0xfaa81a, gone ? 'Unlinked' : 'Nothing to unlink',
      gone ? 'Your link is removed. Press Link account on the panel whenever you want it back.' : 'No link was on record for your account.')],
      components: [panelRow([panelButton('link:start', 'Link account', 1)])] });
  }
  const publicHelp = id === 'help:home' || id.indexOf('help:cmd:') === 0;
  if (!publicHelp && !permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  if (id === 'user:config') return await answerPanel(interaction, userPanel(ctx));
  if (id === 'user:forcelink') return await answerPanel(interaction, forcelinkPicker());
  if (id === 'user:unlink') return await answerPanel(interaction, unlinkPicker(ctx));
  if (id === 'user:transfer') return await answerPanel(interaction, transferPicker(ctx));
  if (id === 'user:roster') return await answerPanel(interaction, rosterPanel(ctx));
  if (id === 'user:pending') return await answerPanel(interaction, pendingPanel(ctx));
  if (id === 'user:panel') return await answerPanel(interaction, channelPickerForPanel());
  if (id.indexOf('user:unlink:go:') === 0) {
    const tag = id.slice('user:unlink:go:'.length);
    const gone = removeLink(tag);
    return await answerPanel(interaction, { embeds: [panelEmbed(gone ? 0x3ba55d : 0xfaa81a, gone ? 'Link removed' : 'Nothing removed',
      gone ? 'The link for ' + tag + ' is gone.' : 'No link for ' + tag + ' was found.')],
      components: [panelRow([panelButton('user:config', 'Back to links', 2)])] });
  }
  if (id === 'kits:give') return await interaction.showModal(kitGiveModal());
  if (id === 'kits:add:code') return await interaction.showModal(kitAddModal());
  if (id.indexOf('kits:refresh:') === 0) {
    const scope = id.slice('kits:refresh:'.length);
    if (scope === 'all-users' || scope === 'all-kits') return await answerPanel(interaction, refreshCooldowns(ctx, scope, ''));
    return await interaction.showModal(kitRefreshModal(scope));
  }
  if (id.indexOf('kits:spawn:') === 0) {
    const group = id.slice('kits:spawn:'.length);
    return await interaction.showModal(kitSpawnModal(group, (settings.kits.authSpawn || {})[group] || ''));
  }
  if (id === 'setup:roles') return await interaction.showModal(rolesModal());
  if (id === 'setup:linked') return await interaction.showModal(linkedRoleModal());
  if (id === 'setup:channels') return await answerPanel(interaction, logTypeMenu());
  if (id === 'setup:server') return await interaction.showModal(serverModal(null));
  if (id === 'setup:test') return await answerPanel(interaction, serverPicker(ctx));
  if (id === 'kits:add') return await interaction.showModal(bindModal(null));
  if (id === 'kits:edit') return await answerPanel(interaction, bindList(ctx, 'edit'));
  if (id === 'kits:remove') return await answerPanel(interaction, bindList(ctx, 'remove'));
  if (id === 'kits:config') return await answerPanel(interaction, kitsPanel(ctx));
  if (id === 'kits:guide') return await answerPanel(interaction, emoteGuide(ctx));
  /* The Cooldowns button shows the records; clearing is its own button inside. */
  if (id === 'kits:refresh') return await answerPanel(interaction, cooldownsPanel(ctx, cooldownList()));
  if (id === 'kits:clear') return await answerPanel(interaction, refreshCooldowns(ctx, 'all-kits', ''));
  if (id.indexOf('help:cmd:') === 0) return await answerPanel(interaction, helpDetail(id.slice('help:cmd:'.length)));
  if (id === 'help:home') return await answerPanel(interaction, helpHome());
  if (id === 'kits:lock') {
    settings.kits.locked = !settings.kits.locked;
    persistSettings(['kits']).catch(function () {});
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  if (id.indexOf('kits:role:skip:') === 0) {
    saveBind({ emote: id.slice('kits:role:skip:'.length) }, null, false);
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  log('unhandled button:', id);
}

async function runSelect(interaction) {
  const id = customId(interaction);
  const ctx = botCtx();
  ctx.actorId = String((interaction.user && interaction.user.id) || '');
  if (!permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  const first = String((interaction.values || [])[0] || '');
  if (id === 'setup:logtype') return await answerPanel(interaction, channelMenu(first));
  if (id.indexOf('setup:channel:') === 0) {
    const typeKey = id.slice('setup:channel:'.length);
    const found = LOG_TYPES.filter(function (p) { return p[0] === typeKey; })[0];
    settings.logChannels[typeKey] = first;
    const wrote = await persistSettings(['logChannels']);
    return await answerPanel(interaction, {
      embeds: [panelEmbed(wrote.ok ? 0x3ba55d : 0xfaa81a, 'Log channel set',
        (found ? found[1] : typeKey) + ' goes to <#' + first + '>.' + (wrote.ok ? '' : ' Kept in this bot memory only: ' + wrote.detail))],
      components: [panelRow([panelButton('setup:channels', 'Back to log types', 2), panelButton('setup:test', 'Test a connection', 2)])],
    });
  }
  if (id === 'setup:pick') {
    const server = settings.servers.filter(function (s) { return s.id === first; })[0];
    if (!server) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That server is gone', 'Save it again from the setup panel.')] });
    return await interaction.showModal(serverModal(server));
  }
  if (id === 'kits:pickbind:edit') {
    const bind = settings.kits.binds.filter(function (b) { return b.emote === first; })[0];
    if (!bind) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That bind is gone', 'Open the panel again.')] });
    return await interaction.showModal(bindModal(bind));
  }
  if (id === 'kits:pickbind:remove') {
    const gone = removeBind(first);
    return await answerPanel(interaction, {
      embeds: [panelEmbed(gone ? 0x3ba55d : 0xfaa81a, gone ? 'Bind removed' : 'Nothing removed', gone ? 'The ' + first + ' bind is gone.' : 'No bind named ' + first + ' was found.')],
      components: [panelRow([panelButton('kits:config', 'Back to the panel', 2)])],
    });
  }
  if (id.indexOf('kits:role:') === 0) {
    saveBind({ emote: id.slice('kits:role:'.length) }, first, true);
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  if (id === 'user:forcelink:user') return await interaction.showModal(forcelinkModal(first));
  if (id === 'user:unlink:pick') {
    const found = findLinkByGamertag(first);
    if (!found) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That link is gone', 'Open the list again.')] });
    return await answerPanel(interaction, unlinkConfirm(found.gamertag, found.userId));
  }
  if (id === 'user:transfer:pick') return await interaction.showModal(transferModal(first));
  if (id === 'user:panel:channel') {
    const posted = await postLinkPanel(first);
    return await answerPanel(interaction, posted.ok
      ? { embeds: [panelEmbed(0x3ba55d, 'Link panel posted', 'It is in <#' + first + '> now. Members press **Link account** there.'
        + (posted.saved ? '' : ' The website could not be told, so the panel id is in this bot memory only.'))],
        components: [panelRow([panelButton('user:config', 'Back to links', 2)])] }
      : { embeds: [panelEmbed(0xdc4c4c, 'Could not post it there', String(posted.detail || '').slice(0, 300))] });
  }
  if (id === 'kits:give:pick') {
    rememberPendingGive(interaction.user.id, first);
    return await interaction.showModal(kitGiveModal());
  }
  log('unhandled select:', id);
}

async function runModal(interaction) {
  const id = customId(interaction);
  const fields = modalFields(interaction);
  const ctx = botCtx();
  ctx.actorId = String((interaction.user && interaction.user.id) || '');
  /* A member linking themselves is not a staff action. */
  if (id === 'modal:link:self') {
    const answer = requestLink(interaction.user.id, fields.link_gamertag);
    return await answerModal(interaction, answer.ok
      ? { embeds: [panelEmbed(0x3ba55d, 'Request recorded', 'You asked to link ' + answer.gamertag + '. It is waiting for confirmation:\n\n'
          + '- staff confirm it with /user forcelink, or\n- your server own in-game verification command does it automatically.\n\nThe bot will not treat an unconfirmed request as proof, so nothing player-facing uses it yet.')],
        components: [panelRow([panelButton('link:unlink', 'Unlink instead', 2)])] }
      : { embeds: [panelEmbed(0xfaa81a, 'Not linked', String(answer.detail || '').slice(0, 400))],
        components: [panelRow([panelButton('link:start', 'Try another gamertag', 1)])] });
  }
  if (!permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  if (id === 'modal:roles' || id === 'modal:linked') {
    let saved = 0;
    let skipped = 0;
    ROLE_SLOTS.forEach(function (slot) {
      const key = 'role_' + slot[0];
      if (!(key in fields)) return;
      const value = String(fields[key] || '').trim();
      if (!value) { delete settings.staffRoles[slot[0]]; return; }
      if (/^[0-9]{5,25}$/.test(value)) { settings.staffRoles[slot[0]] = value; saved += 1; }
      else skipped += 1;
    });
    const wrote = await persistSettings(['staffRoles']);
    return await answerModal(interaction, {
      embeds: [panelEmbed(wrote.ok ? 0x3ba55d : 0xfaa81a, 'Roles saved',
        saved + ' role id(s) stored' + (skipped ? ', ' + skipped + ' value(s) skipped because they were not role ids' : '') + '.' +
        (wrote.ok ? '' : ' Kept in this bot memory only: ' + wrote.detail))],
      components: [panelRow([panelButton('setup:roles', 'Change them again', 2), panelButton('setup:channels', 'Next: logging channels', 1)])],
    });
  }
  if (id === 'modal:server' || id.indexOf('modal:server:') === 0) {
    const existingId = id.indexOf('modal:server:') === 0 ? id.slice('modal:server:'.length) : null;
    return await answerModal(interaction, await testAndSaveServer(ctx, fields, existingId));
  }
  if (id === 'modal:bind' || id.indexOf('modal:bind:') === 0) {
    const entry = saveBind({
      emote: fields.bind_emote,
      kit1: fields.bind_kit1,
      kit2: fields.bind_kit2,
      kit3: fields.bind_kit3,
      cooldown: fields.bind_cooldown,
    }, null, true);
    if (!entry) {
      return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'Nothing saved', 'A bind needs an emote name and at least one kit.')] });
    }
    return await answerModal(interaction, bindRoleMenu(entry.emote));
  }
  if (id.indexOf('modal:forcelink:') === 0) {
    const userId = id.slice('modal:forcelink:'.length);
    const gamertag = normaliseGamertag(fields.link_gamertag);
    const advice = adviceOnGamertag(ctx, gamertag, userId);
    if (!advice.free && advice.reason === 'already-this-user') {
      return await answerModal(interaction, { embeds: [panelEmbed(0xfaa81a, 'Already linked', 'That gamertag is already linked to that same Discord account. Nothing changed.')],
        components: [panelRow([panelButton('user:config', 'Back to links', 2)])] });
    }
    if (!advice.free) {
      return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That gamertag is taken', String(advice.detail || '').slice(0, 400))],
        components: [panelRow([panelButton('user:transfer', 'Transfer it instead', 1), panelButton('user:config', 'Cancel', 2)])] });
    }
    const done = addLink(userId, gamertag, interaction.user.id);
    return await answerModal(interaction, { embeds: [panelEmbed(0x3ba55d, 'Linked', '<@' + userId + '> is now linked to ' + done.gamertag + '.')],
      components: [panelRow([panelButton('user:config', 'Back to links', 2), panelButton('user:panel', 'Post the link panel', 1)])] });
  }
  if (id.indexOf('modal:transfer:') === 0) {
    const gamertag = id.slice('modal:transfer:'.length);
    const moved = moveLink(gamertag, fields.move_user, fields.move_gamertag);
    return await answerModal(interaction, moved.ok
      ? { embeds: [panelEmbed(0x3ba55d, 'Link moved', gamertag + ' now belongs to <@' + moved.userId + '>'
          + (moved.gamertag.toLowerCase() !== gamertag.toLowerCase() ? ', under the gamertag ' + moved.gamertag : '') + '.')],
        components: [panelRow([panelButton('user:config', 'Back to links', 2)])] }
      : { embeds: [panelEmbed(0xdc4c4c, 'Not moved', String(moved.detail || '').slice(0, 400))],
        components: [panelRow([panelButton('user:transfer', 'Try again', 1), panelButton('user:config', 'Cancel', 2)])] });
  }
  if (id === 'modal:kitgive') {
    const remembered = takePendingGive(interaction.user.id);
    return await answerModal(interaction, await giveKit(ctx, { kit: fields.give_kit, gamertag: fields.give_target || remembered, user: fields.give_user || null }));
  }
  if (id.indexOf('modal:refresh:') === 0) {
    return await answerModal(interaction, refreshCooldowns(ctx, id.slice('modal:refresh:'.length), fields.refresh_target));
  }
  if (id.indexOf('modal:spawn:') === 0) {
    return await answerModal(interaction, authSpawnNote(ctx, id.slice('modal:spawn:'.length), fields.spawn_kit));
  }
  if (id === 'modal:kitcode') return await answerModal(interaction, installKit(ctx, fields.install_code));
  log('unhandled modal:', id);
}

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
    await loadSettings();
    /* set() replaces the whole list, so a command removed from the module really does
       disappear from the picker instead of lingering forever. */
    /* Deliberately no default_member_permissions here. The roles saved in step 1 are the
       staff roles, so hiding the staff commands from members would hide them from exactly the
       people this server appointed. The bot checks roles (plus Administrator and the owner)
       on every use, and staff who want the commands invisible to members can say so per role
       in Discord's own Integrations screen, which does not change what the bot enforces. */
    const applied = await guild.commands.set(COMMANDS.map((cmd) => Object.assign({}, cmd, { dm_permission: false })));
    state.commandNames = applied.map((cmd) => cmd.name);
    const setupCmd = applied.get('setup');
    state.command = (setupCmd && setupCmd.id) || (applied.first() && applied.first().id) || null;
    log(applied.size + ' command(s) registered in ' + guild.name + ': ' + state.commandNames.join(', '));
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
      /* Channels as well as roles, so the website can offer a list to click instead of a
         box demanding an id. canSend is the bot's own permission in that channel: a log
         target it cannot post in is worse than no log target, and the page says so. */
      channels: guild.channels.cache
        .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
        .map((c) => {
          let canSend = null;
          try {
            const allowed = c.permissionsFor(client.user);
            canSend = allowed ? Boolean(allowed.has('SendMessages')) : null;
          } catch (error) { canSend = null; }
          return {
            id: c.id,
            name: c.name,
            kind: channelKind(c),
            category: (c.parent && c.parent.name) || null,
            position: c.rawPosition || 0,
            canSend: canSend,
          };
        }),
    };
    log('exposed ' + state.guildInfo.roles.length + ' role(s) and ' + state.guildInfo.channels.length + ' channel(s) for the website');
  } catch (e) {
    state.error = String((e && e.message) || e);
    log('command registration failed:', state.error);
  }
});

client.on(Events.InteractionCreate, (interaction) => routeInteraction(interaction));

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
    if (size < 10 || size > 8192) return { packets: packets, rest: rest, error: 'invalid-packet-size' };
    if (rest.length < size + 4) break;
    packets.push({
      id: rest.readInt32LE(4),
      type: rest.readInt32LE(8),
      body: rest.slice(12, size + 2).toString('utf8'),
    });
    rest = rest.slice(size + 4);
  }
  return { packets: packets, rest: rest, error: null };
}

const RCON_DNS_TIMEOUT_MS = 3500;
const RCON_MAX_ACTIVE = 3;
const RCON_MAX_QUEUED = 20;
const RCON_QUEUE_WAIT_MS = 12000;
const RCON_MAX_BUFFER_BYTES = 64 * 1024;
let rconActive = 0;
const rconWaiting = [];

function acquireRconSlot() {
  return new Promise(function (resolve, reject) {
    function grant() {
      rconActive += 1;
      let released = false;
      resolve(function release() {
        if (released) return;
        released = true;
        rconActive = Math.max(0, rconActive - 1);
        const next = rconWaiting.shift();
        if (next) {
          clearTimeout(next.timer);
          next.grant();
        }
      });
    }
    if (rconActive < RCON_MAX_ACTIVE) return grant();
    if (rconWaiting.length >= RCON_MAX_QUEUED) {
      return reject(new Error('The RCON queue is full. Try again in a few seconds.'));
    }
    const entry = {
      grant: grant,
      timer: setTimeout(function () {
        const index = rconWaiting.indexOf(entry);
        if (index !== -1) rconWaiting.splice(index, 1);
        reject(new Error('The RCON queue is busy. Try again shortly.'));
      }, RCON_QUEUE_WAIT_MS),
    };
    rconWaiting.push(entry);
  });
}

/* Resolve every DNS answer with a deadline, reject mixed public/private answers,
   and connect to the exact vetted IP to avoid DNS rebinding. */
async function rconResolve(host) {
  const value = String(host || '').trim().toLowerCase();
  if (net.isIP(value)) return isPublicAddress(value) ? value : null;
  const records = await new Promise(function (resolve) {
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve(null);
    }, RCON_DNS_TIMEOUT_MS);
    lookup(value, { all: true }).then(function (all) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(all);
    }, function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
  if (!Array.isArray(records) || !records.length || records.some((record) => !isPublicAddress(record.address))) return null;
  return records[0].address;
}

/* Discord has moved channel types from numbers to strings over the years and this bot
   refuses to guess from a name, so both spellings are read and anything else is 'other'. */
function channelKind(channel) {
  const t = channel && channel.type;
  if (t === 0 || t === 'GuildText' || t === 'GUILD_TEXT') return 'text';
  if (t === 5 || t === 'GuildAnnouncement' || t === 'GUILD_ANNOUNCEMENT') return 'announcement';
  if (t === 15 || t === 'GuildForum' || t === 'GUILD_FORUM') return 'forum';
  if (t === 2 || t === 'GuildVoice' || t === 'GUILD_VOICE') return 'voice';
  if (t === 13 || t === 'GuildStageVoice' || t === 'GUILD_STAGE_VOICE') return 'voice';
  if (t === 4 || t === 'GuildCategory' || t === 'GUILD_CATEGORY') return 'category';
  return 'other';
}

async function rconRun(options) {
  let release;
  try {
    release = await acquireRconSlot();
  } catch (error) {
    return { ok: false, reason: 'busy', detail: String((error && error.message) || error) };
  }
  try {
    const host = options && options.host;
    const target = rconHostAllowed(host) ? await rconResolve(host) : null;
    if (!target) {
      return { ok: false, reason: 'refused-host', detail: 'That address is not a public internet host (or did not resolve safely), so the bot will not connect to it.' };
    }
    return await rconConnect(Object.assign({}, options, { address: target }));
  } finally {
    release();
  }
}

function rconConnect(options) {
  return new Promise(function (resolve) {
    const started = Date.now();
    const host = String(options.address || options.host || '').trim();
    const port = Number(options.port);
    const password = String(options.password || '');
    const asked = String(options.command || 'serverinfo').toLowerCase();
    /* The fixed list is what the automatic health check may ask for. When an administrator
       asks for a command they configured themselves - a kit plugin command, for instance -
       it is passed through as a single line with a hard length cap. */
    const requested = String(options.command || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    const command = options.allowAny && requested ? requested : (RCON_ALLOWED.indexOf(asked) > -1 ? asked : 'serverinfo');

    if (!rconHostAllowed(host)) {
      return resolve({ ok: false, reason: 'refused-host', detail: 'That address is not on the public internet, so the bot will not connect to it.' });
    }
    if (!(port >= 1 && port <= 65535)) return resolve({ ok: false, reason: 'refused-port', detail: 'That port number cannot exist.' });
    if (!password) return resolve({ ok: false, reason: 'no-password', detail: 'No RCON password was given for that server.' });
    if (password.length > 256) return resolve({ ok: false, reason: 'bad-password-length', detail: 'The saved RCON password is unexpectedly long; check the server settings.' });

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
      socket = net.connect({ host: host, port: port });
    } catch (error) {
      return finish({ ok: false, reason: 'connect-failed', detail: String(error.message || error) });
    }

    socket.on('error', function (error) {
      finish({ ok: false, reason: 'connect-failed', detail: String((error && (error.code || error.message)) || error) });
    });

    socket.on('connect', function () {
      socket.setNoDelay(true);
      socket.write(rconPacket(1, 3, password));
    });

    socket.on('close', function () {
      if (!settled) finish({ ok: authed, authenticated: authed, command: command, answer: answer.trim().slice(0, 1200), reason: authed ? 'closed' : 'closed-before-auth' });
    });

    socket.on('data', function (chunk) {
      if (settled) return;
      if (buffer.length + chunk.length > RCON_MAX_BUFFER_BYTES) {
        return finish({ ok: false, reason: 'response-too-large', detail: 'The server response exceeded the bot safety limit.' });
      }
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = rconParse(buffer);
      if (parsed.error) return finish({ ok: false, reason: 'invalid-response', detail: 'The server sent a malformed RCON packet.' });
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
          answer = (answer + packet.body).slice(0, 1200);
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
  const statusPaths = ['/', '/status', '/api/status'];
  const healthPaths = new Set(['/health', '/healthz', '/api/health']);
  /* Every server the bot is in right now. The website asks this before it will set anything
     up: a server Spinback is not in cannot be configured, so the page says so plainly and
     offers the invite instead of pretending otherwise. */
  if (req.method === 'GET' && url === '/api/guilds') {
    if (requireSettingsAuth(req, res)) return;
    const cors = { 'content-type': 'application/json', 'cache-control': 'no-store' };
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
    if (requireSettingsAuth(req, res)) return;
    const cors = { 'content-type': 'application/json', 'cache-control': 'no-store' };
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
    if (requireSettingsAuth(req, res)) return;
    const cors = { 'content-type': 'application/json', 'cache-control': 'no-store' };
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
      /* A saved server is tested by its id, so its password never has to leave this service
         and never reaches a browser. A brand new server can still be tried with the password
         typed on the page: it is used for this one check and stored nowhere. */
      let target = { host: body.host, port: body.port, password: body.password, command: body.command };
      if (!String(body.password || '') && body.id) {
        const saved = (settings.servers || []).find(function (s) { return String(s.id) === String(body.id); });
        if (!saved) {
          answer = {
            ok: false,
            reason: 'unknown-server',
            detail: (settings.servers || []).length
              ? 'No saved server has that id. Save it first, then test it.'
              : 'This service has not read the saved settings yet, so it cannot look a stored server up. Set BOT_SETTINGS_TOKEN here and on the website.',
          };
        } else {
          target = { host: saved.host, port: saved.port, password: saved.password, command: body.command };
        }
      }
      try {
        if (!answer) answer = await rconRun(target);
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
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', 'cache-control': 'no-store', allow: 'POST' });
      res.end(JSON.stringify({ ok: false, reason: 'method-not-allowed' }));
      return;
    }
    if (requireSettingsAuth(req, res)) return;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    if (!TOKEN) { res.end(JSON.stringify({ ok: false, reason: 'no-token' })); return; }
    if (state.gateway === 'online') { res.end(JSON.stringify({ ok: true, already: 'online', gateway: state.gateway })); return; }
    await relogin('asked by an authenticated request');
    res.end(JSON.stringify({ ok: true, gateway: state.gateway }));
    return;
  }
  if (req.method === 'POST' && url === '/api/oauth/exchange') {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      body += chunk;
      if (body.length > 16384) {
        tooBig = true;
        res.writeHead(413, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'payload_too_large' }));
        req.destroy();
      }
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
  if (req.method === 'GET' && healthPaths.has(url)) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'spinback-rce-bot' }));
    return;
  }
  if (req.method === 'GET' && statusPaths.indexOf(url) !== -1) {
    res.writeHead(200, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS));
    res.end(JSON.stringify({
      service: 'spinback-rce-bot',
      online: state.gateway === 'online',
      ok: state.gateway === 'online',
      gateway: state.gateway,
      tag: state.tag,
      guilds: state.guilds,
      command: state.command,
      uptimeSeconds: Math.round((Date.now() - state.since) / 1000),
      guildConfigured: !!GUILD_ID,
      /* Public status data only; token metadata, owner ids, deployment details and
         internal errors are deliberately not returned to anonymous visitors. */
      stats: { guilds: state.guilds, gateway: state.gateway },
    }));
    return;
  }
  let raw = '';
  let interactionTooLarge = false;
  req.on('data', (chunk) => {
    if (interactionTooLarge) return;
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      interactionTooLarge = true;
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload_too_large' }));
      req.destroy();
    }
  });
  req.on('end', async () => {
    if (interactionTooLarge) return;
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
