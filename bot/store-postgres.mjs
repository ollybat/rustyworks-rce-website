/* ==========================================================================
   Spinback RCE - an optional Postgres home for the settings the bot keeps.
   --------------------------------------------------------------------------
   The bot already mirrors its settings to the website when BOT_SETTINGS_TOKEN is
   set, and falls back to a file at SETTINGS_FILE. This module adds a third home
   that needs no token at all: it is used when DATABASE_URL is set, which is what
   Railway gives you when you attach a Postgres database to the service.

   Nothing here invents a field. saveSettings writes the same object the website
   endpoint receives, plus one append-only copy per save, so a bad save can always
   be looked at later. Server passwords are part of that object and are therefore
   in the database: the same credentials the bot already holds, in one more place
   that only the bot and whoever owns the database can reach.

   The driver is imported lazily, so an image built without pg still starts, and a
   deployment without DATABASE_URL simply reports "not configured" instead of
   failing to boot.
   ========================================================================== */

let poolPromise = null;
let pgModule = null;

export function databaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

export function configured() {
  return databaseUrl() !== '';
}

async function connect() {
  if (poolPromise) return poolPromise;
  poolPromise = (async function () {
    const url = databaseUrl();
    if (!url) return null;
    if (!pgModule) {
      try {
        pgModule = await import('pg');
      } catch (error) {
        console.log('postgres store: the pg driver is not installed, so DATABASE_URL is ignored ('
          + String((error && error.message) || error) + ')');
        return null;
      }
    }
    const Pool = (pgModule.default && pgModule.default.Pool) || pgModule.Pool;
    if (!Pool) { console.log('postgres store: pg did not export a Pool'); return null; }
    const plain = /sslmode=disable/.test(url) || /localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({
      connectionString: url,
      ssl: plain ? undefined : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', function (error) {
      console.log('postgres store: idle client error -', String((error && error.message) || error));
    });
    await ensureSchema(pool);
    return pool;
  })();
  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    throw error;
  }
}

/* Creating the tables here as well as in schema.sql means a fresh database starts
   working on first save, and a database that already has them is left alone. */
async function ensureSchema(pool) {
  await pool.query('create table if not exists settings ('
    + ' id text primary key, guild_id text, data jsonb not null, revision bigint not null default 1,'
    + ' updated_at timestamptz not null default now())');
  await pool.query('create table if not exists settings_history ('
    + ' at timestamptz not null default now(), id text not null, revision bigint, data jsonb not null)');
  await pool.query('create index if not exists settings_history_at on settings_history (at desc)');
}

const STORE_ID = 'spinback';

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

export async function saveSettings(settings) {
  if (!configured()) return { ok: false, detail: 'DATABASE_URL is not set on this service, so there is no Postgres to write to' };
  const pool = await connect();
  if (!pool) return { ok: false, detail: 'the Postgres driver is not available in this image' };
  const data = payloadOf(settings);
  const guild = String(process.env.DISCORD_GUILD_ID || '') || null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const saved = await client.query('insert into settings (id, guild_id, data, revision, updated_at)'
      + ' values ($1, $2, $3::jsonb, 1, now())'
      + ' on conflict (id) do update set data = excluded.data, guild_id = coalesce(excluded.guild_id, settings.guild_id),'
      + ' revision = settings.revision + 1, updated_at = now()'
      + ' returning revision', [STORE_ID, guild, JSON.stringify(data)]);
    const revision = saved.rows && saved.rows[0] ? Number(saved.rows[0].revision) : null;
    await client.query('insert into settings_history (id, revision, data) values ($1, $2, $3::jsonb)',
      [STORE_ID, revision, JSON.stringify(data)]);
    await client.query('commit');
    return { ok: true, detail: 'revision ' + (revision === null ? '?' : revision) };
  } catch (error) {
    try { await client.query('rollback'); } catch (ignored) { /* the original error is the one to report */ }
    return { ok: false, detail: String((error && error.message) || error) };
  } finally {
    client.release();
  }
}

/* Returns the stored object, or null when there is nothing to return. Nothing is
   guessed: an empty database returns null rather than an empty settings object. */
export async function loadSettings() {
  if (!configured()) return null;
  const pool = await connect();
  if (!pool) return null;
  const res = await pool.query('select data, revision, updated_at from settings where id = $1', [STORE_ID]);
  const row = res.rows && res.rows[0];
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : null;
  if (!data) return null;
  data.revision = Number(row.revision);
  data.updatedAt = row.updated_at;
  return data;
}

export async function revisions(limit) {
  if (!configured()) return [];
  const pool = await connect();
  if (!pool) return [];
  const res = await pool.query('select at, revision, data from settings_history order by at desc limit $1',
    [Math.max(1, Math.min(200, Number(limit) || 20))]);
  return res.rows || [];
}

export async function close() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    if (pool) await pool.end();
  } catch (ignored) { /* closing is best effort */ }
  poolPromise = null;
}
