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
  interactions-worker.js  The Discord bot: one /dashboard command, owner-only
  register-commands.mjs   Registers that command inside the single guild
docs/
  DISCORD-DASHBOARD.md    Setup, secrets and how the owner-only rules are enforced
```

## Local development

```bash
npm install
npm run dev      # http://localhost:8787
npm run build    # writes build/
npm run deploy   # publishes with wrangler
```

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

- the deployed host `rustyworks-rce-j7ao5f.camelai.app`, and the canonical, `og:url` and
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
