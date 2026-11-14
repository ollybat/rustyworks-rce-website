# Postgres for the bot's settings

The bot currently loses everything on a redeploy ("storage: memory") because neither
BOT_SETTINGS_TOKEN nor a volume is set. There are two ways out; Postgres is the one
that needs no token anywhere.

## Option A - the token only (no code, five minutes)

1. In Railway, open the bot service, Variables, and add BOT_SETTINGS_TOKEN with a long
   random value.
2. Add the same variable and same value to the site app (spinback) in this workspace.
3. Redeploy the bot (not Restart - env changes need a redeploy).
4. Run /ping: the settings line should go green.

The website then holds the settings server-side, so a redeploy reads them back.

## Option B - Postgres (what was asked for, survives everything)

1. Railway, the bot's project: **New -> Database -> Add PostgreSQL**. Railway creates
   DATABASE_URL and Railway can inject it into the bot service (Variables -> Add
   reference -> DATABASE_URL). Nothing else is needed for the connection.
2. This commit adds pg to bot/package.json, so the image installs the driver.
   Redeploy once so the image is rebuilt with it.
3. Copy bot/store-postgres.mjs into server.mjs with the two small changes below.
   Step 1 alone does nothing until this is done: the module is inert until it is called.
4. Optional: run bot/schema.sql against the database. The bot also creates the tables
   on its first save, so this is only needed if you want the schema in place up front.

### The two changes in server.mjs

Add to the imports at the top:

    import * as pgStore from './store-postgres.mjs';

Replace persistSettings() with this (the website write is kept, Postgres is tried
first and is enough on its own):

    async function persistSettings() {
      const byDb = await pgStore.saveSettings(settings)
        .catch(function (error) { return { ok: false, detail: String((error && error.message) || error) }; });
      const token = settingsToken();
      if (!token) return byDb;
      try {
        const res = await fetch(SITE_URL + '/api/bot/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-settings-token': token },
          body: JSON.stringify(pgStore.payloadOf(settings)),
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.json().catch(function () { return {}; });
        if (res.ok && body && body.ok !== false) return { ok: true, detail: '' };
        if (byDb.ok) return byDb;
        return { ok: false, detail: 'the website answered ' + res.status + (body && body.reason ? ' (' + body.reason + ')' : '') };
      } catch (error) {
        if (byDb.ok) return byDb;
        return { ok: false, detail: String((error && error.message) || error) };
      }
    }

And at the very start of loadSettings(), before the token check, add the read-back
from the database so a redeploy restores what was saved:

    try {
      const fromDb = await pgStore.loadSettings();
      if (fromDb) applySettingsPayload(fromDb);
    } catch (error) { log('postgres settings read failed:', String((error && error.message) || error)); }

applySettingsPayload is just the block of if (body && ...) lines already inside
loadSettings(), lifted into a named function so both homes fill settings the same way.

## What Postgres gives you beyond durability

- settings_history keeps every save, so nothing is ever lost, not just the latest state.
- linked_accounts and saved_servers are views over the stored JSON: the same data,
  queryable, with the RCON password kept out of them.
- The public history the site already collects (/api/history) stays where it is. If you
  also want server population over time, that needs the /api/servers patch on the bot.
