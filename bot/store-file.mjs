/* ==========================================================================
   Spinback RCE - a file home for the settings the bot keeps.
   --------------------------------------------------------------------------
   The bot mirrors its settings to the website when BOT_SETTINGS_TOKEN is set.
   That is the only durable home it has today: without the token a save lives in
   memory and is lost on the next restart. This module adds a second home that
   needs no token and no database - a JSON file on disk - so attaching a Railway
   volume is enough to make saves survive a redeploy.

   It deliberately exports the same surface as store-postgres.mjs, so either can
   be used without the caller learning a second vocabulary:

     dataDir()            where the file would live, and why that path
     describe()           the same, plus exists / writable / mounted
     configured()         true when the directory exists and can be written to
     payloadOf(settings)  the exact object the website endpoint receives
     saveSettings()       atomic write, plus one append-only history entry
     loadSettings()       the stored object, or null - never an empty guess
     revisions(limit)     recent saves, newest first
     close()              nothing to close for a file; present for parity

   Server passwords are part of the payload and are therefore in this file, in
   plain text, exactly as they already are in the website's copy and in
   store-postgres.mjs. The file is created mode 0600 and nothing here logs it.

   The path is chosen in this order, so a volume needs no variable at all when
   it is mounted where the image already writes:
     SETTINGS_DIR, DATA_DIR, /app/data, /data, <cwd>/data
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE_NAME = 'settings.json';
const HISTORY_NAME = 'settings.history.jsonl';
const HISTORY_KEEP = 25;

function candidateDirs() {
  const rows = [];
  const fromSettingsDir = String(process.env.SETTINGS_DIR || '').trim();
  const fromDataDir = String(process.env.DATA_DIR || '').trim();
  if (fromSettingsDir) rows.push({ dir: fromSettingsDir, source: 'SETTINGS_DIR' });
  if (fromDataDir) rows.push({ dir: fromDataDir, source: 'DATA_DIR' });
  rows.push({ dir: '/app/data', source: 'the folder the image creates (/app/data)' });
  rows.push({ dir: '/data', source: 'the container mount (/data)' });
  rows.push({ dir: path.join(process.cwd(), 'data'), source: 'the working directory' });
  return rows;
}

/* An explicitly configured directory wins even before it exists: that is what
   makes a first deploy onto a fresh volume work. Otherwise the first candidate
   that is already there, and finally the working directory. */
export function dataDir() {
  const rows = candidateDirs();
  for (const row of rows) {
    if (row.source === 'SETTINGS_DIR' || row.source === 'DATA_DIR') return row.dir;
  }
  for (const row of rows) {
    try { if (fs.existsSync(row.dir)) return row.dir; } catch (error) { /* keep looking */ }
  }
  return rows[rows.length - 1].dir;
}

export function dirSource() {
  const chosen = dataDir();
  const row = candidateDirs().find(function (x) { return x.dir === chosen; });
  return row ? row.source : 'a path chosen by this module';
}

export function settingsFile() { return path.join(dataDir(), FILE_NAME); }

function canWrite(dir) {
  try {
    if (fs.existsSync(dir)) fs.accessSync(dir, fs.constants.W_OK);
    else fs.accessSync(path.dirname(dir), fs.constants.W_OK);
    return true;
  } catch (error) { return false; }
}

/* A different device from / means a mount: the one cheap test that tells a real
   volume apart from a folder inside the image, which is wiped on every deploy. */
function looksMounted(dir) {
  try { return fs.statSync(dir).dev !== fs.statSync('/').dev; } catch (error) { return false; }
}

export function describe() {
  const dir = dataDir();
  const exists = fs.existsSync(dir);
  return {
    dir: dir,
    source: dirSource(),
    file: settingsFile(),
    exists: exists,
    writable: canWrite(dir),
    mounted: exists ? looksMounted(dir) : false,
  };
}

export function configured() { return canWrite(dataDir()); }

/* The same shape the website endpoint stores and returns. */
export function payloadOf(settings) {
  return {
    staffRoles: settings.staffRoles || {},
    logChannels: settings.logChannels || {},
    servers: settings.servers || [],
    kits: settings.kits || {},
    links: settings.links || [],
    pending: settings.pending || [],
    linkPanel: settings.linkPanel || null,
  };
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      /* Never delete the evidence. Move a file that does not parse aside, so a
         half-written file cannot stop the bot from booting. */
      const aside = file + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      try { fs.renameSync(file, aside); console.log('file store: settings did not parse, moved to ' + aside); }
      catch (moved) { /* best effort */ }
      return null;
    }
    throw error;
  }
}

function appendHistory(dir, entry) {
  const file = path.join(dir, HISTORY_NAME);
  try {
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length > HISTORY_KEEP * 2) fs.writeFileSync(file, lines.slice(-HISTORY_KEEP).join('\n') + '\n', { mode: 0o600 });
  } catch (error) { /* history is a convenience, never a reason to fail a save */ }
}

/* Atomic on purpose: a container killed mid-save must leave either the old file
   or the new one, never half of either. */
export async function saveSettings(settings) {
  const dir = dataDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { /* reported by the write below */ }
  const data = payloadOf(settings);
  const file = path.join(dir, FILE_NAME);
  const previous = readJson(file);
  const revision = (previous && Number(previous.revision) ? Number(previous.revision) : 0) + 1;
  data.revision = revision;
  data.updatedAt = new Date().toISOString();
  const text = JSON.stringify(data, null, 2) + '\n';
  const tmp = file + '.tmp';
  try {
    const handle = await fs.promises.open(tmp, 'w', 0o600);
    try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(tmp, file);
    try { const dh = await fs.promises.open(dir, 'r'); await dh.sync(); await dh.close(); }
    catch (ignore) { /* not every filesystem allows fsync on a directory */ }
    appendHistory(dir, {
      at: data.updatedAt,
      revision: revision,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16),
      data: data,
    });
    return { ok: true, detail: 'revision ' + revision + ' in ' + dir };
  } catch (error) {
    return { ok: false, detail: String((error && error.message) || error) };
  }
}

export async function loadSettings() {
  if (!fs.existsSync(path.join(dataDir(), FILE_NAME))) return null;
  return readJson(path.join(dataDir(), FILE_NAME)) || null;
}

export async function revisions(limit) {
  let text = '';
  try { text = fs.readFileSync(path.join(dataDir(), HISTORY_NAME), 'utf8'); } catch (error) { return []; }
  return text.split('\n').filter(function (l) { return l.trim() !== ''; })
    .map(function (line) { try { return JSON.parse(line); } catch (error) { return null; } })
    .filter(Boolean).reverse().slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
}

export async function close() { return; }
