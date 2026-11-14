NEXT PATCHES - bot side (for whoever has the repo and the Railway service)
=========================================================================
Written against main as it is now (bot version 5ad4c02-era onwards). Everything
below is a change to bot/server.mjs or bot/commands.mjs, which are 157 kB and 154 kB
and therefore too large to push from the camelAI chat side. The site half of this
work is already live.

1. GET /api/servers - use the CORRECTED step 1
   The step 1 in PR #11 reads a "serverChecks" map and "state.guildInfo". Neither
   exists in server.mjs any more, so the route throws on its first request. The
   corrected version - built on settings.servers and rconState, which do exist, with
   serversCache at module scope - is in bot/servers-endpoint.patch (push
   a79caa314d6b). Steps 2 and 3 of that file are unchanged and still optional.

2. /ping must not claim settings are safe when the last save failed
   Today ctx.storeTokenSet() answers "does the bot hold a token". That is not the
   same as "does a save work": with a token set and the website's value missing,
   every save returns 503, the bot falls back to memory, and /ping still reads as
   if all is well.
   Keep the result of the last write with the settings it belongs to, for example:
       let lastPersist = { ok: false, at: 0, via: null, detail: "not tried yet" };
   set it inside persistSettingsNow on every outcome - website, database, file,
   memory - and expose it on the context as ctx.storeState().
   Then the /ping field should read, in kinds not words:
       via "website", ok true   -> kept on the website (last save <ago>)
       via "website", ok false  -> memory right now: the website refused the last save (<detail>)
       via "postgres", ok true  -> kept in Postgres (last save <ago>)
       via "file", ok true      -> kept on the bot's own disk
       nothing configured       -> not configured yet (BOT_SETTINGS_TOKEN)
   The point is that the line a person reads in Discord is the outcome, not the
   intent.

3. One line: the server count in the public status
   In the publicStatus object, stats: { guilds, gateway } -> add
   servers: (settings.servers || []).length. worker.js already looks for that key in
   proxyApi -> recordSample, so /api/history starts charting servers the same day.

4. Postgres wiring (bot/store-postgres.mjs, bot/schema.sql are already on main)
   In persistSettingsNow, after the website attempt, add the database as an
   ADDITIONAL home, not a replacement:
       const saved = await pgStore.saveSettings(payloadOf(settings));
   and at the top of loadSettings:
       const stored = await pgStore.loadSettings();
       if (stored) applySettings(stored);
   Requirement, and this is the part that matters to users: when the website refuses
   a save but the database accepts it, report the save as SUCCESSFUL and say it was
   the database. Otherwise Discord keeps telling people their settings are "kept in
   this bot memory only" while they are in fact safe.
   DATABASE_URL is already set on the Railway service and pg is already in
   bot/package.json. The tables create themselves on first save.

5. The retired owner console (site side, for whoever edits worker.js)
   worker.js still loads /dashboard/console.css and /dashboard/console.js. Neither
   file exists in the repo, and /dashboard already redirects elsewhere, so either
   delete those two references or point /dashboard/console at /status.html.

STATE OF THE SITE HALF - verified live
  - bot/site-check-shim.cjs is LOADED (GET /api/shim -> {"active":true,...}), so the
    start command took effect on a fresh build.
  - The site has no BOT_SETTINGS_TOKEN, so /api/bot/settings answers 503 no-token and
    every save from the bot is refused. /servers.html says so on the page itself.
  - /api/servers still answers 405 until item 1 is merged.
