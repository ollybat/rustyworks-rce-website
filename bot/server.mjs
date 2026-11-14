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
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, ChannelType, Events } from 'discord.js';
import handler from './interactions-worker.js';
import net from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isPublicAddress, rconHostAllowed as hostAllowedByGuard } from './network-guard.mjs';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  COMMANDS, LOG_TYPES, ROLE_SLOTS, dispatchCommand, optionMap, customId, modalFields,
  setupPanel, rolesModal, linkedRoleModal, logTypeMenu, channelMenu, serverModal, serverPicker,
  testAndSaveServer, kitsPanel, bindModal, bindList, bindRoleMenu, emoteGuide,
  helpHome, helpDetail, setupStatus, cooldownsPanel,
  setupState, gatePayload, staffRoleNames, userPanel, linkPanelPayload, linkModal,
  forcelinkPicker, forcelinkModal, adviceOnGamertag, unlinkPicker, unlinkConfirm,
  transferPicker, transferModal, rosterPanel, pendingPanel, channelPickerForPanel,
  kitGivePanel, kitGiveModal, kitRefreshPanel, kitRefreshModal, kitSpawnPanel, kitSpawnModal,
  kitAddPanel, kitAddModal, giveKit, authSpawnNote,
  refreshCooldowns, permissionNote, wrongGuildNote, pingReply,
  STAFF_SLOTS, STAFF_ROLE_RECIPES, runSetupPanel, roleBuildPanel, roleBuildResult, rolesPanel, testServers, autocompleteChoices, forceLinkNow,
  deliveryModal, saveDelivery, grabKits, grabKitsRun, installKit, dress, BRAND, PANEL_FOOTER, rconRequiredPanel, serverSnapshot,
  channelSetupPanel, logChannelBuilder, logChannelPlan, logChannelBuilt, serverStepPanel,
  setupSuggest, suggestApplied, setupDoctor, setupImportPanel, setupImportModal, parseServerText,
  setupImportResult, setupExport, setupResetPanel, setupResetModal, setupResetDone,
  kitCommandsPanel, kitsDoctor, serverChoice, whoisModal, rosterSearchModal, whoisReply,
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

/* -------------------------------------------------------------- settings ---- */
/* Roles, logging channels, servers and kit settings are kept here and mirrored to the
   website whenever BOT_SETTINGS_TOKEN is set. A save the website refuses is reported to
   whoever asked for it, so nothing quietly pretends to have been stored. */
const settings = {
  staffRoles: {},
  logChannels: {},
  servers: [],
  kits: { binds: [], locked: false, authSpawn: {}, giveCommand: '', listCommand: '' },
  installs: {},
  links: [],
  pending: [],
  linkPanel: null,
};
const cooldowns = new Map();
let settingsTimer = null;
/* How often settings edited on the website are read back (SETTINGS_RELOAD_MS, default two
   minutes; the simulator shortens it). */
const RELOAD_MS = Math.max(1000, Number(process.env.SETTINGS_RELOAD_MS) || 120000);

function settingsToken() { return cleanEnvValue(process.env.BOT_SETTINGS_TOKEN || ''); }

/* The bot's internal HTTP routes (guild metadata, RCON tests, reconnect) are for the website's
   server side only. It proves itself with BOT_SETTINGS_TOKEN in x-settings-token, compared in
   constant time; without the token set here those routes stay shut. */
function settingsAuthOk(req) {
  const expected = settingsToken();
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-settings-token'] || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireSettingsAuth(req, res) {
  if (settingsAuthOk(req)) return false;
  const status = settingsToken() ? 403 : 503;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ ok: false, reason: status === 403 ? 'forbidden' : 'no-settings-token' }));
  try { req.resume(); } catch (error) { /* already gone */ }
  return true;
}

/* ------------------------------------------------------------ settings file ---- */
/* A second home for settings, on this machine. With a Railway volume attached
   (RAILWAY_VOLUME_MOUNT_PATH), or SETTINGS_FILE pointing somewhere that lasts, settings survive
   restarts and redeploys even without BOT_SETTINGS_TOKEN. Without either, the file sits in the
   container and only outlives a crash-restart of the same container. The file holds RCON
   passwords, so it is written owner-only (0600), whole, and swapped in atomically. */
const VOLUME_DIR = cleanEnvValue(process.env.RAILWAY_VOLUME_MOUNT_PATH || '');
const SETTINGS_FILE = cleanEnvValue(process.env.SETTINGS_FILE || '') || (VOLUME_DIR ? join(VOLUME_DIR, 'spinback-settings.json') : join(process.cwd(), 'data', 'spinback-settings.json'));
const FILE_IS_DURABLE = !!(cleanEnvValue(process.env.SETTINGS_FILE || '') || VOLUME_DIR);
const FILE_SECTIONS = ['staffRoles', 'logChannels', 'servers', 'kits', 'installs', 'links', 'pending', 'linkPanel'];
let fileTimer = null;
let fileState = { ok: null, at: null, detail: '' };
function writeSettingsFileNow() {
  if (fileTimer) { clearTimeout(fileTimer); fileTimer = null; }
  try {
    const out = { version: 1, savedAt: new Date().toISOString() };
    FILE_SECTIONS.forEach(function (k) { out[k] = settings[k]; });
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
    const tmp = SETTINGS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
    renameSync(tmp, SETTINGS_FILE);
    fileState = { ok: true, at: out.savedAt, detail: '' };
  } catch (error) {
    fileState = { ok: false, at: new Date().toISOString(), detail: String((error && error.message) || error).slice(0, 200) };
    log('settings file write failed:', fileState.detail);
  }
  return fileState;
}
/* Saves come in bursts (a role menu, then another): one write a moment later covers them. */
function writeSettingsFileSoon() {
  if (fileTimer) return;
  fileTimer = setTimeout(writeSettingsFileNow, 400);
  if (fileTimer.unref) fileTimer.unref();
}
function readSettingsFile() {
  try {
    if (!existsSync(SETTINGS_FILE)) return false;
    const body = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    applySettings(body);
    fileState = { ok: true, at: body.savedAt || null, detail: '' };
    log('read settings from ' + (FILE_IS_DURABLE ? 'the data file' : 'this container') + ' (saved ' + (body.savedAt || 'at an unknown time') + ')');
    return true;
  } catch (error) {
    log('settings file unreadable, ignored:', String((error && error.message) || error).slice(0, 200));
    return false;
  }
}
/* Where settings really live: the website, a lasting file, or nowhere that outlives a redeploy. */
function storeKind() { return settingsToken() ? 'website' : FILE_IS_DURABLE ? 'file' : 'memory'; }

function panelEmbed(color, title, description) { return { color: color, title: title, description: description }; }
function panelRow(components) { return { type: 1, components: components }; }
function panelButton(id, label, style) { return { type: 2, custom_id: id, label: label, style: style || 2 }; }

/* Only the sections a change touched are sent. The website merges each save into what it
   holds, and its Settings page edits the same sections, so sending everything would put this
   bot's older copy of a section back over a newer edit made on the website. */
let lastPersistAt = 0;
/* Saves go out one at a time, in the order they were made, so a quick second change can never
   reach the website before the first and be overwritten by it. */
/* While one save is on its way, later changes wait together: their sections are merged into
   a single next save (sent with the values current at that moment), so a burst of clicks is
   one request, not a backlog. */
let persistQueue = Promise.resolve();
let waitingSave = null;
function persistSettings(sections) {
  writeSettingsFileSoon();
  const wanted = Array.isArray(sections) && sections.length ? sections : null;
  if (waitingSave) {
    if (!wanted) waitingSave.all = true;
    else wanted.forEach(function (k) { waitingSave.sections.add(k); });
    return waitingSave.promise;
  }
  const entry = { sections: new Set(wanted || []), all: !wanted, promise: null };
  const run = function () {
    if (waitingSave === entry) waitingSave = null;
    return persistSettingsNow(entry.all ? null : Array.from(entry.sections));
  };
  entry.promise = persistQueue.then(run, run);
  waitingSave = entry;
  persistQueue = entry.promise.then(function () {}, function () {});
  return entry.promise;
}
async function persistSettingsNow(sections) {
  const token = settingsToken();
  if (!token) {
    return FILE_IS_DURABLE
      ? { ok: true, detail: '', where: 'file' }
      : { ok: false, detail: 'BOT_SETTINGS_TOKEN is not set and no volume is attached, so this lasts until the next redeploy' };
  }
  const everything = {
    staffRoles: settings.staffRoles,
    logChannels: settings.logChannels,
    servers: settings.servers,
    kits: settings.kits,
    installs: settings.installs,
    links: settings.links,
    pending: settings.pending,
    linkPanel: settings.linkPanel,
  };
  const outgoing = {};
  (Array.isArray(sections) && sections.length ? sections : Object.keys(everything)).forEach(function (key) {
    if (key in everything) outgoing[key] = everything[key];
  });
  lastPersistAt = Date.now();
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


function applySettings(body) {
  if (!body || typeof body !== 'object') return;
  if (body.staffRoles && typeof body.staffRoles === 'object') settings.staffRoles = body.staffRoles;
  if (body.logChannels && typeof body.logChannels === 'object') settings.logChannels = body.logChannels;
  if (Array.isArray(body.servers)) settings.servers = body.servers;
  if (body.kits && typeof body.kits === 'object') settings.kits = Object.assign(settings.kits, body.kits);
  if (body.installs && typeof body.installs === 'object') settings.installs = Object.assign({}, body.installs);
  if (Array.isArray(body.links)) settings.links = body.links;
  if (Array.isArray(body.pending)) settings.pending = body.pending;
  if (body.linkPanel && typeof body.linkPanel === 'object') settings.linkPanel = body.linkPanel;
}

async function loadSettings(quiet) {
  const token = settingsToken();
  if (!token) { if (!quiet) log('BOT_SETTINGS_TOKEN is not set, so saved settings cannot be read from the website'); return; }
  try {
    /* full=1 asks for the RCON passwords: only this service talks to RCON, and the website
       hides them from anything running in a browser. */
    const res = await fetch(SITE_URL + '/api/bot/settings?full=1', {
      headers: { 'x-settings-token': token, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { log('settings read answered ' + res.status); return; }
    const body = await res.json();
    applySettings(body);
    writeSettingsFileSoon();
    if (!quiet) {
      log('loaded ' + Object.keys(settings.staffRoles).filter(function (k) { return settings.staffRoles[k]; }).length + ' role slot(s), '
        + Object.keys(settings.logChannels).filter(function (k) { return settings.logChannels[k]; }).length
        + ' log channel(s), ' + settings.servers.length + ' server(s), ' + settings.kits.binds.length + ' bind(s)');
    }
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
  const key = createHash('sha256').update(String(raw)).digest('hex').slice(0, 32);
  settings.installs[key] = { at: new Date().toISOString(), chars: text.length, head: text.slice(0, 400) };
  const keys = Object.keys(settings.installs);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(function (k) { delete settings.installs[k]; });
  persistSettings(['installs']).catch(function () { /* reported the next time settings are saved */ });
  return Object.keys(settings.installs).length;
}

function setAuthSpawn(group, kit) {
  const name = String(group || '').trim();
  if (!name) return;
  if (kit && String(kit).trim()) settings.kits.authSpawn[name] = String(kit).trim().slice(0, 60);
  else delete settings.kits.authSpawn[name];
  persistSettings(['kits']).catch(function () {});
}

/* Manual /kits give cooldowns: one record per gamertag + kit ("player::kit", lower case),
   holding when it may be given again. Expired records are dropped whenever they are read. */
function pruneCooldowns() {
  const now = Date.now();
  cooldowns.forEach(function (until, key) { if (!(Number(until) > now)) cooldowns.delete(key); });
}
function cooldownCount() { pruneCooldowns(); return cooldowns.size; }
const activeKitGives = new Set();
/* Reserve a give before RCON is asked, so two staff giving the same kit to the same player at
   the same moment cannot both get through; the cooldown starts only if the server took it. */
function reserveKitGive(gamertag, kit, seconds) {
  pruneCooldowns();
  const key = String(gamertag || '').trim().toLowerCase() + '::' + String(kit || '').trim().toLowerCase();
  const until = Number(cooldowns.get(key) || 0);
  if (until > Date.now()) return { ok: false, key: key, remainingSeconds: Math.max(1, Math.ceil((until - Date.now()) / 1000)) };
  if (activeKitGives.has(key)) return { ok: false, key: key, inProgress: true, remainingSeconds: 1 };
  activeKitGives.add(key);
  return { ok: true, key: key, seconds: Math.max(0, Math.min(86400, Math.floor(Number(seconds) || 0))) };
}
function finishKitGive(reservation, succeeded) {
  if (!reservation || !reservation.key) return;
  activeKitGives.delete(reservation.key);
  if (succeeded && reservation.seconds > 0) {
    cooldowns.set(reservation.key, Date.now() + reservation.seconds * 1000);
    if (cooldowns.size > 5000) {
      [...cooldowns.entries()].sort(function (a, b) { return a[1] - b[1]; }).slice(0, cooldowns.size - 5000)
        .forEach(function (entry) { cooldowns.delete(entry[0]); });
    }
  }
}

function cooldownList() {
  pruneCooldowns();
  const rows = [];
  cooldowns.forEach(function (value, key) {
    const parts = String(key).split('::');
    const user = parts[0] || 'unknown';
    const kit = parts[1] || 'unknown';
    const left = Math.max(0, Math.round(((Number(value) || 0) - Date.now()) / 1000));
    rows.push(user + ' -> ' + kit + ' (' + left + 's left)');
  });
  return rows;
}

function clearCooldowns(scope, target) {
  const wanted = String(target || '').trim().toLowerCase();
  let cleared = 0;
  cooldowns.forEach(function (value, key) {
    const parts = String(key).split('::');
    const user = parts[0] || '';
    const kit = parts[1] || '';
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
/* Gamertags end up in RCON command lines and in the roster, so control characters are
   dropped and runs of spaces collapse to one before anything is stored. */
function normaliseGamertag(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
/* A Discord account id is a snowflake: digits only, 15 to 25 of them. */
function validUserId(id) { return /^[0-9]{15,25}$/.test(String(id || '')); }

function findLinkByGamertag(gamertag) {
  const wanted = normaliseGamertag(gamertag).toLowerCase();
  return settings.links.filter(function (l) { return l.gamertag.toLowerCase() === wanted; })[0] || null;
}
function findLinkByUser(userId) {
  return settings.links.filter(function (l) { return l.userId === String(userId); })[0] || null;
}
function addLink(userId, gamertag, by) {
  const tag = normaliseGamertag(gamertag);
  const id = String(userId || '').trim();
  if (!tag || !id) return { ok: false, reason: 'empty' };
  if (!validUserId(id)) return { ok: false, reason: 'bad-user-id', detail: 'That Discord account id does not look valid.' };
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
  persistSettings(['links', 'pending']).catch(function () {});
  return { ok: true, gamertag: tag, userId: id };
}
function requestLink(userId, gamertag) {
  const tag = normaliseGamertag(gamertag);
  if (!tag) return { ok: false, reason: 'empty' };
  const taken = findLinkByGamertag(tag);
  if (taken) {
    const mine = taken.userId === String(userId);
    return { ok: false, reason: mine ? 'already-yours' : 'taken', detail: mine
      ? 'That gamertag is already linked to your account.'
      : 'That gamertag is already linked. If it is yours, ask staff to move it with /user transfer.' };
  }
  const id = String(userId || '').trim();
  if (!validUserId(id)) return { ok: false, reason: 'bad-user-id', detail: 'Discord did not provide a valid account id.' };
  /* One gamertag waits for one account: a second account claiming the same name is told so
     instead of quietly queueing a rival claim for staff to untangle. */
  const rival = settings.pending.filter(function (p) {
    return String(p.userId) !== id && String(p.gamertag || '').toLowerCase() === tag.toLowerCase();
  })[0];
  if (rival) return { ok: false, reason: 'pending-taken', detail: 'That gamertag is already waiting for staff to confirm it for another Discord account. If it is yours, ask staff.' };
  settings.pending = settings.pending.filter(function (p) { return String(p.userId) !== id; });
  if (settings.pending.length >= 500) return { ok: false, reason: 'queue-full', detail: 'The waiting list is full. Ask staff to clear old requests, then try again.' };
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
  /* STAFF_SLOTS leaves out "linked": that role marks confirmed players, not staff. */
  const ids = STAFF_SLOTS.map(function (s) { return (settings.staffRoles || {})[s[0]]; }).filter(Boolean);
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

/* new panel message id -> the panel it replaced, for the "Remove the older panel" button */
const previousPanels = new Map();
async function removeOldPanel(newMessageId) {
  const old = previousPanels.get(String(newMessageId));
  if (!old) return { ok: false, detail: 'There is no older panel on record.' };
  try {
    const channel = client.channels.cache.get(old.channelId) || await client.channels.fetch(old.channelId);
    const message = await channel.messages.fetch(old.messageId);
    await message.delete();
    previousPanels.delete(String(newMessageId));
    return { ok: true, channelId: old.channelId };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error).slice(0, 200) };
  }
}
async function postLinkPanel(channelId) {
  try {
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(function () { return null; });
    if (!channel || typeof channel.send !== 'function') return { ok: false, detail: 'The bot cannot post in that channel.' };
    const message = await channel.send(dress(linkPanelPayload(), dressCtx()));
    const previous = settings.linkPanel && settings.linkPanel.messageId ? settings.linkPanel : null;
    settings.linkPanel = { channelId: channelId, messageId: (message && message.id) || null, at: new Date().toISOString() };
    if (previous) previousPanels.set(String(settings.linkPanel.messageId), previous);
    const wrote = await persistSettings(['linkPanel']);
    return { ok: true, saved: wrote.ok, detail: wrote.detail || '', previous: previous };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error) };
  }
}

/* When a kit is given by picking a player first, the picked gamertag is remembered here for
   the next screen. Held in memory only: a restart just means picking again. */
const pendingGive = new Map();

/* ------------------------------------------------- proposals not yet written ---- */
/* What was on screen for one person: a suggestion list, the log types to create channels
   for, parsed server.cfg lines. None of it is a setting; each entry is dropped once applied
   or cancelled, and anything older than fifteen minutes is forgotten. */
const PROPOSAL_TTL_MS = 15 * 60 * 1000;
function proposalStore() {
  const map = new Map();
  return {
    set(userId, value) {
      const now = Date.now();
      map.forEach(function (v, k) { if (v.until <= now) map.delete(k); });
      if (map.size >= 200) map.delete(map.keys().next().value);
      map.set(String(userId), { value: value, until: now + PROPOSAL_TTL_MS });
    },
    get(userId) { const v = map.get(String(userId)); return v && v.until > Date.now() ? v.value : null; },
    delete(userId) { map.delete(String(userId)); },
  };
}
const pendingSuggest = proposalStore();
const pendingBuild = proposalStore();
const pendingImport = proposalStore();

/* /setup reset: clears the configuration and deliberately keeps player data - links,
   waiting requests and the link panel are not settings. Returns how many entries went. */
function clearAllSettings() {
  let cleared = Object.keys(settings.staffRoles || {}).filter(function (k) { return settings.staffRoles[k]; }).length
    + Object.keys(settings.logChannels || {}).filter(function (k) { return settings.logChannels[k]; }).length
    + (settings.servers || []).length
    + (settings.kits.binds || []).length
    + Object.keys(settings.kits.authSpawn || {}).length
    + Object.keys(settings.installs || {}).length;
  cleared += ['listCommand', 'giveCommand'].filter(function (key) { return String(settings.kits[key] || '').trim(); }).length;
  /* cleared slots are sent as null, so the website's merge really clears them */
  const nullOut = function (obj) { const out = {}; Object.keys(obj || {}).forEach(function (k) { out[k] = null; }); return out; };
  settings.staffRoles = nullOut(settings.staffRoles);
  settings.logChannels = nullOut(settings.logChannels);
  settings.servers = [];
  settings.kits = { binds: [], locked: false, authSpawn: {}, giveCommand: '', listCommand: '', giveCooldownSeconds: 30, known: [] };
  settings.installs = {};
  Object.keys(serverChecks).forEach(function (k) { delete serverChecks[k]; });
  return cleared;
}

/* Writes only what the proposal holds: nothing is matched again here, so the list a person
   agreed to is the list that is applied. */
function applyProposal(proposal) {
  const roleLines = [];
  const channelLines = [];
  const roleMisses = [];
  ROLE_SLOTS.forEach(function (slot) {
    const hit = proposal && proposal.roles ? proposal.roles[slot[0]] : null;
    if (!hit) { roleMisses.push(slot[1]); return; }
    if (String(settings.staffRoles[slot[0]] || '') === String(hit.roleId)) return;
    settings.staffRoles[slot[0]] = String(hit.roleId);
    roleLines.push(slot[1] + ' -> ' + hit.name);
  });
  LOG_TYPES.forEach(function (type) {
    const hit = proposal && proposal.channels ? proposal.channels[type[0]] : null;
    if (!hit) return;
    settings.logChannels[type[0]] = String(hit.channelId);
    channelLines.push(type[1] + ' -> #' + hit.name);
  });
  return { roleLines: roleLines, channelLines: channelLines, roleMisses: roleMisses };
}

/* Everything the bot creates in the guild lives here. Nothing runs until an administrator
   presses the button that says so, and every role and channel is reported back one by one. */

/* The roles /setup run can make. Colours are cosmetic; the ids saved afterwards are what the
   bot checks when it decides who may run staff commands. Nothing is granted here: a role that
   only marks rank is exactly what these are, and Discord permissions stay as they are. */
async function createStaffRoles() {
  const guild = GUILD_ID ? client.guilds.cache.get(GUILD_ID) : null;
  if (!guild) return { created: [], reused: [], failed: ['the bot is not connected to this server right now'], wrote: { ok: false, detail: 'the guild is not available' } };
  const created = [];
  const reused = [];
  const failed = [];
  let me = null;
  try { me = guild.members.me || await guild.members.fetchMe(); } catch (error) { me = null; }
  const canManageRoles = !!(me && me.permissions && me.permissions.has(PermissionFlagsBits.ManageRoles));
  for (const recipe of STAFF_ROLE_RECIPES) {
    const slot = recipe[0], name = recipe[1], colour = recipe[2];
    const already = guild.roles.cache.find(function (r) { return String(r.name).toLowerCase() === name.toLowerCase(); });
    if (already) {
      if (String(settings.staffRoles[slot] || '') !== String(already.id)) {
        settings.staffRoles[slot] = String(already.id);
        reused.push(name + ' -> <@&' + already.id + '> (a role with that name was already here, so this one was used)');
      } else {
        reused.push(name + ' -> <@&' + already.id + '> (already saved)');
      }
      continue;
    }
    if (!canManageRoles) { failed.push('**' + name + '**: the bot needs **Manage Roles** to make this one. Give it that permission, or pick a role that exists already.'); continue; }
    try {
      const role = await guild.roles.create({
        name: name,
        color: colour,
        hoist: false,
        mentionable: false,
        permissions: [],
        reason: 'Spinback RCE staff role, created by /setup run',
      });
      if (String(settings.staffRoles[slot] || '') !== String(role.id)) settings.staffRoles[slot] = String(role.id);
      created.push(name + ' -> <@&' + role.id + '>');
    } catch (error) {
      failed.push('**' + name + '**: ' + String((error && error.message) || error).slice(0, 140));
    }
  }
  const wrote = await persistSettings(['staffRoles']);
  return { created: created, reused: reused, failed: failed, wrote: wrote };
}

async function createLogChannels(keys) {
  const guild = GUILD_ID ? client.guilds.cache.get(GUILD_ID) : null;
  if (!guild) return { created: [], reused: [], failed: ['the bot is not connected to this server right now'], wrote: { ok: false, detail: 'the guild is not available' } };
  const created = [];
  const reused = [];
  const failed = [];
  const staffIds = STAFF_SLOTS.map(function (slot) { return settings.staffRoles[slot[0]]; }).filter(Boolean).map(String);
  let me = null;
  try { me = guild.members.me || await guild.members.fetchMe(); } catch (error) { me = null; }
  const botId = (me && me.id) || (client.user && client.user.id);
  const canManageChannels = !!(me && me.permissions && me.permissions.has(PermissionFlagsBits.ManageChannels));
  /* @everyone loses View Channel, each saved staff role keeps it, and the bot keeps what it
     needs to post an embed. A channel is only ever private in this way when the staff roles
     exist, so a half-finished setup does not hide logs from the people who need them. */
  function overwritesFor() {
    const list = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
    staffIds.forEach(function (id) {
      list.push({ id: id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
    });
    if (botId) list.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] });
    return list;
  }
  let parentId = null;
  try {
    let category = guild.channels.cache.find(function (c) { return c.type === ChannelType.GuildCategory && String(c.name).toLowerCase() === 'spinback'; });
    if (!category) {
      category = await guild.channels.create({ name: 'Spinback', type: ChannelType.GuildCategory, reason: 'Spinback RCE log channels, requested by a server administrator' });
    }
    parentId = category.id;
  } catch (error) {
    failed.push('the Spinback category: ' + String((error && error.message) || error).slice(0, 140));
  }
  const wanted = (keys || []).slice(0, 10);
  for (const key of wanted) {
    const type = LOG_TYPES.filter(function (t) { return t[0] === key; })[0];
    const name = 'spinback-' + String(key).toLowerCase();
    const label = type ? type[1] : key;
    const already = guild.channels.cache.find(function (c) { return c.type === ChannelType.GuildText && String(c.name).toLowerCase() === name; });
    if (already) {
      try {
        await already.permissionOverwrites.set(overwritesFor());
        settings.logChannels[key] = already.id;
        reused.push('#' + already.name + ' for ' + label + ' - already there, so its permissions were set rather than making a second one');
      } catch (error) {
        failed.push(name + ': it is already there but its permissions could not be set (' + String((error && error.message) || error).slice(0, 100) + ')');
      }
      continue;
    }
    if (!canManageChannels) { failed.push('**' + name + '**: the bot needs **Manage Channels** to make this one.'); continue; }
    try {
      const options = { name: name, type: ChannelType.GuildText, topic: 'Spinback RCE ' + label, reason: 'Spinback RCE log channel, requested by a server administrator', permissionOverwrites: overwritesFor() };
      if (parentId) options.parent = parentId;
      const channel = await guild.channels.create(options);
      settings.logChannels[key] = channel.id;
      created.push('#' + channel.name + ' for ' + label);
    } catch (error) {
      failed.push(name + ': ' + String((error && error.message) || error).slice(0, 140));
    }
  }
  const wrote = (created.length || reused.length) ? await persistSettings(['logChannels']) : { ok: true };
  return { created: created, reused: reused, failed: failed, staffIds: staffIds, wrote: wrote };
}
const PENDING_GIVE_TTL_MS = 10 * 60 * 1000;
/* Remembered for ten minutes at most, and never more than 500 at once, so abandoned forms
   cannot pile up in memory. */
function rememberPendingGive(userId, gamertag) {
  const now = Date.now();
  pendingGive.forEach(function (entry, key) { if (!entry || entry.expiresAt <= now) pendingGive.delete(key); });
  if (pendingGive.size >= 500 && !pendingGive.has(String(userId))) {
    const oldest = pendingGive.keys().next().value;
    if (oldest !== undefined) pendingGive.delete(oldest);
  }
  pendingGive.set(String(userId), { gamertag: String(gamertag || ''), expiresAt: now + PENDING_GIVE_TTL_MS });
}
function takePendingGive(userId) {
  const entry = pendingGive.get(String(userId));
  pendingGive.delete(String(userId));
  return entry && entry.expiresAt > Date.now() ? entry.gamertag : '';
}

function botCtx(interaction) {
  const actor = interaction && interaction.user ? { id: interaction.user.id, tag: interaction.user.tag || interaction.user.username || interaction.user.id } : null;
  return {
    siteUrl: SITE_URL,
    settings: settings,
    guildInfo: state.guildInfo || null,
    gateway: state.gateway,
    actor: actor,
    ping: function () { return client.ws.ping; },
    uptime: function () { return (Date.now() - state.since) / 1000; },
    commandCount: function () { return state.commandNames ? state.commandNames.length : 0; },
    storeTokenSet: function () { return storeKind() !== 'memory'; },
    storeKind: storeKind,
    servers: function () { return settings.servers; },
    kits: function () { return settings.kits; },
    links: function () { return settings.links; },
    pendingLinks: function () { return settings.pending; },
    linkPanel: function () { return settings.linkPanel; },
    saveServer: saveServer,
    installKit: installKitCode,
    addLink: addLink,
    removeLink: removeLink,
    moveLink: moveLink,
    requestLink: requestLink,
    setAuthSpawn: setAuthSpawn,
    clearCooldowns: clearCooldowns,
    cooldownCount: cooldownCount,
    cooldownList: cooldownList,
    setKnownKits: function (names) {
      settings.kits.known = names.slice(0, 100);
      persistSettings(['kits']).catch(function () {});
    },
    setDelivery: function (d) {
      settings.kits.listCommand = d.listCommand;
      settings.kits.giveCommand = d.giveCommand;
      if (Number.isInteger(d.giveCooldownSeconds)) settings.kits.giveCooldownSeconds = d.giveCooldownSeconds;
      logLater('admin', 'Kit delivery changed', who(actor) + ' set the list command to `' + (d.listCommand || 'none') + '` and the give template to `' + (d.giveCommand || 'none') + '`.');
      return persistSettings(['kits']).then(function (wrote) {
        return wrote && wrote.ok ? { ok: true } : { ok: false, detail: (wrote && wrote.detail) || 'the website did not accept the save' };
      }, function (error) { return { ok: false, detail: String((error && error.message) || error).slice(0, 160) }; });
    },
    diagnostics: diagnostics,
    reserveKitGive: reserveKitGive,
    finishKitGive: finishKitGive,
    serverChecks: function () { return serverChecks; },
    recordCheck: function (id, answer) {
      serverChecks[id] = { ok: !!(answer && answer.ok), ms: answer && answer.ms, reason: answer && !answer.ok ? (answer.reason || 'unknown') : null, at: new Date().toISOString() };
      updatePresence();
    },
    linkPlayer: function (userId, gamertag) { return linkPlayer(userId, gamertag, actor); },
    moveLinkFull: function (gamertag, toUserId, toGamertag) { return moveLinkFull(gamertag, toUserId, toGamertag, actor); },
    /* Every RCON command a person causes is written to the RCON log: what was sent, where,
       by whom and what came back. Never the password. */
    target: function (host, port) { return parseRconTarget(host, port); },
    rconTest: function (o) { return rconLogged(Object.assign({}, o, { allowAny: false }), actor); },
    rconRun: function (o) { return rconLogged(Object.assign({}, o, { allowAny: true }), actor); },
  };
}

/* ---------------------------------------------------------------- logging ---- */
/* The log channels picked in step 2 of /setup. Until now they were saved and never written
   to; these are the types the bot itself can write. A failed post never breaks a command. */
const LOG_COLORS = { command: 0x5865f2, rcon: 0xff7200, linking: 0x3ba55d, emoteKits: 0xff7200, admin: 0xfaa81a, errors: 0xdc4c4c };
const LOG_NAMES = { command: 'Command log', rcon: 'RCON log', linking: 'Linking log', emoteKits: 'Emote kits log', admin: 'Admin log', errors: 'Error log' };
function who(actor) { return actor && actor.id ? '<@' + actor.id + '>' : 'the bot'; }
/* The bot's own picture, for every embed and for the website's bot card. */
function botAvatarUrl() {
  try {
    if (client.user && typeof client.user.displayAvatarURL === 'function') return client.user.displayAvatarURL({ extension: 'png', size: 128 });
  } catch (error) { /* not logged in yet */ }
  return null;
}
function dressCtx() { return { siteUrl: SITE_URL, avatar: botAvatarUrl() }; }

async function postLog(type, title, description, fields) {
  const channelId = (settings.logChannels || {})[type];
  if (!channelId) return { ok: false, reason: 'off', detail: 'No channel is set for this log type.' };
  try {
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(function () { return null; });
    if (!channel || typeof channel.send !== 'function') return { ok: false, reason: 'unreachable', detail: 'The bot cannot see that channel. Check it still exists and the bot can view it.' };
    const embedOut = {
      color: LOG_COLORS[type] || 0x5865f2,
      title: String(title || 'Log').slice(0, 256),
      description: String(description || '').slice(0, 3900),
      timestamp: new Date().toISOString(),
      /* which log this is sits on top; the one footer every embed carries sits below */
      author: { name: (LOG_NAMES[type] || 'Log') + ' | ' + BRAND },
      footer: { text: PANEL_FOOTER },
    };
    if (/^https:\/\//.test(SITE_URL)) embedOut.footer.icon_url = SITE_URL.replace(/\/+$/, '') + '/media/icon-192.png';
    const avatar = botAvatarUrl();
    if (avatar) embedOut.author.icon_url = avatar;
    if (fields && fields.length) {
      embedOut.fields = fields.slice(0, 10).map(function (f) {
        return { name: String(f.name || '-').slice(0, 256), value: String(f.value || '-').slice(0, 1024), inline: !!f.inline };
      });
    }
    /* Logs name people with mentions for clarity, but never ping them. */
    await channel.send({ embeds: [embedOut], allowedMentions: { parse: [] } });
    return { ok: true };
  } catch (error) {
    const detail = String((error && error.message) || error).slice(0, 200);
    log('log post failed (' + type + '):', detail);
    return { ok: false, reason: 'send-failed', detail: detail };
  }
}
function logLater(type, title, description, fields) { postLog(type, title, description, fields).catch(function () {}); }

/* ------------------------------------------------------------ connection watch ---- */
/* RCON cannot stream a server's own log, so this does the honest, useful thing: every two
   minutes it asks each saved server (up to five) one read-only question, keeps the answer for
   /ping, /setup and the website, and posts in the Server log when a connection goes down or
   comes back. Nothing is posted for the first check after a start, so a redeploy is quiet,
   and nothing runs at all until a server is saved. */
const WATCH_MS = Math.max(2000, Number(process.env.RCON_WATCH_MS) || 120000);
async function watchServers() {
  const servers = (settings.servers || []).slice(0, 5);
  for (const server of servers) {
    const answer = await rconRun({ host: server.host, port: server.port, password: server.password, command: 'serverinfo', allowAny: false });
    const before = serverChecks[server.id];
    serverChecks[server.id] = { ok: !!(answer && answer.ok), ms: answer && answer.ms, reason: answer && !answer.ok ? (answer.reason || 'unknown') : null, at: new Date().toISOString(), detail: answer && !answer.ok ? String(answer.detail || '').slice(0, 200) : null };
    if (before && before.ok !== serverChecks[server.id].ok) {
      const now = serverChecks[server.id];
      logLater('server', now.ok ? 'Rust server connected' : 'Rust server connection lost',
        '**' + server.name + '** ' + (now.ok ? 'answered again, in ' + now.ms + ' ms.' : 'stopped answering: `' + now.reason + '`. ' + (now.detail || '')),
        now.ok ? [] : [{ name: 'What to check', value: 'The host is up, RCON is on with rcon.web 0, and the RCON port is open to the internet. **/setup doctor** measures it from here.' }]);
    }
  }
  updatePresence();
}
setInterval(function () { if ((settings.servers || []).length) watchServers().catch(function () {}); }, WATCH_MS).unref();

async function rconLogged(options, actor) {
  const started = Date.now();
  const answer = await rconRun(options);
  const server = settings.servers.filter(function (s) { return s.host === options.host && Number(s.port) === Number(options.port); })[0];
  logLater('rcon', answer && answer.ok ? 'RCON command answered' : 'RCON command failed',
    who(actor) + ' sent `' + String(answer && answer.command ? answer.command : options.command || 'serverinfo').slice(0, 300) + '` to **' +
      (server ? server.name : options.host + ':' + options.port) + '**.',
    [
      { name: 'Result', value: answer && answer.ok ? 'answered in ' + (answer.ms || Date.now() - started) + ' ms' : String((answer && (answer.reason + ': ' + (answer.detail || ''))) || 'no answer').slice(0, 300), inline: true },
      { name: 'Answer', value: answer && answer.answer ? '```\n' + String(answer.answer).slice(0, 900) + '\n```' : '-', inline: false },
    ]);
  return answer;
}

/* ------------------------------------------------------- live health checks ---- */
/* The last RCON check of each saved server since this process started (not saved: it is
   runtime state, and a restart is a good reason to check again). */
const serverChecks = {};

/* What /setup status checks, read from the guild as the bot sees it right now: can the bot
   post in each saved log channel, does each saved role still exist, and can it give the
   linked role (Manage Roles, and its own highest role above that role). */
function diagnostics() {
  const guild = client.guilds.cache.get(GUILD_ID);
  const out = { ready: !!guild, channels: {}, roles: {}, linked: null };
  if (!guild) return out;
  const me = guild.members && guild.members.me;
  let canManage = false;
  try { canManage = !!(me && me.permissions && me.permissions.has(PermissionFlagsBits.ManageRoles)); } catch (error) { canManage = false; }
  const top = me && me.roles && me.roles.highest ? me.roles.highest.position : null;
  Object.keys(settings.logChannels || {}).forEach(function (type) {
    const id = settings.logChannels[type];
    if (!id) return;
    const channel = guild.channels && guild.channels.cache ? guild.channels.cache.get(String(id)) : null;
    let canSend = null;
    try {
      const allowed = channel && channel.permissionsFor ? channel.permissionsFor(client.user) : null;
      if (allowed) canSend = allowed.has('ViewChannel') && allowed.has('SendMessages') && allowed.has('EmbedLinks');
    } catch (error) { canSend = null; }
    out.channels[type] = { id: String(id), exists: !!channel, canSend: canSend };
  });
  Object.keys(settings.staffRoles || {}).forEach(function (slot) {
    const id = settings.staffRoles[slot];
    if (!id) return;
    const role = guild.roles.cache.get(String(id));
    out.roles[slot] = { id: String(id), exists: !!role };
  });
  const linkedId = (settings.staffRoles || {}).linked;
  if (linkedId) {
    const role = guild.roles.cache.get(String(linkedId));
    out.linked = { id: String(linkedId), exists: !!role, canManage: canManage,
      above: role && top !== null ? top > role.position : null, managed: !!(role && role.managed) };
  }
  return out;
}

/* A direct message to a player about their own link request. Many people keep DMs from
   server members closed, so a refusal is expected and only reported back to staff. */
async function tellPlayer(userId, text, good) {
  try {
    const user = await client.users.fetch(String(userId));
    await user.send(dress({ embeds: [panelEmbed(good ? 0x3ba55d : 0xdc4c4c, good ? 'You are linked' : 'Link request not approved', String(text).slice(0, 1900))],
      allowedMentions: { parse: [] } }, dressCtx()));
    return true;
  } catch (error) {
    return false;
  }
}
function guildName() {
  const guild = client.guilds.cache.get(GUILD_ID);
  return guild ? guild.name : 'the server';
}

/* --------------------------------------------------------- the linked role ---- */
/* The role saved as "Linked" in setup is given when a link is confirmed and taken away when it
   is removed or moved off an account. It needs Manage Roles, with the bot's own role above it;
   when Discord refuses, the reply says exactly why instead of pretending. */
async function syncLinkedRole(userId, give) {
  const roleId = (settings.staffRoles || {}).linked;
  if (!roleId || !userId) return { ok: true, skipped: true };
  try {
    const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(String(userId)).catch(function () { return null; });
    if (!member) return { ok: false, detail: 'that account is not in this server' };
    if (give) await member.roles.add(String(roleId), 'Spinback RCE: gamertag linked');
    else await member.roles.remove(String(roleId), 'Spinback RCE: gamertag unlinked');
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error).slice(0, 160) };
  }
}
function roleNote(result, give) {
  if (!result || result.skipped) return '';
  return result.ok
    ? (give ? ' The linked role was given.' : ' The linked role was removed.')
    : ' The linked role could not be ' + (give ? 'given' : 'removed') + ': ' + result.detail + '. The bot needs Manage Roles, with its own role above the linked role.';
}
async function linkPlayer(userId, gamertag, actor) {
  const done = addLink(userId, gamertag, actor ? actor.id : userId);
  const role = done.ok ? await syncLinkedRole(done.userId, true) : null;
  if (done.ok) {
    logLater('linking', 'Player linked', '<@' + done.userId + '> is linked to `' + done.gamertag + '` by ' + who(actor) + '.',
      role && !role.skipped ? [{ name: 'Linked role', value: role.ok ? 'given' : 'not given: ' + role.detail }] : null);
  }
  return Object.assign({}, done, { roleNote: roleNote(role, true) });
}
async function unlinkPlayer(which, actor, reason) {
  const before = findLinkByGamertag(which) || findLinkByUser(which);
  const gone = removeLink(which);
  let role = null;
  if (gone && before) {
    role = await syncLinkedRole(before.userId, false);
    logLater('linking', 'Player unlinked', '`' + before.gamertag + '` (<@' + before.userId + '>) was unlinked by ' + who(actor) + (reason ? ' - ' + reason : '') + '.',
      role && !role.skipped ? [{ name: 'Linked role', value: role.ok ? 'removed' : 'not removed: ' + role.detail }] : null);
  }
  return { gone: gone, before: before, roleNote: roleNote(role, false) };
}
async function moveLinkFull(gamertag, toUserId, toGamertag, actor) {
  const before = findLinkByGamertag(gamertag);
  const moved = moveLink(gamertag, toUserId || (before && before.userId), toGamertag);
  if (!moved.ok || !before) return moved;
  let notes = '';
  if (before.userId !== moved.userId) {
    notes += roleNote(await syncLinkedRole(before.userId, false), false);
    notes += roleNote(await syncLinkedRole(moved.userId, true), true);
  }
  logLater('linking', 'Link moved', '`' + before.gamertag + '` (<@' + before.userId + '>) is now `' + moved.gamertag + '` (<@' + moved.userId + '>), moved by ' + who(actor) + '.');
  return Object.assign({}, moved, { roleNote: notes });
}
function setBindRole(emote, roleId) {
  const bind = settings.kits.binds.filter(function (b) { return b.emote.toLowerCase() === String(emote || '').toLowerCase(); })[0];
  if (!bind) return null;
  bind.roleId = roleId || null;
  persistSettings(['kits']).catch(function () {});
  return bind;
}

/* ----------------------------------------------------------- interactions ---- */
/* /ping, /help, /setup, /kits and /user, and their buttons, menus, forms and suggestions.
   Everything answers only inside the one guild this bot is configured for. Staff actions need
   a saved staff role, Administrator, Manage Server or the server owner. Panels are ephemeral,
   so a role list or a channel choice is never posted into the channel. */

function mayConfigure(interaction) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  try {
    return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
  } catch (error) { return false; }
}

/* Discord drops any interaction that is not acknowledged within three seconds. Every answer
   goes through here: if it is not ready after 1.5 s (an RCON check, a save to the website, a
   Discord REST call), the interaction is deferred first and the answer edited in when it
   arrives. Fast answers still go out directly, without a "thinking..." flash.
   kind: "reply" - a new message only the user sees; "public" - a new message everyone sees;
   "update" - replace the panel the button or menu was on. */
const ACK_AFTER_MS = 1500;
async function respond(interaction, work, kind) {
  let deferring = null;
  const timer = setTimeout(function () {
    deferring = (kind === 'update' ? interaction.deferUpdate() : interaction.deferReply(kind === 'public' ? {} : { flags: 64 }))
      .catch(function (error) { log('defer failed:', String((error && error.message) || error)); });
  }, ACK_AFTER_MS);
  let payload;
  try {
    payload = await Promise.resolve(typeof work === 'function' ? work() : work);
  } catch (error) {
    /* The person sees a short reference; the details (which can name hosts, files or
       internals) go to the bot's log and the staff error channel under the same reference. */
    const ref = Date.now().toString(36).slice(-6);
    const message = String((error && (error.stack || error.message)) || error);
    log('handler failed [' + ref + ']:', message.slice(0, 1200));
    logLater('errors', 'A command failed', who(interaction.user ? { id: interaction.user.id } : null) + ' hit an error (reference ' + ref + ').', [{ name: 'Error', value: message.slice(0, 900) }]);
    payload = { embeds: [panelEmbed(0xdc4c4c, 'That did not work', 'Something went wrong on the bot side. Try again; if it keeps happening, give staff this reference: `' + ref + '`.')] };
  } finally {
    clearTimeout(timer);
  }
  const body = dress(Object.assign({}, payload || { content: 'Done.' }), dressCtx());
  try {
    if (deferring) {
      await deferring;
      delete body.flags;
      if (kind === 'update' && body.components === undefined) body.components = [];
      await interaction.editReply(body);
    } else if (kind === 'update') {
      delete body.flags;
      if (body.components === undefined) body.components = [];
      await interaction.update(body);
    } else {
      if (kind === 'public') delete body.flags;
      else if (body.flags === undefined) body.flags = 64;
      await interaction.reply(body);
    }
  } catch (error) {
    log('answer failed:', String((error && error.message) || error));
  }
}
function answerModal(interaction, payload) { return respond(interaction, payload, 'reply'); }
function answerPanel(interaction, payload) { return respond(interaction, payload, 'update'); }

/* ------------------------------------------------------- traffic control ---- */
/* Three guards in front of every handler:
   - a second press of the same button (or the same command) by the same person while the
     first is still running is answered with "still working", so a double click cannot
     approve, give or save twice;
   - a member who is not staff sending more than RATE_MAX interactions in RATE_WINDOW_MS is
     asked to slow down, which keeps a script or a stuck mouse on the public link panel from
     flooding the bot and the logs (staff clicking through setup are never slowed);
   - while the bot shuts down for a redeploy, new presses get a clear "restarting" answer
     instead of silence, and the ones already running are allowed to finish. */
const RATE_MAX = 12;
const RATE_WINDOW_MS = 10000;
const running = new Set();
const recentByUser = new Map();
let activeInteractions = 0;
let shuttingDown = false;
function interactionKey(interaction) {
  const what = interaction.customId || interaction.commandName || 'x';
  return String((interaction.user && interaction.user.id) || '?') + '|' + what;
}
function overRate(userId) {
  const now = Date.now();
  const list = (recentByUser.get(userId) || []).filter(function (t) { return now - t < RATE_WINDOW_MS; });
  list.push(now);
  recentByUser.set(userId, list);
  if (recentByUser.size > 5000) recentByUser.clear();
  return list.length > RATE_MAX;
}
async function quickNote(interaction, color, title, text) {
  if (typeof interaction.isRepliable === 'function' && !interaction.isRepliable()) return;
  await interaction.reply(dress({ embeds: [panelEmbed(color, title, text)], flags: 64 }, dressCtx())).catch(function () {});
}
async function routeInteraction(interaction) {
  const isSuggest = typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete();
  if (isSuggest) return routeOne(interaction);
  if (shuttingDown) return quickNote(interaction, 0xfaa81a, 'Restarting', 'The bot is restarting for an update. Try again in a few seconds.');
  const userId = String((interaction.user && interaction.user.id) || '?');
  if (overRate(userId) && !permitted(interaction, botCtx(interaction))) return quickNote(interaction, 0xfaa81a, 'Slow down a moment', 'That is a lot of presses in a few seconds. Wait a moment, then try again.');
  const key = interactionKey(interaction);
  if (running.has(key)) return quickNote(interaction, 0xfaa81a, 'Still working on that', 'Your last press of this is still running. The answer will appear on its own.');
  running.add(key);
  activeInteractions += 1;
  try {
    return await routeOne(interaction);
  } finally {
    running.delete(key);
    activeInteractions -= 1;
  }
}
async function routeOne(interaction) {
  try {
    const rightGuild = !!GUILD_ID && interaction.guildId === GUILD_ID;
    if (!rightGuild) {
      if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) return await interaction.respond([]).catch(function () {});
      if (typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
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
    if (typeof interaction.isUserSelectMenu === 'function' && interaction.isUserSelectMenu()) return await runSelect(interaction);
    return;
  } catch (error) {
    const ref = Date.now().toString(36).slice(-6);
    const message = String((error && (error.stack || error.message)) || error);
    log('interaction failed [' + ref + ']:', message.slice(0, 1200));
    logLater('errors', 'An interaction failed', who(interaction.user ? { id: interaction.user.id } : null) + ' hit an error (reference ' + ref + ').', [{ name: 'Error', value: message.slice(0, 900) }]);
    /* After a deferral a second reply is refused, so the error is edited in instead of lost. */
    const body = { embeds: [panelEmbed(0xdc4c4c, 'That failed', 'Something went wrong on the bot side. Try again; if it keeps happening, give staff this reference: `' + ref + '`.')] };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(body);
      else await interaction.reply(Object.assign({ flags: 64 }, body));
    } catch (e) { /* the interaction expired */ }
  }
}

/* Suggestions while someone types: kit names, linked gamertags, saved servers. Staff only,
   because they come from the server's saved settings. */
async function runAutocomplete(interaction) {
  const ctx = botCtx(interaction);
  if (!permitted(interaction, ctx)) return await interaction.respond([]).catch(function () {});
  const opts = optionMap(interaction);
  const focused = interaction.options && typeof interaction.options.getFocused === 'function' ? interaction.options.getFocused(true) : null;
  const choices = autocompleteChoices(ctx, interaction.commandName, opts.__sub, focused, opts);
  await interaction.respond(choices).catch(function (error) { log('autocomplete failed:', String((error && error.message) || error)); });
}

function describeOptions(opts) {
  return Object.keys(opts).filter(function (k) { return k !== '__sub'; }).map(function (k) {
    const v = k === 'code' ? '(install code, ' + String(opts[k]).length + ' characters)' : String(opts[k]);
    return k + ': ' + v.slice(0, 80);
  }).join(', ');
}

async function runCommand(interaction) {
  const name = interaction.commandName;
  if (name !== 'ping' && name !== 'help' && name !== 'setup' && name !== 'kits' && name !== 'user' && name !== 'server') {
    return await interaction.reply({ content: 'That command is no longer used here.', flags: 64 }).catch(function () {});
  }
  const ctx = botCtx(interaction);
  if (name !== 'ping' && name !== 'help' && !permitted(interaction, ctx)) {
    await interaction.reply({ embeds: [permissionNote(ctx)], flags: 64 }).catch(function () {});
    return;
  }
  const opts = optionMap(interaction);
  if (name !== 'ping' && name !== 'help') {
    const shown = describeOptions(opts);
    logLater('command', 'Command used', who(ctx.actor) + ' ran `/' + name + (opts.__sub ? ' ' + opts.__sub : '') + '`' + (shown ? ' with ' + shown : '') + '.');
  }
  return await respond(interaction, async function () {
    const payload = await Promise.resolve(dispatchCommand(ctx, name, opts.__sub, opts));
    /* A panel that offers Apply carries the exact list it shows; it is kept per person here
       and removed before the panel is sent, because Discord does not know that key. */
    if (payload && payload.proposalData) { pendingSuggest.set(interaction.user.id, payload.proposalData); delete payload.proposalData; }
    if (payload && payload.postPanelTo) {
      const posted = await postLinkPanel(payload.postPanelTo);
      if (posted.ok) logLater('linking', 'Link panel posted', 'Posted in <#' + payload.postPanelTo + '> by ' + who(ctx.actor) + '.');
      return posted.ok
        ? { embeds: [panelEmbed(0x3ba55d, 'Link panel posted', 'It is in <#' + payload.postPanelTo + '> now. Members press **Link account** there; their requests wait on the **Waiting list** in /user for one-click approval.'
          + (posted.saved ? '' : ' Note: the website could not be told, so the panel id lives in this bot memory only.')
          + (posted.previous ? '\n\nThe older panel in <#' + posted.previous.channelId + '> is still there.' : ''))],
          components: posted.previous ? [panelRow([panelButton('user:panel:removeold:' + settings.linkPanel.messageId, 'Remove the older panel', 2)])] : [] }
        : { embeds: [panelEmbed(0xdc4c4c, 'Could not post it there', String(posted.detail || '').slice(0, 300))] };
    }
    return payload;
  }, name === 'ping' ? 'public' : 'reply');
}

async function runButton(interaction) {
  const id = customId(interaction);
  const ctx = botCtx(interaction);
  if (id === 'ping:again') return await answerPanel(interaction, pingReply(ctx));
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
    return await answerModal(interaction, (async function () {
      const done = await unlinkPlayer(interaction.user.id, ctx.actor, 'by the player');
      return { embeds: [panelEmbed(done.gone ? 0x3ba55d : 0xfaa81a, done.gone ? 'Unlinked' : 'Nothing to unlink',
        done.gone ? 'Your link is removed.' + done.roleNote + ' Press Link account on the panel whenever you want it back.' : 'No link was on record for your account.')],
        components: [panelRow([panelButton('link:start', 'Link account', 1)])] };
    })());
  }
  /* Help is for everyone: members can read what each command does, even if they cannot run it. */
  if (id.indexOf('help:cmd:') === 0) return await answerPanel(interaction, helpDetail(id.slice('help:cmd:'.length), ctx));
  if (id === 'help:home') return await answerPanel(interaction, helpHome(ctx));
  if (!permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  if (id === 'user:config') return await answerPanel(interaction, userPanel(ctx));
  if (id === 'user:forcelink') return await answerPanel(interaction, forcelinkPicker());
  if (id === 'user:unlink') return await answerPanel(interaction, unlinkPicker(ctx));
  if (id === 'user:transfer') return await answerPanel(interaction, transferPicker(ctx));
  if (id === 'user:roster') return await answerPanel(interaction, rosterPanel(ctx, 1));
  if (id === 'user:roster:search') return await interaction.showModal(rosterSearchModal());
  if (id === 'user:whois:go') return await interaction.showModal(whoisModal());
  if (id.indexOf('user:roster:') === 0) {
    const parts = id.slice('user:roster:'.length).split(':');
    return await answerPanel(interaction, rosterPanel(ctx, Number(parts[0]), parts.slice(1).join(':')));
  }
  if (id.indexOf('user:panel:removeold:') === 0) {
    return await answerModal(interaction, (async function () {
      const removed = await removeOldPanel(id.slice('user:panel:removeold:'.length));
      if (removed.ok) logLater('linking', 'Old link panel removed', 'The older panel in <#' + removed.channelId + '> was removed by ' + who(ctx.actor) + '.');
      return { embeds: [panelEmbed(removed.ok ? 0x3ba55d : 0xfaa81a, removed.ok ? 'Older panel removed' : 'Nothing removed',
        removed.ok ? 'The older link panel in <#' + removed.channelId + '> is gone; only the new one is left.' : String(removed.detail || '').slice(0, 300))] };
    })());
  }
  if (id === 'user:pending') return await answerPanel(interaction, pendingPanel(ctx));
  if (id === 'user:panel') return await answerPanel(interaction, channelPickerForPanel());
  /* /server buttons re-ask a read-only question of the same server: "server:<question>:<id>". */
  if (id.indexOf('server:') === 0) {
    const parts = id.slice('server:'.length).split(':');
    return await answerPanel(interaction, serverSnapshot(ctx, parts[0], parts.slice(1).join(':')));
  }
  if (id.indexOf('user:unlink:ask:') === 0) {
    const tag = id.slice('user:unlink:ask:'.length);
    const link = (ctx.links() || []).filter(function (l) { return String(l.gamertag).toLowerCase() === tag.toLowerCase(); })[0];
    return await answerModal(interaction, link ? unlinkConfirm(link.gamertag, link.userId)
      : { embeds: [panelEmbed(0xfaa81a, 'Already gone', 'Nobody is linked to ' + tag + ' any more.')] });
  }
  if (id.indexOf('user:unlink:go:') === 0) {
    const tag = id.slice('user:unlink:go:'.length);
    return await answerPanel(interaction, (async function () {
      const done = await unlinkPlayer(tag, ctx.actor, '');
      return { embeds: [panelEmbed(done.gone ? 0x3ba55d : 0xfaa81a, done.gone ? 'Link removed' : 'Nothing removed',
        done.gone ? 'The link for ' + tag + ' is gone.' + done.roleNote : 'No link for ' + tag + ' was found.')],
        components: [panelRow([panelButton('user:config', 'Back to links', 2)])] };
    })());
  }
  if (id === 'kits:give') return await interaction.showModal(kitGiveModal(ctx, ''));
  if (id === 'kits:delivery') return await interaction.showModal(deliveryModal(settings.kits));
  if (id === 'kits:grab') return await answerPanel(interaction, grabKits(ctx) || grabKitsRun(ctx, ''));
  if (id === 'kits:add:code') return await interaction.showModal(kitAddModal());
  if (id.indexOf('kits:refresh:') === 0) {
    const scope = id.slice('kits:refresh:'.length);
    if (scope === 'all-users' || scope === 'all-kits') {
      logLater('emoteKits', 'Cooldowns cleared', who(ctx.actor) + ' cleared cooldowns for ' + (scope === 'all-users' ? 'every linked user' : 'every kit') + '.');
      return await answerPanel(interaction, refreshCooldowns(ctx, scope, ''));
    }
    return await interaction.showModal(kitRefreshModal(scope));
  }
  if (id.indexOf('kits:spawn:') === 0) {
    const group = id.slice('kits:spawn:'.length);
    return await interaction.showModal(kitSpawnModal(group, (settings.kits.authSpawn || {})[group] || ''));
  }
  if (id === 'setup:home') return await answerPanel(interaction, setupPanel(ctx));
  if (id === 'setup:roles') return await answerPanel(interaction, rolesPanel(ctx, 1));
  if (id === 'setup:roles:2' || id === 'setup:linked') return await answerPanel(interaction, rolesPanel(ctx, 2));
  /* Guided setup: the bot can make the staff roles and the private log channels. */
  if (id === 'setup:run') return await answerPanel(interaction, runSetupPanel(ctx));
  if (id === 'setup:run:roles') return await answerPanel(interaction, roleBuildPanel(ctx));
  if (id === 'setup:run:roles:go') {
    return await answerPanel(interaction, (async function () {
      const made = await createStaffRoles();
      log('setup: ' + made.created.length + ' staff role(s) created, ' + made.reused.length + ' reused, ' + made.failed.length + ' failed');
      if (made.created.length || made.reused.length) logLater('admin', 'Staff roles set up', who(ctx.actor) + ' ran guided setup: ' + made.created.length + ' role(s) created, ' + made.reused.length + ' reused.');
      return roleBuildResult(ctx, made);
    })());
  }
  if (id === 'setup:run:channels') return await answerPanel(interaction, logChannelBuilder());
  if (id === 'setup:channels') return await answerPanel(interaction, channelSetupPanel(ctx));
  if (id === 'setup:channels:pick') return await answerPanel(interaction, logTypeMenu(ctx));
  if (id === 'setup:channels:build') return await answerPanel(interaction, logChannelBuilder());
  if (id === 'setup:channels:build:cancel') { pendingBuild.delete(interaction.user.id); return await answerPanel(interaction, channelSetupPanel(ctx)); }
  if (id === 'setup:channels:build:go') {
    const keys = pendingBuild.get(interaction.user.id) || [];
    if (!keys.length) return await answerPanel(interaction, { embeds: [panelEmbed(0xfaa81a, 'Nothing was selected', 'Open Create channels for me again, tick the log types, then press Create.')], components: [panelRow([panelButton('setup:channels', 'Back to log channels', 2)])] });
    pendingBuild.delete(interaction.user.id);
    return await answerPanel(interaction, (async function () {
      const result = await createLogChannels(keys);
      if (result.created.length) logLater('admin', 'Log channels created', who(ctx.actor) + ' had the bot create ' + result.created.length + ' log channel(s): ' + result.created.join(', ') + '.');
      return logChannelBuilt(result.created, result.failed, result.wrote, result.reused, result.staffIds);
    })());
  }
  if (id === 'setup:status') return await answerPanel(interaction, setupStatus(ctx));
  if (id === 'setup:doctor') return await answerPanel(interaction, setupDoctor(ctx));
  if (id === 'setup:suggest') {
    const panel = setupSuggest(ctx);
    if (panel.proposalData) { pendingSuggest.set(interaction.user.id, panel.proposalData); delete panel.proposalData; }
    return await answerPanel(interaction, panel);
  }
  if (id === 'setup:suggest:apply') {
    const proposal = pendingSuggest.get(interaction.user.id);
    if (!proposal) {
      const fresh = setupSuggest(ctx);
      if (fresh.embeds && fresh.embeds[0] && fresh.proposalData) {
        fresh.embeds[0].title = 'Nothing was applied - the names were read again';
        fresh.embeds[0].description = 'The list you saw is no longer held (it expires after fifteen minutes, and a restart clears it), so the bot read the names again. Check the list below, then press Apply once more.\n\n' + fresh.embeds[0].description;
      }
      if (fresh.proposalData) { pendingSuggest.set(interaction.user.id, fresh.proposalData); delete fresh.proposalData; }
      return await answerPanel(interaction, fresh);
    }
    pendingSuggest.delete(interaction.user.id);
    return await answerPanel(interaction, (async function () {
      const applied = applyProposal(proposal);
      const wrote = await persistSettings(['staffRoles', 'logChannels']);
      logLater('admin', 'Suggested setup applied', who(ctx.actor) + ' applied ' + applied.roleLines.length + ' role slot(s) and ' + applied.channelLines.length + ' log channel(s) from /setup suggest.');
      return suggestApplied(ctx, applied.roleLines, applied.channelLines, wrote, { roleMisses: applied.roleMisses });
    })());
  }
  if (id === 'setup:import') {
    const parsed = pendingImport.get(interaction.user.id);
    return await answerPanel(interaction, parsed ? setupImportResult(parsed) : setupImportPanel());
  }
  if (id === 'setup:import:paste') return await interaction.showModal(setupImportModal());
  if (id === 'setup:import:go') {
    const parsed = pendingImport.get(interaction.user.id);
    if (!parsed || !parsed.host || !parsed.port || !parsed.password) return await answerPanel(interaction, setupImportPanel());
    pendingImport.delete(interaction.user.id);
    return await answerPanel(interaction, testAndSaveServer(ctx, { srv_name: parsed.host, srv_host: parsed.host, srv_port: parsed.port, srv_pass: parsed.password }, null));
  }
  if (id === 'setup:export') return await answerPanel(interaction, setupExport(ctx));
  if (id === 'setup:reset') return await answerPanel(interaction, setupResetPanel(ctx));
  if (id === 'setup:reset:go') return await interaction.showModal(setupResetModal());
  if (id === 'setup:roles:ids') return await interaction.showModal(rolesModal());
  if (id === 'kits:commands') return await answerPanel(interaction, kitCommandsPanel(ctx));
  if (id === 'kits:doctor') return await answerPanel(interaction, kitsDoctor(ctx));
  if (id.indexOf('setup:logtest:') === 0) {
    const typeKey = id.slice('setup:logtest:'.length);
    return await answerModal(interaction, (async function () {
      const sent = await postLog(typeKey, 'Test message', 'Sent from /setup by ' + who(ctx.actor) + '. If you can read this, this log type is working.');
      return { embeds: [panelEmbed(sent.ok ? 0x3ba55d : 0xdc4c4c, sent.ok ? 'Test message sent' : 'The test message did not arrive',
        sent.ok ? 'Check <#' + settings.logChannels[typeKey] + '>.' : String(sent.detail || sent.reason || 'unknown').slice(0, 300) + ' The bot needs View Channel, Send Messages and Embed Links there.')] };
    })());
  }
  if (id === 'setup:server') return await interaction.showModal(serverModal(null));
  if (id === 'setup:edit') return await answerPanel(interaction, serverPicker(ctx, 'edit'));
  if (id === 'setup:test') return await answerPanel(interaction, serverPicker(ctx, 'test'));
  if (id === 'setup:testall') return await answerPanel(interaction, testServers(ctx, ''));
  if (id === 'kits:add') return await interaction.showModal(bindModal(null));
  if (id === 'kits:edit') return await answerPanel(interaction, bindList(ctx, 'edit'));
  if (id === 'kits:remove') return await answerPanel(interaction, bindList(ctx, 'remove'));
  if (id === 'kits:config') return await answerPanel(interaction, kitsPanel(ctx));
  if (id === 'kits:guide') return await answerPanel(interaction, emoteGuide(ctx));
  /* The Cooldowns button shows the records; clearing is its own button inside. */
  if (id === 'kits:refresh') return await answerPanel(interaction, cooldownsPanel(ctx, cooldownList()));
  if (id === 'kits:clear') {
    logLater('emoteKits', 'Cooldowns cleared', who(ctx.actor) + ' cleared every kit cooldown.');
    return await answerPanel(interaction, refreshCooldowns(ctx, 'all-kits', ''));
  }
  if (id === 'kits:lock') {
    settings.kits.locked = !settings.kits.locked;
    persistSettings(['kits']).catch(function () {});
    logLater('emoteKits', settings.kits.locked ? 'Kit delivery paused' : 'Kit delivery resumed', who(ctx.actor) + (settings.kits.locked ? ' paused' : ' resumed') + ' kit delivery.');
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  /* "Skip" leaves the bind open to everyone; it was saved when the form was sent. */
  if (id.indexOf('kits:role:skip:') === 0) {
    setBindRole(id.slice('kits:role:skip:'.length), null);
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  log('unhandled button:', id);
  return await answerModal(interaction, { embeds: [panelEmbed(0xfaa81a, 'That button is from an older panel', 'Run the command again to get a fresh one.')] });
}

async function runSelect(interaction) {
  const id = customId(interaction);
  const ctx = botCtx(interaction);
  if (!permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  const values = (interaction.values || []).map(String);
  const first = values[0] || '';
  if (id === 'setup:logtype') return await answerPanel(interaction, channelMenu(first, ctx));
  /* the server picker shown when several servers are saved */
  if (id.indexOf('server:pick:') === 0) return await answerPanel(interaction, serverSnapshot(ctx, id.slice('server:pick:'.length), first));
  if (id === 'kits:grab:pick') return await answerPanel(interaction, grabKitsRun(ctx, first));
  if (id === 'setup:channels:build:pick') {
    const keys = (interaction.values || []).filter(function (k) { return LOG_TYPES.some(function (t) { return t[0] === k; }); }).slice(0, 10);
    pendingBuild.set(interaction.user.id, keys);
    return await answerPanel(interaction, logChannelPlan(keys, ctx));
  }
  if (id.indexOf('setup:channel:') === 0) {
    const typeKey = id.slice('setup:channel:'.length);
    const found = LOG_TYPES.filter(function (p) { return p[0] === typeKey; })[0];
    const label = found ? found[1] : typeKey;
    return await answerPanel(interaction, (async function () {
      /* An empty pick clears the channel, which switches that log off. It is saved as null,
         not deleted: the website merges saves into what it holds, so a deleted key would
         quietly come back after a restart. */
      settings.logChannels[typeKey] = first || null;
      const wrote = await persistSettings(['logChannels']);
      logLater('admin', 'Log channel ' + (first ? 'set' : 'cleared'), label + (first ? ' now goes to <#' + first + '>' : ' is switched off') + ', changed by ' + who(ctx.actor) + '.');
      const panel = channelMenu(typeKey, ctx);
      panel.embeds.unshift(panelEmbed(wrote.ok ? 0x3ba55d : 0xfaa81a, first ? 'Log channel set' : 'Log switched off',
        label + (first ? ' goes to <#' + first + '>.' : ' is off.') + (wrote.ok ? '' : ' Kept in this bot memory only: ' + wrote.detail)));
      return panel;
    })());
  }
  if (id.indexOf('setup:role:') === 0) {
    const slot = id.slice('setup:role:'.length);
    const known = ROLE_SLOTS.filter(function (s) { return s[0] === slot; })[0];
    if (!known) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'Unknown role slot', 'Open /setup run again.')] });
    return await answerPanel(interaction, (async function () {
      /* null, not delete, so the website's merge really clears it (see the log channels). */
      settings.staffRoles[slot] = first || null;
      const wrote = await persistSettings(['staffRoles']);
      logLater('admin', 'Role ' + (first ? 'set' : 'cleared'), known[1] + (first ? ' is now <@&' + first + '>' : ' has no role now') + ', changed by ' + who(ctx.actor) + '.');
      const panel = rolesPanel(ctx, ROLE_SLOTS.indexOf(known) >= 4 ? 2 : 1);
      if (!wrote.ok) panel.embeds.unshift(panelEmbed(0xfaa81a, 'Saved in this bot only', 'The website did not take the change: ' + wrote.detail));
      return panel;
    })());
  }
  if (id === 'setup:pick') {
    const server = settings.servers.filter(function (s) { return s.id === first; })[0];
    if (!server) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That server is gone', 'Save it again from the setup panel.')] });
    return await interaction.showModal(serverModal(server));
  }
  if (id === 'setup:pick:test') return await answerPanel(interaction, testServers(ctx, first));
  if (id === 'kits:pickbind:edit') {
    const bind = settings.kits.binds.filter(function (b) { return b.emote === first; })[0];
    if (!bind) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That bind is gone', 'Open the panel again.')] });
    return await interaction.showModal(bindModal(bind));
  }
  if (id === 'kits:pickbind:remove') {
    const gone = removeBind(first);
    if (gone) logLater('emoteKits', 'Bind removed', 'The `' + first + '` bind was removed by ' + who(ctx.actor) + '.');
    return await answerPanel(interaction, {
      embeds: [panelEmbed(gone ? 0x3ba55d : 0xfaa81a, gone ? 'Bind removed' : 'Nothing removed', gone ? 'The ' + first + ' bind is gone.' : 'No bind named ' + first + ' was found.')],
      components: [panelRow([panelButton('kits:config', 'Back to the panel', 2)])],
    });
  }
  /* The role picked for a bind used to go through saveBind, which needs the kit names and
     so threw the role away. It now updates the bind itself. */
  if (id.indexOf('kits:role:') === 0) {
    const emote = id.slice('kits:role:'.length);
    const bind = setBindRole(emote, first || null);
    if (bind) logLater('emoteKits', 'Bind role set', 'The `' + bind.emote + '` bind is ' + (first ? 'for <@&' + first + '> only' : 'open to everyone') + ', set by ' + who(ctx.actor) + '.');
    return await answerPanel(interaction, kitsPanel(ctx));
  }
  if (id === 'user:forcelink:user') return await interaction.showModal(forcelinkModal(first));
  if (id === 'user:unlink:pick') {
    const found = findLinkByGamertag(first);
    if (!found) return await answerModal(interaction, { embeds: [panelEmbed(0xdc4c4c, 'That link is gone', 'Open the list again.')] });
    return await answerPanel(interaction, unlinkConfirm(found.gamertag, found.userId));
  }
  if (id === 'user:transfer:pick') return await interaction.showModal(transferModal(first));
  if (id === 'user:pending:approve' || id === 'user:pending:reject') {
    const request = settings.pending.filter(function (p) { return p.userId === first; })[0];
    return await answerPanel(interaction, (async function () {
      if (!request) return pendingPanel(ctx, panelEmbed(0xfaa81a, 'Already handled', 'That request is no longer waiting.'));
      if (id === 'user:pending:reject') {
        settings.pending = settings.pending.filter(function (p) { return p.userId !== first; });
        persistSettings(['pending']).catch(function () {});
        logLater('linking', 'Link request rejected', '<@' + request.userId + '> asked for `' + request.gamertag + '`; rejected by ' + who(ctx.actor) + '.');
        const toldNo = await tellPlayer(request.userId, 'Your request to link the gamertag ' + request.gamertag + ' in ' + guildName() + ' was not approved. If that was a mistake, ask the staff there, or send a new request from the link panel.', false);
        return pendingPanel(ctx, panelEmbed(0xfaa81a, 'Request rejected', '<@' + request.userId + '> is not linked to ' + request.gamertag + '.' +
          (toldNo ? ' They were told by direct message.' : ' Their direct messages are closed, so they were not told.')));
      }
      const taken = findLinkByGamertag(request.gamertag);
      if (taken && taken.userId !== request.userId) {
        return pendingPanel(ctx, panelEmbed(0xdc4c4c, 'That gamertag is taken', request.gamertag + ' is already linked to <@' + taken.userId + '>. Reject this request, or move the link with Transfer.'));
      }
      const done = await linkPlayer(request.userId, request.gamertag, ctx.actor);
      const toldYes = done.ok ? await tellPlayer(done.userId, 'Your gamertag ' + done.gamertag + ' is now linked to your Discord account in ' + guildName() + '.', true) : false;
      return pendingPanel(ctx, panelEmbed(0x3ba55d, 'Approved', '<@' + done.userId + '> is now linked to ' + done.gamertag + '.' + (done.roleNote || '') +
        (toldYes ? ' They were told by direct message.' : ' Their direct messages are closed, so they were not told.')));
    })());
  }
  if (id === 'user:panel:channel') {
    return await answerPanel(interaction, (async function () {
      const posted = await postLinkPanel(first);
      if (posted.ok) logLater('linking', 'Link panel posted', 'Posted in <#' + first + '> by ' + who(ctx.actor) + '.');
      return posted.ok
        ? { embeds: [panelEmbed(0x3ba55d, 'Link panel posted', 'It is in <#' + first + '> now. Members press **Link account** there.'
          + (posted.saved ? '' : ' The website could not be told, so the panel id is in this bot memory only.')
          + (posted.previous ? '\n\nThe older panel in <#' + posted.previous.channelId + '> is still there.' : ''))],
          components: [panelRow([panelButton('user:config', 'Back to links', 2)].concat(posted.previous
            ? [panelButton('user:panel:removeold:' + settings.linkPanel.messageId, 'Remove the older panel', 2)] : []))] }
        : { embeds: [panelEmbed(0xdc4c4c, 'Could not post it there', String(posted.detail || '').slice(0, 300))] };
    })());
  }
  if (id === 'kits:give:pick') {
    rememberPendingGive(interaction.user.id, first);
    return await interaction.showModal(kitGiveModal(ctx, first));
  }
  log('unhandled select:', id);
  return await answerModal(interaction, { embeds: [panelEmbed(0xfaa81a, 'That menu is from an older panel', 'Run the command again to get a fresh one.')] });
}

async function runModal(interaction) {
  const id = customId(interaction);
  const fields = modalFields(interaction);
  const ctx = botCtx(interaction);
  /* A member linking themselves is not a staff action. */
  if (id === 'modal:link:self') {
    const answer = requestLink(interaction.user.id, fields.link_gamertag);
    if (answer.ok) logLater('linking', 'Link requested', '<@' + interaction.user.id + '> asked to be linked to `' + answer.gamertag + '`. It waits on the Waiting list in /user.');
    return await answerModal(interaction, answer.ok
      ? { embeds: [panelEmbed(0x3ba55d, 'Request recorded', 'You asked to link ' + answer.gamertag + '. It is waiting for staff to confirm it - they see it on the Waiting list in /user.\n\n'
          + 'The bot will not treat an unconfirmed request as proof, so nothing player-facing uses it yet.')],
        components: [panelRow([panelButton('link:unlink', 'Unlink instead', 2)])] }
      : { embeds: [panelEmbed(0xfaa81a, 'Not linked', String(answer.detail || (answer.reason === 'empty' ? 'Type your gamertag exactly as it appears in game.' : '')).slice(0, 400))],
        components: [panelRow([panelButton('link:start', 'Try another gamertag', 1)])] });
  }
  if (!permitted(interaction, ctx)) return await answerModal(interaction, { embeds: [permissionNote(ctx)] });
  if (id === 'modal:roles' || id === 'modal:linked') {
    return await answerModal(interaction, (async function () {
      let saved = 0;
      let skipped = 0;
      ROLE_SLOTS.forEach(function (slot) {
        const key = 'role_' + slot[0];
        if (!(key in fields)) return;
        const value = String(fields[key] || '').replace(/[<@&>]/g, '').trim();
        if (!value) { settings.staffRoles[slot[0]] = null; return; }
        if (/^[0-9]{5,25}$/.test(value)) { settings.staffRoles[slot[0]] = value; saved += 1; }
        else skipped += 1;
      });
      const wrote = await persistSettings(['staffRoles']);
      logLater('admin', 'Roles saved', saved + ' role id(s) saved by ' + who(ctx.actor) + '.');
      return {
        embeds: [panelEmbed(wrote.ok ? 0x3ba55d : 0xfaa81a, 'Roles saved',
          saved + ' role id(s) stored' + (skipped ? ', ' + skipped + ' value(s) skipped because they were not role ids' : '') + '.' +
          (wrote.ok ? '' : ' Kept in this bot memory only: ' + wrote.detail))],
        components: [panelRow([panelButton('setup:roles', 'Pick roles from a menu', 2), panelButton('setup:channels', 'Next: logging channels', 1)])],
      };
    })());
  }
  if (id === 'modal:server' || id.indexOf('modal:server:') === 0) {
    const existingId = id.indexOf('modal:server:') === 0 ? id.slice('modal:server:'.length) : null;
    return await answerModal(interaction, (async function () {
      const payload = await testAndSaveServer(ctx, fields, existingId);
      const ok = payload && payload.embeds && payload.embeds[0] && payload.embeds[0].color === 0x3ba55d;
      if (ok) logLater('admin', existingId ? 'Rust server updated' : 'Rust server linked', who(ctx.actor) + ' ' + (existingId ? 'updated' : 'linked') + ' **' + String(fields.srv_name || fields.srv_host || 'a server').slice(0, 60) + '** (tested before saving).');
      return payload;
    })());
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
    logLater('emoteKits', 'Bind saved', 'The `' + entry.emote + '` bind gives ' + entry.kits.map(function (k) { return '`' + k + '`'; }).join(', ') +
      (entry.cooldown ? ' every ' + entry.cooldown + ' s' : '') + ', saved by ' + who(ctx.actor) + '.');
    return await answerModal(interaction, bindRoleMenu(entry.emote));
  }
  if (id.indexOf('modal:forcelink:') === 0) {
    const userId = id.slice('modal:forcelink:'.length);
    return await answerModal(interaction, forceLinkNow(ctx, userId, normaliseGamertag(fields.link_gamertag)));
  }
  if (id.indexOf('modal:transfer:') === 0) {
    const gamertag = id.slice('modal:transfer:'.length);
    const current = findLinkByGamertag(gamertag);
    /* Both boxes may be left blank on purpose ("keep it"), so the current account fills in. */
    const toUser = String(fields.move_user || '').replace(/[^0-9]/g, '') || (current ? current.userId : '');
    return await answerModal(interaction, (async function () {
      const moved = await moveLinkFull(gamertag, toUser, fields.move_gamertag, ctx.actor);
      return moved.ok
        ? { embeds: [panelEmbed(0x3ba55d, 'Link moved', gamertag + ' now belongs to <@' + moved.userId + '>'
            + (moved.gamertag.toLowerCase() !== gamertag.toLowerCase() ? ', under the gamertag ' + moved.gamertag : '') + '.' + (moved.roleNote || ''))],
          components: [panelRow([panelButton('user:config', 'Back to links', 2)])] }
        : { embeds: [panelEmbed(0xdc4c4c, 'Not moved', String(moved.detail || '').slice(0, 400))],
          components: [panelRow([panelButton('user:transfer', 'Try again', 1), panelButton('user:config', 'Cancel', 2)])] };
    })());
  }
  if (id === 'modal:kitgive') {
    const remembered = takePendingGive(interaction.user.id);
    return await answerModal(interaction, (async function () {
      const payload = await giveKit(ctx, { kit: fields.give_kit, gamertag: fields.give_target || remembered, server: fields.give_server || '' });
      if (payload && payload.embeds && payload.embeds[0] && payload.embeds[0].title === 'Sent') {
        logLater('emoteKits', 'Kit given', payload.embeds[0].description.split('\n')[0] + ' Given by ' + who(ctx.actor) + '.');
      }
      return payload;
    })());
  }
  if (id.indexOf('modal:refresh:') === 0) {
    const scope = id.slice('modal:refresh:'.length);
    logLater('emoteKits', 'Cooldowns cleared', who(ctx.actor) + ' cleared cooldowns for ' + scope + ' ' + String(fields.refresh_target || '').slice(0, 60) + '.');
    return await answerModal(interaction, refreshCooldowns(ctx, scope, fields.refresh_target));
  }
  if (id.indexOf('modal:spawn:') === 0) {
    const group = id.slice('modal:spawn:'.length);
    logLater('emoteKits', 'Respawn kit ' + (fields.spawn_kit ? 'set' : 'cleared'), group + (fields.spawn_kit ? ' gets `' + String(fields.spawn_kit).slice(0, 60) + '`' : ' gets no kit') + ' on respawn, set by ' + who(ctx.actor) + '.');
    return await answerModal(interaction, authSpawnNote(ctx, group, fields.spawn_kit));
  }
  if (id === 'modal:kitdelivery') return await answerModal(interaction, saveDelivery(ctx, fields));
  if (id === 'modal:whois') return await answerModal(interaction, whoisReply(ctx, fields.whois_tag));
  if (id === 'modal:rostersearch') return await answerModal(interaction, rosterPanel(ctx, 1, fields.roster_search));
  if (id === 'modal:import') {
    const parsed = parseServerText(fields.import_text);
    pendingImport.set(interaction.user.id, parsed);
    return await answerModal(interaction, setupImportResult(parsed));
  }
  if (id === 'modal:reset') {
    const word = String(fields.reset_word || '').trim().toUpperCase();
    if (word !== 'RESET') {
      return await answerModal(interaction, { embeds: [panelEmbed(0xfaa81a, 'Not reset', 'That word did not match, so nothing was cleared.')],
        components: [panelRow([panelButton('setup:reset', 'Try again', 1), panelButton('setup:status', 'Status', 2)])] });
    }
    return await answerModal(interaction, (async function () {
      const cleared = clearAllSettings();
      const wrote = await persistSettings(['staffRoles', 'logChannels', 'servers', 'kits', 'installs']);
      logLater('admin', 'Settings reset', who(ctx.actor) + ' reset the saved settings (' + cleared + ' entries). Player links were kept.');
      return setupResetDone(ctx, cleared, wrote);
    })());
  }
  if (id === 'modal:kitcode') {
    const payload = installKit(ctx, fields.install_code);
    if (payload && payload.embeds && payload.embeds[0] && payload.embeds[0].title === 'Code preview saved - not installed') {
      logLater('emoteKits', 'Kit code preview saved', who(ctx.actor) + ' saved preview metadata for a kit code (' + String(fields.install_code || '').length + ' characters). The original code is not retained.');
    }
    return await answerModal(interaction, payload);
  }
  log('unhandled modal:', id);
  return await answerModal(interaction, { embeds: [panelEmbed(0xfaa81a, 'That form is from an older panel', 'Run the command again to get a fresh one.')] });
}

/* ---------------------------------------------------------------- gateway -- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

/* The bot's status line in the member list: what it is looking after, refreshed every few
   minutes, so a glance at the sidebar says whether it is healthy. Custom status (type 4). */
function presenceText() {
  const servers = (settings.servers || []).length;
  const links = (settings.links || []).length;
  const down = (settings.servers || []).some(function (s) { return serverChecks[s.id] && !serverChecks[s.id].ok; });
  if (!servers) return 'Not set up yet - run /setup';
  return (down ? '\ud83d\udfe1 ' : '\ud83d\udfe2 ') + servers + (servers === 1 ? ' server' : ' servers') + ' | ' + links + ' linked | /help';
}
function updatePresence() {
  try {
    if (!client.user) return;
    client.user.setPresence({ status: 'online', activities: [{ name: 'Custom Status', state: presenceText().slice(0, 128), type: 4 }] });
  } catch (error) {
    log('presence failed:', String((error && error.message) || error));
  }
}

client.once(Events.ClientReady, async (c) => {
  state.gateway = 'online';
  state.tag = c.user.tag;
  state.guilds = c.guilds.cache.size;
  log('logged in as ' + c.user.tag + ' — in ' + c.guilds.cache.size + ' guild(s)');
  try {
    updatePresence();
    setInterval(updatePresence, 5 * 60 * 1000).unref();
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
    readSettingsFile();
    await loadSettings();
    updatePresence();
    /* Changes made on the website's Settings page reach the bot within two minutes, without a
       restart. A re-read is skipped right after this bot saved something, so an answer that is
       still on its way to the website is never read back over. */
    if (!settingsTimer) {
      settingsTimer = setInterval(function () {
        if (Date.now() - lastPersistAt > Math.min(15000, RELOAD_MS / 2)) loadSettings(true).catch(function () {});
      }, RELOAD_MS);
      if (settingsTimer.unref) settingsTimer.unref();
    }
    /* set() replaces the whole list, so a command removed from the module really does
       disappear from the picker instead of lingering forever. */
    /* Deliberately no default_member_permissions here. The roles saved in step 1 are the
       staff roles, so hiding the staff commands from members would hide them from exactly the
       people this server appointed. The bot checks roles (plus Administrator and the owner)
       on every use, and staff who want the commands invisible to members can say so per role
       in Discord's own Integrations screen, which does not change what the bot enforces. */
    const applied = await guild.commands.set(COMMANDS.map((cmd) => Object.assign({}, cmd, { dm_permission: false })));
    state.commandNames = applied.map((cmd) => cmd.name);
    /* The collection discord.js returns is keyed by command id, not by name. */
    const setupCmd = applied.find((cmd) => cmd.name === 'setup');
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
/* How long a silent server is given (RCON_TIMEOUT_MS, 2 to 15 seconds, default 8). The
   simulator shortens it so its never-answering test server does not dominate the run. */
const RCON_TIMEOUT_MS = Math.min(15000, Math.max(2000, Number(process.env.RCON_TIMEOUT_MS) || 8000));
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

/* Where RCON may go: public unicast internet addresses only (bot/network-guard.mjs, with its
   own self-test). A name is resolved here, with a deadline; every address it resolves to must
   be public, and the connection goes to the exact address checked, so a name that points at
   something private (or changes between check and connect) cannot reach anything internal. */
const RCON_DNS_TIMEOUT_MS = 3500;
function rconHostAllowed(host) { return hostAllowedByGuard(host); }
async function rconResolve(host) {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (net.isIP(h)) return isPublicAddress(h) ? h : null;
  const records = await Promise.race([
    lookup(h, { all: true }).catch(function () { return null; }),
    new Promise(function (r) { setTimeout(function () { r(null); }, RCON_DNS_TIMEOUT_MS).unref(); }),
  ]);
  if (!Array.isArray(records) || !records.length || records.some(function (r) { return !isPublicAddress(r.address); })) return null;
  return records[0].address;
}

/* At most three RCON connections at once and twenty waiting: a burst of presses (or a
   misbehaving server that never answers) cannot open sockets without limit. */
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
        if (next) { clearTimeout(next.timer); next.grant(); }
      });
    }
    if (rconActive < RCON_MAX_ACTIVE) return grant();
    if (rconWaiting.length >= RCON_MAX_QUEUED) return reject(new Error('The RCON queue is full. Try again in a few seconds.'));
    const entry = { grant: grant, timer: setTimeout(function () {
      const at = rconWaiting.indexOf(entry);
      if (at > -1) rconWaiting.splice(at, 1);
      reject(new Error('The RCON queue is busy. Try again shortly.'));
    }, RCON_QUEUE_WAIT_MS) };
    rconWaiting.push(entry);
  });
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

/* What counts as a usable RCON address.

   People paste this in every shape there is: 1.2.3.4:28015, [2606:4700::1]:28015, a
   hostname, the same address the game client shows, or the port left in the box beside it.
   All of those are read here, so the bot does not refuse an address that is perfectly fine
   with a message about the public internet that has nothing to do with what was typed.
   What is still refused is what this service genuinely cannot reach from a cloud host -
   loopback, a private network, carrier-grade NAT, link-local and multicast - and each case
   gets its own reason, so the panel can name the real problem instead of guessing. */
function parseRconTarget(hostInput, portInput) {
  let host = String(hostInput == null ? '' : hostInput).trim();
  let portText = String(portInput == null ? '' : portInput).trim();
  host = host.replace(/^[<"']+/, '').replace(/[>"']+$/, '').trim();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').trim();
  host = host.split('/')[0].split('?')[0].trim();
  if (!host) return { ok: false, reason: 'no-host', detail: 'No server address was given.' };
  if (host.length > 200) return { ok: false, reason: 'bad-host', detail: 'That address is far too long to be a server address.' };

  let v6 = null;
  const bracketed = host.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/);
  if (bracketed) {
    v6 = bracketed[1];
    if (bracketed[2] && !portText) portText = bracketed[2];
  } else if ((host.match(/:/g) || []).length > 1) {
    v6 = host;
  } else if (host.indexOf(':') > -1) {
    const cut = host.lastIndexOf(':');
    const tail = host.slice(cut + 1);
    if (/^\d{1,5}$/.test(tail)) { if (!portText) portText = tail; host = host.slice(0, cut).trim(); }
    else return { ok: false, reason: 'bad-host', detail: 'There is a colon in that address but the part after it is not a port number.' };
  }
  if (!host && !v6) return { ok: false, reason: 'no-host', detail: 'No server address was given.' };

  if (!portText) return { ok: false, reason: 'no-port', detail: 'No RCON port was given. It is rcon.port in server.cfg, not the game or query port.' };
  if (!/^\d{1,5}$/.test(portText)) return { ok: false, reason: 'refused-port', detail: 'A port is a number, and ' + portText.slice(0, 20) + ' is not one.' };
  const port = Number(portText);
  if (!(port >= 1 && port <= 65535)) return { ok: false, reason: 'refused-port', detail: 'Port ' + port + ' cannot exist: a port is between 1 and 65535.' };

  if (v6) {
    const v = v6.toLowerCase().replace(/^\[|\]$/g, '');
    if (v === '::1' || v === '::') return { ok: false, reason: 'refused-local', detail: 'That is this machine own address, not your server.' };
    if (v.indexOf('fe80') === 0) return { ok: false, reason: 'refused-private', detail: 'That is a link-local address, which only exists inside one network.' };
    if (v.indexOf('ff') === 0) return { ok: false, reason: 'refused-private', detail: 'That is a multicast address, which is not a server.' };
    if (v.charAt(0) === 'f' && (v.charAt(1) === 'c' || v.charAt(1) === 'd')) return { ok: false, reason: 'refused-private', detail: 'That is a private IPv6 address, which the bot cannot reach from a cloud host. Use the public address or the hostname from server.cfg.' };
    return { ok: true, host: v, port: port, display: '[' + v + ']:' + port, family: 6 };
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some(function (n) { return !(n >= 0 && n <= 255); })) return { ok: false, reason: 'bad-host', detail: 'That is not a valid IPv4 address.' };
    const a = parts[0], b = parts[1];
    if (a === 127) return { ok: false, reason: 'refused-local', detail: '127.0.0.1 is this machine own address, not your server.' };
    if (a === 0) return { ok: false, reason: 'bad-host', detail: '0.x.x.x is not a real address.' };
    if (a >= 224) return { ok: false, reason: 'refused-private', detail: 'That is a multicast or reserved address, which is not a server.' };
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return { ok: false, reason: 'refused-private', detail: 'That is a local network address (' + host + '), which only exists inside your own network. Use the public IP or the hostname from server.cfg: the bot runs on a cloud host and has to reach the server over the internet.' };
    }
    if (a === 169 && b === 254) return { ok: false, reason: 'refused-private', detail: 'That is a link-local address, which only exists inside one network.' };
    if (a === 100 && b >= 64 && b <= 127) {
      return { ok: false, reason: 'refused-private', detail: 'That is inside your provider carrier-grade NAT range, which the internet cannot route to. Use the public address or a hostname.' };
    }
    return { ok: true, host: host, port: port, display: host + ':' + port, family: 4 };
  }

  const name = host.toLowerCase();
  if (name === 'localhost' || /\.localhost$/.test(name) || /\.local$/.test(name) || /\.internal$/.test(name) || /\.lan$/.test(name) || /\.home\.arpa$/.test(name)) {
    return { ok: false, reason: 'refused-local', detail: 'That name only resolves inside one network, so the bot cannot reach it.' };
  }
  if (!/^[a-z0-9_]([a-z0-9._-]*[a-z0-9_])?$/.test(name)) {
    return { ok: false, reason: 'bad-host', detail: 'That does not look like a hostname or an IP address. Use the address exactly as server.cfg has it, for example 51.38.1.2 or eu01.example.net.' };
  }
  return { ok: true, host: host, port: port, display: host + ':' + port, family: 0 };
}

async function rconRun(options) {
  let release;
  try { release = await acquireRconSlot(); } catch (error) {
    return { ok: false, reason: 'busy', detail: String((error && error.message) || error) };
  }
  try {
    /* Read the address the way it was typed (port on the end, brackets, a scheme), refuse
       what cannot be reached with its own reason, then let the network guard vet what is
       left - including every address a hostname resolves to. */
    const shape = parseRconTarget(options.host, options.port);
    if (!shape.ok) return { ok: false, reason: shape.reason, detail: shape.detail };
    options = Object.assign({}, options, { host: shape.host, port: shape.port });
    const target = rconHostAllowed(options.host) ? await rconResolve(options.host) : null;
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
    const host = String(options.host || '').trim();
    const port = Number(options.port);
    const password = String(options.password || '');
    const asked = String(options.command || 'serverinfo').toLowerCase();
    /* The fixed list is what the automatic health check may ask for. When an administrator
       asks for a command they configured themselves - a kit plugin command, for instance -
       it is passed through as a single line with a hard length cap. */
    /* Kept exactly as typed: kit names and gamertags can be case-sensitive on the server.
       Only the fixed health-check list is compared in lower case. */
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
      if (settled) return;
      if (buffer.length + chunk.length > RCON_MAX_BUFFER_BYTES) {
        return finish({ ok: false, reason: 'response-too-large', detail: 'The server response exceeded the bot safety limit.' });
      }
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = rconParse(buffer);
      buffer = parsed.rest;
      if (parsed.error) return finish({ ok: false, reason: 'invalid-response', detail: 'The server sent a malformed RCON packet.' });
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
          answer = (answer + packet.body).slice(0, 4000);
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
  const healthPaths = ['/health', '/healthz', '/api/health'];
  /* Railway's health check: alive or not, and nothing else. */
  if (req.method === 'GET' && healthPaths.indexOf(url) !== -1) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'spinback-rce-bot' }));
    return;
  }
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
    let tooBig = false;
    req.on('data', function (chunk) {
      if (tooBig) return;
      raw += chunk;
      if (raw.length > 4096) tooBig = true;
    });
    req.on('end', async function () {
      if (tooBig) {
        res.writeHead(413, cors);
        res.end(JSON.stringify({ ok: false, reason: 'payload-too-large' }));
        return;
      }
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (error) {
        res.writeHead(400, cors);
        res.end(JSON.stringify({ ok: false, reason: 'invalid-json' }));
        return;
      }
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
    const cors = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    req.resume();
    if (!TOKEN) { res.writeHead(503, cors); res.end(JSON.stringify({ ok: false, reason: 'no-token' })); return; }
    if (state.gateway === 'online') { res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, already: 'online', gateway: state.gateway })); return; }
    await relogin('asked by a request');
    res.writeHead(200, cors);
    res.end(JSON.stringify({ ok: true, gateway: state.gateway, forcedLogins: forcedLogins }));
    return;
  }
  if (req.method === 'POST' && url === '/api/oauth/exchange') {
    if (requireSettingsAuth(req, res)) return;
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      body += chunk;
      if (body.length > 16384) tooBig = true;
    });
    req.on('end', async () => {
      const cors = Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS);
      if (tooBig) {
        res.writeHead(413, cors);
        res.end(JSON.stringify({ ok: false, error: 'payload_too_large' }));
        return;
      }
      if (!CLIENT_SECRET) {
        res.writeHead(503, cors);
        res.end(JSON.stringify({ ok: false, error: 'no_client_secret', message: 'this service has no DISCORD_CLIENT_SECRET set' }));
        return;
      }
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (e) {
        res.writeHead(400, cors);
        res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
        return;
      }
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
    /* Public status: what the status page shows, and nothing about tokens, owners, ports or
       internal errors. The website's server side, proving itself with BOT_SETTINGS_TOKEN,
       gets the full diagnostics below as well. */
    const publicStatus = {
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
      oauthExchange: !!CLIENT_SECRET,
      storage: storeKind(),
      shuttingDown: shuttingDown || undefined,
      /* The bot's picture and whether its first Rust server answers, for the website's bot
         card. The server's address is not public: it is in the full diagnostics below. */
      avatar: botAvatarUrl(),
      rcon: (function () {
        const first = (settings.servers || [])[0];
        const check = first ? serverChecks[first.id] : null;
        return first ? { connected: !!(check && check.ok), serverName: first.name, checkedAt: check ? check.at : null, reason: check && !check.ok ? check.reason : (check ? null : 'not-checked-yet') } : null;
      })(),
      uptimeSeconds: Math.round((Date.now() - state.since) / 1000),
      stats: { guilds: state.guilds, gateway: state.gateway },
    };
    if (!settingsAuthOk(req)) { res.end(JSON.stringify(publicStatus)); return; }
    res.end(JSON.stringify(Object.assign(publicStatus, {
      port: PORT,
      host: HOST,
      tokenPresent: !!TOKEN,
      tokenSource: TOKEN_INFO.source,
      clientIdPresent: !!CLIENT_ID,
      tokenShape: tokenShape,
      tokenLength: TOKEN.length,
      loginAttempts: loginAttempts,
      lookedFor: TOKEN_NAMES,
      siteUrl: SITE_URL,
      storageFileOk: fileState.ok,
      rconTargets: (settings.servers || []).map(function (sv) { return { id: sv.id, name: sv.name, host: sv.host, port: sv.port, check: serverChecks[sv.id] || null }; }),
      interactions: !!PUBLIC_KEY,
      guildConfigured: !!GUILD_ID && !!(OWNER_ID || (state.guildInfo && state.guildInfo.ownerId)),
      ownerKnown: !!(OWNER_ID || (state.guildInfo && state.guildInfo.ownerId)),
      ownerSource: OWNER_ID ? 'DISCORD_GUILD_OWNER_ID' : (state.guildInfo && state.guildInfo.ownerId ? 'the guild owner record' : null),
      forcedLogins: forcedLogins,
      gatewayDownSeconds: gatewayDownSince ? Math.round((Date.now() - gatewayDownSince) / 1000) : 0,
      error: state.error,
      guildInfo: state.guildInfo || null,
    })));
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

/* Railway sends SIGTERM before it swaps in a new deploy. Presses already running get up to
   eight seconds to finish, the settings file is written one last time, then the bot leaves. */
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down (' + sig + '), ' + activeInteractions + ' interaction(s) still running');
  const until = Date.now() + 8000;
  while (activeInteractions > 0 && Date.now() < until) await new Promise(function (r) { setTimeout(r, 100); });
  writeSettingsFileNow();
  await Promise.resolve(client.destroy()).catch(function () {});
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { shutdown(sig); });
}