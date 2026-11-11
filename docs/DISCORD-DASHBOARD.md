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
npx wrangler secret put DISCORD_CLIENT_ID       # Application ID
npx wrangler secret put DISCORD_CLIENT_SECRET   # OAuth2 client secret
npx wrangler secret put DISCORD_GUILD_ID        # the single server's ID
npx wrangler secret put SESSION_SECRET          # openssl rand -hex 32
```

Until all four exist, `/dashboard` answers 503 with an explanation and the rest of
the site is unaffected — it fails closed rather than guessing.

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
