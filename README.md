# RustyWorks RCE — website

Static marketing site for **RustyWorks RCE**, the free Discord bot for Rust Console
Edition servers. Plain HTML, CSS and browser JavaScript — no build step beyond copying
`public/` into the deployable bundle.

## Structure

```
public/
  index.html            Homepage markup
  style.css             Full site stylesheet (theme tokens, every page, seasonal themes)
  sections.css          Homepage scene styles used by the homepage
  config.js             Runtime config (the bot API base URL)
  theme.js              Theme engine, seasons, "add to home screen"
  apiHelper.js          Small JSON helper for the bot API
  nav-auth.js           Header account widget: "Login" pill, or the signed-in capsule
  login.html            Sign-in page for the owner-only dashboard
  login.js              Keeps that page's button honest about the current session
  home.js               Homepage behaviour: nav, partners panel, scroll reveal,
                        live counts, hero video
  manifest.webmanifest  Web app manifest (installable "add to home screen")
  media/rustyworks-icon.svg  Site logo, favicon and app icon (name the stylesheet's
                             seasonal rules expect)
  robots.txt
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

## Notes

Images, fonts and the logo are original assets. RustyWorks RCE is not affiliated with
Facepunch Studios or Rust.
