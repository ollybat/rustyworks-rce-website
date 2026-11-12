# Bot + dashboard integration

The website and the bot share one rule set: **one server, one owner, one command.**

| Rule | Where it is enforced |
| --- | --- |
| Nobody but the server owner sees `/dashboard` | Command registration: guild-scoped, `default_member_permissions: "0"` (Discord hides it from everyone who is not an administrator, and the server owner always counts as one). |
| Nobody but the owner can use it | `bot/interactions-worker.js` compares `interaction.member.user.id` with `DISCORD_GUILD_OWNER_ID` and answers `{ type: 0 }` (no visible response) for anybody else. |
| One Discord server, one bot | The command is registered inside a single guild (`/applications/{app}/guilds/{guild}/commands`), `dm_permission: false`, `contexts: [0]` (guild only) — and every interaction from another guild is ignored. |
| Only the server owner can open the dashboard it links to | `worker.js` gates `/dashboard` behind a signed session cookie created from a Discord OAuth2 sign-in, and only for the account flagged `owner: true` on that guild. |

## 1. Discord application

1. https://discord.com/developers/applications → **New Application**.
2. **General Information** → copy the **Application ID** and **Public Key**.
3. **OAuth2** → copy the **Client Secret**; add redirect URIs:
   - `https://<your-site-host>/auth/callback`
   - `http://localhost:8787/auth/callback` (for local work)
4. **Bot** → copy the **Bot Token**.
5. Invite the bot to your one server with the `applications.commands` scope.

## 2. Site worker secrets

```bash
npx wrangler secret put DISCORD_CLIENT_SECRET   # OAuth2 client secret
npx wrangler secret put DISCORD_GUILD_ID        # the single server's ID
npx wrangler secret put SESSION_SECRET          # openssl rand -hex 32
```

`DISCORD_CLIENT_ID` is optional: the application id is public (it is in every invite
link on the site), so the Worker defaults to the bot's own id. Set it only if the
site is ever pointed at a different Discord application.

Until those three exist, `/dashboard` and `/dashboard/*` answer 503 with an
explanation and the rest of the site is unaffected — it fails closed rather than
guessing.

### Routes the site adds

| Route | Purpose |
| --- | --- |
| `/login.html` | The sign-in page. Reads `?next=`, calls `/auth/me` and swaps the button for "Continue as …" when a session already exists. |
| `/auth/login?next=` | Starts the Discord round trip; `next` is kept in a short-lived cookie and must be a same-site path. |
| `/auth/callback` | Exchanges the code, reads `/users/@me` and `/users/@me/guilds`, and only sets a session when that guild entry says `owner: true`. Anyone else is sent back to `/login.html?denied=1`. |
| `/auth/me` | Small JSON view of the current session, used by `nav-auth.js` and the login page. |
| `/auth/logout?next=` | Clears the cookie and returns to the site. |
| `/dashboard`, `/dashboard/*` | The owner-only area — the whole tree, not just the front page. |

## 3. Bot worker

Deploy `bot/interactions-worker.js` as its own Worker and point Discord at it:
**General Information → Interactions Endpoint URL** → `https://<bot-host>/`
(Discord verifies the endpoint by sending a signed PING; unsigned requests are
rejected with 401).

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY      # from General Information
npx wrangler secret put DISCORD_GUILD_ID        # the single server's ID
npx wrangler secret put DISCORD_GUILD_OWNER_ID  # your own Discord user ID
npx wrangler secret put SITE_URL                # https://<your-site-host>
```

Then register the command once:

```bash
DISCORD_BOT_TOKEN=… DISCORD_APPLICATION_ID=… DISCORD_GUILD_ID=… node bot/register-commands.mjs
```

## 4. Test checklist

- `/dashboard` is **not** in the command list for a non-admin member.
- The owner runs `/dashboard` → only they see the reply, with a link.
- Opening the link without signing in → Discord sign-in, then straight to the dashboard.
- Signing in with an account that is not the owner → "This dashboard is owner-only" (403).
- `GET /auth/logout` → session cleared, `/dashboard` asks for sign-in again.
- A deeper link such as `/dashboard/colortext.html`, opened while signed out, comes back
  to that same page after signing in (that is what `?next=` is for).
- Any interaction carrying another `guild_id` gets an empty response.

## 5. Where the rules come from

- Discord, *Application Commands*: `default_member_permissions` set to `"0"` disables a
  command "for everyone except admins"; members with the Administrator permission can use
  all commands. <https://docs.discord.com/developers/interactions/application-commands>
- Discord, *Command Permissions* (server side, per role and channel):
  <https://support-apps.discord.com/hc/en-us/articles/26501869403159-Command-Permissions>
- Discord, *Receiving and Responding to Interactions*: the `EPHEMERAL` flag
  `1 << 6` (64) makes a reply visible only to the person who ran the command; every
  interaction carries `guild_id` and the invoking `member`.
  <https://docs.discord.com/developers/interactions/receiving-and-responding>
- Discord, *OAuth2*: the `identify` and `guilds` scopes give `/users/@me` and
  `/users/@me/guilds`, and each guild entry carries `owner: true` for guilds the account
  owns — that flag is what the dashboard trusts. `state` must be a nonce tied to the
  request. <https://discord.com/developers/docs/topics/oauth2>
- Discord, *Guild Resource*: `owner` / `owner_id` fields on a guild.
  <https://docs.discord.com/developers/resources/guild>

## 6. Still to come

- The dashboard's own pages (configure, kits, colour tools) once the real page files
  are in the repo; `/dashboard` currently shows the owner card and live bot numbers.
- `media/rustyworks-icon-halloween.svg` and `media/rustyworks-icon-thanksgiving.svg` —
  the stylesheet swaps the logo for these in season. Christmas is live; add the other two
  and they can be switched on in `theme.js`.


## What goes where

Two different things read Discord values, and mixing them up is the usual reason a
dashboard stalls at the final step.

### The website (the app serving this site)

| Name | Value | State |
| --- | --- | --- |
| DISCORD_CLIENT_ID | 1570023832717361213 | optional - the application id is public and already the default |
| DISCORD_CLIENT_SECRET | Discord app -> OAuth2 -> Reset Secret | required |
| SESSION_SECRET | any long random string | required |
| DISCORD_GUILD_ID | 1553825462315257868 | set |
| BOT_API_ORIGIN | your own bot API address | set once your API exists |

The redirect URI registered on the Discord application must be exactly:

    https://spinback-j7ao5f.camelai.app/auth/callback

The Worker builds that address from the request origin, so it matches by construction on
this domain - and it will not match on any other domain without a second entry there.

### The bot's interactions endpoint

| Name | Value |
| --- | --- |
| DISCORD_PUBLIC_KEY | fe395110ba5053c6d6bc84f7c20cb069b391e6159b0160f8115f861823cbeac3 |
| DISCORD_GUILD_ID | 1553825462315257868 |
| DISCORD_GUILD_OWNER_ID | your own Discord user id |
| SITE_URL | https://spinback-j7ao5f.camelai.app |

The public key is not a secret: Discord signs each request with it and the endpoint uses it
to prove the request really came from Discord. Keep it in the bot's environment rather than
in a file, so a redeployed copy still points at the same application.

### While a required value is missing

The dashboard stays closed and says so, with the checklist at /dashboard. Nothing else on
the site is affected and no private data is exposed while it waits.

## Who is allowed in

Signing in proves identity; it does not grant access. The site reads your roles in the one
guild the bot serves (OAuth scope `guilds.members.read`) and decides from three things:

1. the guild owner flag - `owner === true` from `/users/@me/guilds`
2. server permissions on your account - Administrator (`0x8`) or Manage Server (`0x20`)
3. your role list - matched against the staff rules below

Anything else is refused with a page that names your roles and the user id, so the owner can
grant access without guessing.

### Staff rules, all optional environment variables on the website app

| Variable | What it matches |
| --- | --- |
| `STAFF_ROLE_IDS` | comma-separated role ids, exact |
| `STAFF_ROLE_NAMES` | comma-separated role names, case-insensitive |
| `STAFF_USER_IDS` | comma-separated user ids, treated as owner level |
| `STAFF_USERS` | comma-separated usernames or display names |

The built-in default admits a role or a person named **Astronomator**, so the console works
before any variable is set. `STAFF_ROLE_IDS` or `STAFF_ROLE_NAMES` is recommended once you
know the role's id - renaming a role would otherwise change who gets in.

### Finding the ids

1. Sign in at `/login.html` with an account that should have access. If it is refused, the
   page shows your user id and every role id you hold in the server.
2. Or read them from the bot: `GET /api/guild` returns the guild's roles as id/name pairs.
3. To see what the site currently thinks of you: `GET /api/roles` while signed in - it returns
   your level, your roles and the staff rules in force.

The `roleNames` in `/api/roles` come from the bot's `/api/guild`. If the bot is unreachable,
sign-in still works and role ids still match - only `STAFF_ROLE_NAMES` cannot be applied.

## The console

`/dashboard` **is** the console: a rail on the left, four panels behind it. It is served
from `worker.js` rather than from a file in `public/`, because Cloudflare hands an existing
asset straight to the visitor without waking the Worker - a file on disk would be readable by
anybody even though every endpoint behind it is gated.

| Panel | Where its numbers come from |
| --- | --- |
| Overview | the bot's own `/api/status` and `/api/guild`, asked at that moment |
| Rust server | what the owner typed in, stored in R2 |
| Roles & access | the staff rules in force, plus the Discord server's role list |
| Logs | one entry per event that really happened, naming who did it |

Endpoints (all need a staff session; anything that writes needs the owner):

```
GET    /api/owner/overview
GET    /api/owner/logs?limit=40
GET    /api/owner/staff
POST   /api/owner/staff     { kind: roleIds|roleNames|userIds|users, value }
DELETE /api/owner/staff     { kind, value }
GET    /api/owner/server
POST   /api/owner/server    { name, platform, region, rate, wipe, connect, joinUrl, statusUrl, notes }
POST   /api/owner/probe     { url }
```

Storage, in the same R2 bucket as the status history (binding `STATUS_LOG`):

```
spinback-rce/settings/server.json    the Rust server details
spinback-rce/settings/staff.json     staff rules added from the console
spinback-rce/logs/<timestamp>.json   one object per event, never overwritten
```

Honest limits: Console Edition publishes no server query endpoint, so the console shows no
live player count. "Check status URL" fetches whatever address is saved and reports only what
that address answered.

### Turning sign-in on without variables

`POST /api/setup` accepts the Discord client secret once, when the two secrets are not already
present as app variables. It is checked against Discord's token endpoint first - a wrong value
comes back as `invalid_client` and is refused - and only then stored in
`spinback-rce/settings/auth.json`, together with a session secret generated on the worker.
App variables still win whenever they are set, so moving the secrets into the platform later
simply takes over; the stored copy is then ignored.

`/api/config-check` reports `secretsSource`: `nowhere yet`, `saved on this site`, or `the app's
variables`.

### Who actually holds the Discord secret

The bot's service already had `DISCORD_CLIENT_SECRET`, so the website no longer needs its own
copy. `POST /api/oauth/exchange` on the bot swaps the sign-in code for a token; the worker
asks for it only when it has no secret of its own. A code that was not issued to this
application fails at Discord with `invalid_grant` before the request reaches anything else,
so the route cannot be used as an open proxy. A bogus code returning `invalid_grant` - rather
than `invalid_client` - is proof that the client id and secret pair is valid.

`/api/config-check` reports `botExchangeAvailable` and `secretsSource`, which reads
`the bot's service` while the exchange is delegated. The session secret is generated on the
worker and kept in this app's storage, so sessions survive a redeploy and nobody has to
invent one. Setting `DISCORD_CLIENT_SECRET` or `SESSION_SECRET` on this app still takes
priority over both.
