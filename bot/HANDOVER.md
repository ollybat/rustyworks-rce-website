# Handover: two things only a machine with Railway access can finish

The bot service answers at `https://rustyworks-rce-website-production.up.railway.app`.
The website is `https://spinback-j7ao5f.camelai.app` (repo `ollybat/rustyworks-rce-website`, app name `spinback`).
The site is a read-only helper: it never changes a Discord server. Its `/api/bot/settings` endpoint is
the only write path the bot has into the site, and it is gated by one shared token.

## Task 1 (important): make the bot's saved settings survive a redeploy

Right now the bot keeps settings in memory only. `GET /api/status` on the bot reports `"storage":"memory"`,
and `/ping` shows `Settings store: not configured yet (BOT_SETTINGS_TOKEN)`.

1. Railway -> the bot service -> **Variables** -> **New Variable**
   - name: `BOT_SETTINGS_TOKEN`
   - value: the 48-character value below (treat it as a secret; do not commit it to the repo)

         <the 48-character value - kept out of the repo on purpose>

2. **Redeploy** the bot service. A Restart is not enough: environment changes only reach a new deployment.
3. On the site app `spinback`, add the same variable name and the same value (exactly the same string,
   no trailing space), then redeploy the app.

Where it is read:
- bot: `bot/server.mjs`, `settingsToken()` reads `process.env.BOT_SETTINGS_TOKEN`.
- site: `worker.js`, `botSettings()` compares the incoming `x-settings-token` header with
  `env.BOT_SETTINGS_TOKEN` and answers `503 {"reason":"no-token"}` until it exists.

Done when all three hold:
- `curl -s https://spinback-j7ao5f.camelai.app/api/bot/settings` no longer says `no-token`;
  with the header `x-settings-token: <the value>` it returns 200, and with a wrong token a 403 `bad-token`.
- `/ping` in Discord reads `Settings store: the website accepts saves from this bot`.
- The warning line on `/servers.html` disappears (it only appears while the bot reports it is not keeping settings).

If the site app's environment cannot be edited, do not force it: tell me and I will instead move the value
into the site's own storage, where the Discord client secret already lives (set from the site's sign-in
setup page), so it can be entered on a page that is already in use.

## Task 2: make the bot actually load its website-check shim

The Dockerfile ends with `node --require ./site-check-shim.cjs server.mjs`, but the running container is
not loading it: `GET /api/shim` answers with the bot's own `405 method not allowed` instead of the shim's
marker. That means the Railway service has its own start command, which overrides the image.

- Railway -> bot service -> Settings -> Deploy -> **Start Command**: `node --require ./site-check-shim.cjs server.mjs`
  (or clear it entirely so the image's CMD applies, which is already exactly that).
- Done when `GET /api/shim` returns a JSON marker with `"active":true`, `"prefers":"/health.json"`, `"raceMs":1500`.

This is insurance rather than the fix. The site side is already repaired: `/api/config-check` builds its
expensive half once and reuses it for 30 seconds, and is edge-cacheable, so it measures 30-40 ms warm
and about 1.2 s on a brand new edge location, well inside the bot's 2500 ms window. The shim additionally
prefers the static `/health.json` (about 60 ms) and races it against the full check.

## Task 3: files too large to push from here (over ~128 KiB per push)

1. `bot/server.mjs` (157 KiB) - add the public read-only `GET /api/servers`. The full patch is in this repo
   at `bot/servers-endpoint.patch`: it goes directly after the existing `GET /api/guilds` block, above the
   settings-auth gate. It publishes no password, address or token. Until it lands, `/servers.html` falls
   back to `/api/status` and says so.
2. `bot/server.mjs` (optional) - persist settings in Postgres as well. The exact replacement text for
   `persistSettings()` and the four-line insert in `loadSettings()` are in `bot/POSTGRES.md`, the store
   module is `bot/store-postgres.mjs`, the schema is `bot/schema.sql`, and `pg` is already in
   `bot/package.json`. It needs `DATABASE_URL` on the bot service - the same Railway page as Task 1.
3. `bot/commands.mjs` (154 KiB) - the older website-check patch is **no longer needed**. Do not apply it:
   the site-side caching plus the shim cover it, and the shim is the smaller change.

## Ground rules for this repo

- Never commit `BOT_SETTINGS_TOKEN` or any other secret. It belongs in a host's variable store only.
- The website stays read-only: no login, no account, no server configuration on the site.
- No invite links anywhere under `public/`, by the owner's request.
- `public/style.css` stays byte-identical; new styles go in a separate, later-loaded file.
- The site prints "not reported" rather than guessing. Keep that.

## What I will check afterwards from the website side

- `GET /api/bot/settings` - `no-token` versus `bad-token` versus 200.
- `GET /api/shim` on the bot - whether the marker is there.
- `/api/status` on the bot - the `storage` field and the version string.
- `/ping`'s three lines, as reported by whoever runs it.
