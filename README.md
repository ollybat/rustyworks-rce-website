# Spinback RCE — website

Static marketing site for **Spinback RCE**, the free Discord bot for Rust Console
Edition servers. Plain HTML, CSS and browser JavaScript — no build step beyond copying
`public/` into the deployable bundle.

## Structure

```
public/
  index.html            Homepage markup
  style.css             Full site stylesheet (theme tokens, every page, seasonal themes)
  sections.css          Homepage scene styles used by the homepage
  ui-extras.css         Skip link, theme switch, and the light palette winning over
                        the seasonal palettes (must load after style.css)
  config.js             Runtime config (the bot API base URL)
  theme.js              Theme engine, seasons, "add to home screen"
  apiHelper.js          Small JSON helper for the bot API
  nav-auth.js           Header account widget: "Login" pill, or the signed-in capsule
  login.html            Sign-in page for the owner-only dashboard
  login.js              Keeps that page's button honest about the current session
  status.html           Live status page: uptime, counters, service rows
  status.js             Fills it from /api/status and /auth/me (no invented numbers)
  home.js               Homepage behaviour: nav, partners panel, scroll reveal,
                        live counts, hero video
  manifest.webmanifest  Web app manifest (installable "add to home screen")
  media/fonts.css       @font-face list for Chakra Petch, Oswald and JetBrains Mono,
                        served from here so pages contact one less origin
  media/rustyworks-icon.svg      Site logo, favicon and app icon (name the stylesheet's
                                 seasonal rules expect)
  media/rustyworks-icon-christmas.svg  In-season logo (Santa hat), swapped in by theme.js
  robots.txt            Crawler rules: the dashboard, sign-in and API stay out
  sitemap.xml           The two public pages, for search engines
  404.html              Styled not-found page, served by the worker with a 404
  notfound.js           Fills the year and names the path that missed
worker.js               Serves public/, proxies the bot API, and gates /dashboard
scripts/build.mjs       Copies public/ + worker.js into build/
bot/
  Dockerfile              Railway image for the bot service
  package.json            Bot-only production dependencies
  server.mjs              Discord Gateway, HTTP API, settings sync and RCON client
  commands.mjs            Slash commands, forms, buttons and permission checks
  network-guard.mjs       Public-IP validation for outbound RCON
  interactions-worker.js  Signed Discord interactions fallback
  register-commands.mjs   Registers the bot's slash commands
docs/
  DISCORD-DASHBOARD.md    Historical dashboard and Discord setup notes
```

## Hosting layout

This repository contains two different deployables:

- **Railway runs the bot/API.** `railway.json` selects `bot/Dockerfile`, which starts
  `bot/server.mjs`. That one process connects to Discord's Gateway and serves the bot API.
- **The website is a Cloudflare Worker.** `worker.js`, `wrangler.jsonc` and `public/`
  are deployed separately with `npm run deploy`. The Worker uses the `ASSETS` binding
  for the site and the `STATUS_LOG` R2 bucket for status history and site settings.

The Railway configuration does not deploy the website. Keep the bot and website deployments
separate unless the Worker APIs and R2 storage are deliberately replaced with Railway-compatible
services.

### Railway bot service

Connect this repository to Railway and let it use the checked-in `railway.json`. Do not
override the Dockerfile with a root-level build: the configured image installs the bot's
own dependencies from `bot/package.json`.

Set these variables on the Railway bot service:

| Variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot token used for the Gateway connection |
| `DISCORD_GUILD_ID` | Discord server the bot is configured for |
| `DISCORD_GUILD_OWNER_ID` | Optional explicit owner id for owner-only checks |
| `DISCORD_PUBLIC_KEY` | Discord application public key for signed interaction requests |
| `BOT_SETTINGS_TOKEN` | Shared secret for settings sync and trusted website-to-bot requests |
| `SITE_URL` | Canonical website origin used for links and settings writes |
| `SITE_ORIGIN` | Website origin used when the bot reads settings |
| `DISCORD_CLIENT_SECRET` | Required only when using the bot's Discord OAuth code-exchange route |

Set **the same `BOT_SETTINGS_TOKEN`** on the website Worker. It must remain a server-side
secret: never add it to `public/config.js` or any browser JavaScript. The Worker adds it when
reading private guild metadata from the bot.

Railway supplies `PORT` at runtime. Leave it unset in the dashboard and let the app bind to
`0.0.0.0`; the health check is `GET /healthz`. That endpoint intentionally returns only a
small liveness response. The public status page reads the separate, sanitised `GET /api/status`.

For a standard Railway deploy, the configured health check path is already in `railway.json`.
After deploy, confirm `/healthz` returns HTTP 200 and `/api/status` reports the expected
Gateway state. Never paste bot tokens, the shared settings token, or RCON passwords into
issues, logs, or public environment files.

## Local development

```bash
npm install
npm run dev      # http://localhost:8787
npm run build    # writes build/
npm run deploy   # publishes with wrangler
```

No wrangler handy? `node scripts/build.mjs && node scripts/local-server.mjs` runs the built
worker under plain Node on http://localhost:8787, with an in-memory stand-in for the
`STATUS_LOG` bucket. Upstream calls that cannot be reached fail the same way they would
in production, so the fallbacks get exercised too.

`node scripts/smoke-test.mjs` builds the site and checks it without a browser or network:
every page, every file a page or the service worker refers to, the redirects, the 404 page,
the retired endpoints and the status history. It exits non-zero on the first problem, and
GitHub runs it with the other checks on every push and pull request
(`.github/workflows/checks.yml`).

`node scripts/check-commands.mjs` does the same for the bot's slash commands: it checks every
definition in `bot/commands.mjs` against Discord's rules (one bad definition makes Discord
refuse the whole list), then runs every command and subcommand against a pretend bot, before
and after setup and with lots of saved data, and checks each reply, panel and form against
Discord's size limits.

`node scripts/simulate-bot.mjs` runs the real `bot/server.mjs` against a stand-in for
discord.js (`scripts/sim/`) and a pretend website, and drives every command, button, menu,
form and suggestion through it: typed form values must reach the bot, every interaction must
be answered inside Discord's three seconds even when a save or an RCON check is slow, no
handler may reply twice, settings must really be saved, and the linked role and the log
channels must really be used. It also covers kit delivery set from Discord, kit names picked up
from an install code, live permission checks in `/setup status`, direct messages to players
when a link request is approved or rejected (including closed DMs), roster search across pages,
and replacing an old link panel. No Discord, token or `npm install` needed.

## Stylesheet map

`public/style.css` is the whole site's stylesheet, in this order:

1. **Tokens & base chrome** — `:root` variables, reset, nav, hero, section shell,
   feature cards, commands, docs, CTA band, footer.
2. **Reveal & responsive** — scroll-reveal animation and the 960 / 760 / 380 breakpoints.
3. **Shared page components** — page hero, panels, toolbars, tables, forms.
4. **Status / updates / login / admin** — status badge, uptime bars, changelog, auth screens.
5. **Configure-bot dashboard** — configure.html and linking.html, section cards.
6. **Theme engine & account nav** — button icons, capsule nav, badges, account shell.
7. **Seasonal themes** — Halloween, Christmas and Thanksgiving, each guarded by
   `html[data-season="…"]`, so a season simply stops applying when the attribute is not
   set (theme.js picks it from the calendar).
8. **#rw-fx overlay** — the moving pieces theme.js builds (embers, bats, spider, snow…).
9. **Input, focus & device hardening** — appended block: `color-scheme`, keyboard focus
   rings, safe-area insets and touch-specific hover handling.

A handful of custom properties are set at runtime by theme.js or inline markup rather
than declared in the sheet: `--c --d --del --dur --dx --dy --o --s --sp --sw --sz --x --y`.

## JavaScript

Four small, dependency-free files, all loaded with `defer`:

- `theme.js` — sets the flags the stylesheet keys off: `data-reduce-motion`,
  `data-lowdevice`, `data-app` (installed app) and drives the "add to home screen" prompt.
- `apiHelper.js` — one place to build bot-API URLs and fetch JSON (`RWApi`).
- `nav-auth.js` — the session helper; without accounts it resolves to an anonymous visit.
- `home.js` — the homepage's own behaviour. Each block checks for its markup and bails
  out quietly if it is missing, so the same file is safe on other pages.

The homepage works with scripting off: the scroll-reveal animation only hides content once
the page has flagged itself as scripted, and the live counts keep the numbers in the markup
if the API cannot be reached.

## Pages

The site is the homepage, `login.html`, `status.html` and the `/dashboard/` area. The
Features, Commands, Docs, Updates and Partners pages were dropped, so nothing links to
them: the navigation is Status, Add to Discord and the account widget.

## How the site behaves

- **Pretty URLs** — `/status` serves `status.html`, `/` serves `index.html`, so a
  link copied out of the address bar stays tidy.
- **A real 404** — anything that looks like a page but does not exist gets the
  site's own 404 page and an honest 404 status, never a blank page or a bounce
  back to the homepage.
- **Light and dark** — the stylesheet has always carried a full light palette
  under `html[data-theme="light"]`; `theme.js` now puts a switch in the
  navigation. Dark is what a first time visitor gets, the choice is remembered,
  and a tiny inline script in each page's `<head>` applies it before first paint
  so there is no flash of the wrong palette.
- **Keyboard and screen readers** — a skip link on every page, a `<main>`
  landmark, `aria-current` on the navigation item you are on, and the live
  counters announce themselves politely as they change.
- **Search engines** — per-page titles and descriptions, canonical URLs, Open
  Graph and Twitter cards, `SoftwareApplication` structured data on the
  homepage, plus `robots.txt` and `sitemap.xml`.
- **Headers** — asset responses carry `x-content-type-options: nosniff` and a
  referrer policy; the dashboard and sign-in pages are `noindex`.

## Bot and dashboard

One Discord server, one owner, one command — `/dashboard`, which replies privately
with a link to this site's dashboard.

| Rule | Enforced by |
| --- | --- |
| Nobody but the owner sees the command | Registered guild-scoped with `default_member_permissions: "0"`, so Discord hides it from everyone who is not an administrator — and the owner always is one. |
| Nobody but the owner can run it | The bot compares `interaction.member.user.id` with `DISCORD_GUILD_OWNER_ID` and answers with an empty response otherwise. |
| One server only | The command is registered in one guild, `dm_permission: false`, `contexts: [0]`, and interactions from any other guild are ignored. |
| Only the owner can open the page | `/dashboard` requires a signed session created by a Discord sign-in, and only for the account Discord flags `owner: true` on that guild; no account means no page. |

Setup steps, required secrets and the research behind those choices are in
[docs/DISCORD-DASHBOARD.md](docs/DISCORD-DASHBOARD.md). The dashboard fails closed:
with no secrets set it answers 503 and the rest of the site carries on.

## Configuration

- **Bot API** — `public/config.js` holds the bot API base URL in one place
  (`window.RW_API`, currently `https://api.rustyworksrce.xyz`); pages read it from there
  instead of hard-coding a host. If the API is ever unreachable the site keeps working and
  falls back to the published numbers.
- **Hero background video** — the homepage looks for a background video under
  `public/media/`; when it is absent the hero falls back to the dark rust gradient.

## Device support

The layout is fluid from a 320px phone up to large desktop displays.

- **Navigation** collapses to a menu button below 900px; the panel is positioned under
  the header and sized from a shared `--header-h` token.
- **Phone layouts** stack the hero, CTA cards and footer, make the primary hero buttons
  full width, and keep decorative tool mockups out of the way below 640px.
- **Touch input** gets finger-sized targets (44px minimum), no sticky hover lift
  (`@media (hover: none)`) and no tap highlight.
- **Notched / rounded displays** are handled with `viewport-fit=cover` plus
  `env(safe-area-inset-*)` padding on the page gutter, header and footer.
- **Motion** respects `prefers-reduced-motion`, and `color-scheme` plus a `theme-color`
  keep the browser chrome in theme.
- **Installable**: the manifest and icons let the footer's app button install the site to
  a home screen where the browser supports it.

## Source status

`public/style.css` and `public/config.js` are the site's real files, cleaned up and
verified to be behaviour-identical to the originals (same rules, same order, same
declarations). `index.html`, `apiHelper.js`, `nav-auth.js` and `theme.js` in this repo are
still earlier rebuilt copies, so the project is deliberately not deployed in this state.

## The name

The product is **Spinback RCE**, short form **Spinback**. It appears in page titles and
meta tags, the header wordmark and footer, the legal pages, the docs, the `/dashboard`
command description and its reply, the web app manifest and the social preview card.

Anything a script has to print - the Discord summary, the copied status line, exported
file names, notifications - reads `window.RW_BRAND` from `public/config.js` instead of
hard-coding it, so changing the name there covers the dynamic half of the site. The
static half lives in the markup, and `npm run check:brand` fails if the old name is left
in any of it.

Some things deliberately keep the old spelling, because they are plumbing rather than
copy and renaming them would cost the live URL or break references:

- the deployed host `spinback-j7ao5f.camelai.app`, and the canonical, `og:url` and
  `og:image` URLs built from it;
- the Worker name and the `STATUS_LOG` bucket name in `wrangler.jsonc`, and the npm
  package name (a lockfile rewrite for no visible gain);
- the icon files under `public/media/` (`rustyworks-icon.svg` and its seasonal
  siblings), which `style.css` and `theme.js` match on by file name;
- internal identifiers such as the `rw_` CSS and `localStorage` prefixes and the
  `rw_session` cookie.

The bot's own API still reports its previous name in the `version` field it returns,
because that string comes from the bot's backend rather than this repository. The status
page prints it exactly as reported, so the panel and the bot agree even while the backend
name is unchanged.
## Notes

Images, fonts and the logo are original assets. Spinback RCE is not affiliated with
Facepunch Studios or Rust.

## Social cards and app icons

`public/media/` holds three generated raster assets:

- `icon-192.png` — the installable app icon, used by the manifest with `any maskable`.
- `apple-touch-icon.png` — the homescreen icon for iOS, which ignores SVG icons.
- `og-card.jpg` — the 1200x630 link preview card used by `og:image` and `twitter:image`
  on every page that has a canonical URL.

Each one sits next to a base64 companion (`.b64`, and `.b64.partN` for the large
image) because the tooling that publishes this repository can only send text. The
build decodes them back into real image files before `public/` is copied, so a fresh
clone builds and deploys with the artwork in place.

## Pages added after launch

`rustservers.html`, `rustskins.html`, `dashboard/kitbuilder.html`,
`dashboard/colortext.html`, `legal/privacy.html` and `legal/terms.html`. Each one
says plainly what the page will do and what is not built yet — none of them invents
numbers or features for a tool that does not exist yet. `page.js` only fills in the
footer year.

## The status monitor

`worker.js` records one sample every time it proxies `/api/status`, and keeps a week of
them in the `STATUS_LOG` R2 bucket (`history/<yyyy-mm-dd-HH>.json`, up to 240 samples an
hour, deduplicated to one per 20 seconds so a refreshing visitor cannot skew it).
`/api/history?hours=24` (or `168`) turns that back into hourly buckets, totals and
incident runs, and the status page draws its "Measured by this site" panel from it.

Two limits the page states rather than hides: samples only exist while somebody is
looking at the site, and the response time recorded is from the Worker to the bot API -
not from the visitor's browser, which is measured separately by the visit strip.

## Kit Studio

`public/dashboard/kitbuilder.html` builds the console commands a Rust Console Edition server
wants for a kit, slot by slot (7 wear, 24 main, 6 belt):

    kit remove "KIT_NAME"
    kit add "KIT_NAME"
    kit add "KIT_NAME" <shortname> <amount> 1 <wear|main|belt>

Kit names are upper-cased, spaces become underscores, and quotes or backslashes are dropped,
because the name sits inside double quotes in every line. Kits are saved in the browser
(`localStorage`, key `spinback-kits-v1`, handled by `public/kit-saves.js`), and the counters at
the top of the page are this browser's own. Import takes either the Base64 install code or
pasted `kit add` lines, keeps the kit's name, and leaves the current kit alone if nothing in
the paste can be read. The site search opens an item straight in the studio
(`/dashboard/kitbuilder.html#item=<shortname>`). The page itself is described further down,
under "Kit Studio page".

`public/data/items.json` is the site's own catalogue: `src: "db"` entries were read from a
public RUST item database and carry a documented stack size, `src: "core"` entries were added
from widely known item names. The site search uses it, and the Kit Studio falls back to it
when its upstream item list cannot be reached.

## Offline, and installable

`public/sw.js` is the service worker. It caches the pictures, the fonts, the offline page and
the app icons, and it never caches pages, sign-ins or API answers, so a visitor always sees
the live site. `public/offline.html` is what a phone shows when the network is gone; its
styles are inline on purpose, because nothing on that page may need the network.

Bump `VERSION` in `sw.js` whenever the cached files must be replaced on every device. The
Worker serves `/sw.js` with `no-cache` and `Service-Worker-Allowed: /`, so an old worker
cannot pin an old site on a phone. `public/media/icon-512.png` (with a base64 companion for
this text-only repository) gives Android the 512px icon it wants before it offers an
install, alongside the existing 192px icon.

## Brand assets

Everything the site shows as "Spinback" comes from artwork kept in `public/media/`:

| File | What it is |
| --- | --- |
| `spinback-mark.png` | The S mark on its own, transparent background |
| `rustyworks-icon.svg` | Site logo and favicon: the mark wrapped in an SVG |
| `rustyworks-icon-christmas.svg` | Same mark with a hat, used from Nov 1 to Jan 6 |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App and install icons on a dark tile |
| `spinback-banner.webp` | Animated hero banner (46 frames, about 230 KB) |
| `spinback-banner-poster.jpg` | Still first frame, shown before the animation loads |
| `og-card.jpg` | 1200x630 link preview card |

Raster art is stored as `*.b64` (or `*.b64.partN`) text, because that is what travels
reliably through this repository's tooling. `scripts/build.mjs` decodes those parts back into
real image files during a build, so edit the parts, not the binaries. If you replace the mark,
regenerate the parts for every raster in the table above: the build decodes them over whatever
else is in `public/media/`.

## Kit Studio page

`public/dashboard/kitbuilder.html` is the Kit Builder page maintained on the main site, kept as it
was written (only the visible name was changed to Spinback). It reads its item list from
`/media/entitys/entities.json` and one icon per item from `/media/kitbuilder/`*<shortname>`.png`, both
served by `worker.js` from `https://rustyworksrce.xyz` and cached by the browser for a day, so the
repository does not carry a few hundred PNGs.

If that upstream item list cannot be reached at all, the page falls back to the catalogue
this repository ships in `public/data/items.json` (about 300 items in the site's own
groups), so the studio is never empty.

Because those paths are proxied, an item appears only when its icon exists upstream. Two
features of that page talk to the bot API directly for account data (saved kits, live
counters, server presets): signing in happens on the main site's domain, so those calls
cannot succeed from this domain and the page simply shows nothing there instead of failing.
