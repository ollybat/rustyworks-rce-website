-- Spinback RCE - the tables the Postgres store uses.
-- Run this once (psql "$DATABASE_URL" -f bot/schema.sql) or let the bot create them
-- itself on its first save: bot/store-postgres.mjs runs the same statements.
--
-- What is in here is exactly what the bot already keeps: the settings object that the
-- website mirror receives, one append-only copy of it per save, and two read-only views
-- for the parts a page might want to show. Nothing is added that the bot does not have.

create table if not exists settings (
  id         text primary key,
  guild_id   text,
  data       jsonb not null,
  revision   bigint not null default 1,
  updated_at timestamptz not null default now()
);

comment on table settings is 'One row per bot: the same object the website mirror stores.';

create table if not exists settings_history (
  at       timestamptz not null default now(),
  id       text not null,
  revision bigint,
  data     jsonb not null
);

create index if not exists settings_history_at on settings_history (at desc);

-- The Discord accounts the bot has linked to a gamertag.
-- Fields are the ones the bot writes: userId, gamertag, at, by.
create or replace view linked_accounts as
  select (link ->> 'userId')   as discord_user_id,
         (link ->> 'gamertag') as gamertag,
         (link ->> 'at')::timestamptz as linked_at,
         (link ->> 'by')       as linked_by
  from settings s,
       lateral jsonb_array_elements(coalesce(s.data -> 'links', '[]'::jsonb)) as link;

-- The Rust servers the bot has saved. The RCON password is deliberately not exposed
-- here: it stays inside the data column, reachable by the bot and by whoever owns
-- the database, and never by a page.
create or replace view saved_servers as
  select (server ->> 'id')   as server_id,
         (server ->> 'name') as name,
         (server ->> 'host') as host,
         nullif(server ->> 'port', '')::int as port
  from settings s,
       lateral jsonb_array_elements(coalesce(s.data -> 'servers', '[]'::jsonb)) as server;
