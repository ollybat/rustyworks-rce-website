# Spinback RCE - website

The public site for **Spinback RCE**, the free Discord bot for Rust Console Edition
servers. Plain HTML, CSS and browser JavaScript: no framework, no runtime
dependencies, and one small build step that copies `public/` into the deployable
bundle and strips the comments out of the shipping copies.

- Homepage - https://spinback-j7ao5f.camelai.app/
- Live status - /status.html
- Command reference - /commands.html
- Kit Studio - /dashboard/kitbuilder.html
- Colour Studio - /dashboard/colortext.html

## What is in the tree

`public/` is the site itself, and the source of truth for every file that ships.

```
index.html                Homepage
style.css                 The whole site stylesheet - theme tokens, every page, seasons
theme-spinback.css        Brand layer that sits over style.css
sections.css              Homepage scene styles
ui-extras.css             Skip link, theme switch, light palette winning over the
                          seasonal palettes (must load after style.css)
motion.css/.js            Motion layer, honours "reduce motion"
site-plus.css/.js         Shell extras: navigation, panels, install pill
site-pro.css/.js          Header and footer extras used across the pages
search.css/.js            Search palette, reading data/items.json and data/skins.json
theme.js                  Theme engine, seasons, add-to-home-screen, reading fonts
config.js                 Runtime config (site name, API base)
apiHelper.js              The one place bot API URLs are built and fetched (RWApi)
page.js                   Shared odds and ends for the secondary pages
home.js                   Homepage behaviour
status.html/.css/.js      Live status page, filled from the bot API
status-plus/-pro          Status page extras
commands.html/.css/.js    Command reference, rendered from data/commands.json
settings.html/.css/.js    Site preferences kept in this browser - no account, no login
dashboard/kitbuilder.html Kit Studio page
kitbuilder-page.js        Kit Studio logic
kit-saves.js              Kit Studio storage in this browser, so saving needs no account
kitstudio-page.css        Kit Studio styles
dashboard/colortext.html  Colour Studio, with its own script and styles
404.html                  Not-found page, served with a real 404 status
offline.html              The page the service worker shows when the network is gone
sw.js                     Service worker: live pages, cached pictures, offline fallback
manifest.json             Web app manifest, also served as manifest.webmanifest
manifest-<season>.json    One manifest per season, so the installed app follows the theme
media/                    Logo, app icons, banners, social card, font faces
fonts/rw-fonts.css        The optional reading fonts, loaded only when one is picked
data/commands.json        Every command, subcommand and permission, as data
data/items.json           Item catalogue the Kit Studio and the search read
data/skins.json           Store catalogue: products, the skins inside them, release
                          dates and official news posts
robots.txt / sitemap.xml  Crawler rules and the page list
worker.js                 Serves public/, proxies the bot API, routes the old paths
scripts/build.mjs         Builds the deployable bundle from public/ and worker.js
scripts/check-brand.mjs   Fails the run if the old product name is still in the copy
bot/                      The Discord bot that runs alongside the site
docs/                     Hosting and Discord setup notes
```

## Build, run, publish

```bash
npm install
npm run dev       # http://localhost:8787
npm run build     # writes build/client (the site) and build/server (the worker)
npm run check:brand
```

`build/client` is what visitors download, and every JavaScript, CSS and HTML file in it
is a stripped copy: comments and indentation go, nothing else. Names are kept exactly
as they are, so anything markup reaches by name - an `onclick` attribute, a shared
global, a CSS custom property - still resolves. A file the stripper cannot read, or a
build without the minifier installed, is copied through untouched, so a surprise in one
file cannot take the site down with it.

Artwork that has to travel as text is committed as `name.ext.b64` (split into
`.b64.partN` pieces when it is large) and decoded back by the build, so a fresh clone
builds with the pictures already in place.

## Routes

`worker.js` serves the static files and answers the rest:

| Path | What happens |
| --- | --- |
| `/`, `/status`, `/commands`, `/settings` | The pages, with or without the `.html` |
| `/dashboard` | 302 to the Kit Studio |
| `/api/*` | Proxied to the bot API - the site only ever reads |
| `/api/status`, `/api/history` | Answered here: bot health and the uptime history |
| `/data/entities.json`, `/data/presets/*` | Served from here when present, otherwise fetched from the item service |
| `/media/kitbuilder/*` | Item art, fetched once and kept |
| Anything missing | `404.html` with a 404 status - never the homepage |

## Styles and scripts

Stylesheets are layered in load order: `style.css` first, then the brand, motion and
page layers, and a page's own sheet last. `style.css` is treated as fixed: a new visual
idea goes into its own small file loaded after it, so an older browser that misses the
new file still gets a working page.

Scripts are dependency-free and loaded with `defer`. Each block checks for the markup it
needs and returns quietly when a page does not have it, so the same file is safe on
every page.

## Preferences, without accounts

Settings covers this browser only: theme, motion, text size, compact navigation,
seasonal touches and the optional reading fonts (OpenDyslexic, Atkinson Hyperlegible,
Lexend), what is stored locally, and a button to clear it. Server configuration is not
on this site - that belongs in Discord, where the bot can act on it - so nothing here
ever asks anyone to sign in.

## Installable app, and offline

`theme.js` links the manifest, sets the app colours, registers `sw.js` and offers an
install prompt. `sw.js` keeps pages live and caches only pictures and the offline page,
so nobody is served a stale page. The seasonal manifests let the installed app follow
Halloween, Thanksgiving or Christmas without a second build.

## Writing style

British spelling in the copy and the comments, plain language, and no invented
numbers: anything the site cannot ask the bot for says so instead of guessing.

## The Discord bot (`bot/`)

`bot/server.mjs` runs on Railway with `bot/commands.mjs` holding every command, panel and
reply. Six commands, none with typed options: `/ping`, `/help` (open to everyone), `/setup`,
`/kits`, `/user` and `/server`. Every reply passes through `dress()` for one consistent look.

- **Railway build**: Railway no longer reads `railway.json`, so the service itself is set to
  build `bot/Dockerfile` and start `node server.mjs`, with the health check on `/healthz`.
- **Settings** are kept by the website when `BOT_SETTINGS_TOKEN` is set on both sides, and
  also in a file: with a Railway volume attached (`RAILWAY_VOLUME_MOUNT_PATH`) or
  `SETTINGS_FILE` set, it survives redeploys, so a volume alone is enough. The file holds RCON
  passwords and is written owner-only.
- **Guided setup** (`/setup run`) can create the staff roles (no Discord permissions granted,
  never assigned to anyone) and one log channel per log type, private to those roles.
- **RCON** addresses are read in any shape (`1.2.3.4:28015`, `[v6]:port`, a hostname, a
  scheme in front); private, loopback and special ranges are refused with their own reason,
  and `bot/network-guard.mjs` checks every address a hostname resolves to.
- **Internal HTTP routes** (`/api/guild(s)`, `/api/rcon/test`, `/api/reconnect`,
  `/api/oauth/exchange`) need `BOT_SETTINGS_TOKEN`; `/healthz` reports liveness only.

Checks (all run in CI): `scripts/check-commands.mjs` (every reply within Discord's limits,
plain and dressed, plus missing imports and the commands reference),
`scripts/simulate-bot.mjs` (the real bot against a pretend Discord, website and silent Rust
server, then a restart with only the settings file), `scripts/check-network-guard.mjs`,
`scripts/smoke-test.mjs`, `scripts/check-brand.mjs` and `scripts/rcon-selftest.py`.
