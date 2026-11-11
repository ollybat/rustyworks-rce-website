# Hosting the Spinback RCE bot on Railway

## What runs where

| Piece | Where it runs | Files |
| --- | --- | --- |
| Website | Cloudflare Worker (already live at https://spinback-j7ao5f.camelai.app) | `worker.js`, `public/` |
| Bot | One Node service on Railway, built from a Dockerfile | `bot/server.mjs`, `bot/Dockerfile`, `railway.json` |

One repo, two hosts. Railway builds only from `bot/`, so the website never has to move.

## Why the bot used to look offline

`bot/server.mjs` was an *interactions endpoint*: it answered Discord's signed POSTs and nothing
else. A process like that holds no gateway connection, so Discord has nothing to display in the
member list and the bot shows as offline forever, even though the command works. That is what
was happening.

`bot/server.mjs` now does both jobs:

1. logs in to the Discord gateway with `DISCORD_BOT_TOKEN`, sets a presence, and answers
   `/dashboard` over the gateway;
2. still serves the signed interactions route as a fallback (same rules, unchanged handler);
3. answers `GET /healthz`, which is what Railway watches.

## 1. Discord Developer Portal

1. **Bot** -> **Reset Token** -> copy it. Treat it as a password: it can log in as your bot.
2. No privileged intents are needed. The bot asks Discord for the `Guilds` intent only.
3. **Interactions Endpoint URL**: leave it **empty**. With the gateway connected, Discord
   delivers commands over the gateway. If you already set it, the fallback route still answers
   `/dashboard` with the same owner-only rules, but the gateway is what makes it appear online.
4. Keep the invite on application id `1570023832717361213` with the `bot` and
   `applications.commands` scopes.

## 2. Railway

1. railway.app -> **New Project** -> **Deploy from GitHub repo** -> `ollybat/rustyworks-rce-website`.
2. Leave **Root Directory empty**. `railway.json` in the repo root pins the builder to
   `DOCKERFILE` with `bot/Dockerfile`, and the health check to `/healthz`. An empty root means
   Railpack never runs.
3. **Variables** (service -> Variables -> Raw Editor):

   | Variable | Value |
   | --- | --- |
   | `DISCORD_BOT_TOKEN` | the token from step 1 - **required, this is what makes it online** |
   | `DISCORD_GUILD_ID` | `1553825462315257868` |
   | `DISCORD_GUILD_OWNER_ID` | your own Discord user id (the only person who may run `/dashboard`) |
   | `SITE_URL` | `https://spinback-j7ao5f.camelai.app` |
   | `DISCORD_PUBLIC_KEY` | `fe395110ba5053c6d6bc84f7c20cb069b391e6159b0160f8115f861823cbeac3` (optional, only for the fallback route) |

   Nothing else is required. No database, no volume, no public API.

4. **Replicas: 1.** Two processes on one token disconnect each other in a loop.
5. **Restart policy: on failure**, and keep sleeping off: a sleeping service drops its socket.
6. Deploy, then read the **Logs** tab. A healthy first boot prints:

   ```
   [spinback] listening on 8080 — health at /healthz
   [spinback] logged in as <name>#<discriminator> — in 1 guild(s)
   [spinback] /dashboard registered in <server> (visible to administrators only)
   ```

   If it logs `DISCORD_BOT_TOKEN is not set`, the variable is missing or the service has not
   redeployed since you added it. If it logs `login failed`, the token is wrong or another
   process is already using it.

7. Health check: open `https://<your-service-domain>.up.railway.app/healthz`. You want
   `"ok": true` and `"gateway": "online"`. `"no-token"` or `"login-failed"` tells you exactly
   which piece is missing, and `"command"` shows the registered `/dashboard` id.

## 3. The command

The bot registers `/dashboard` itself on every start, so there is nothing to run by hand.
`bot/register-commands.mjs` is kept only as a manual fallback for when you want to register
without starting the gateway:

```
DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=1570023832717361213 DISCORD_GUILD_ID=1553825462315257868 node bot/register-commands.mjs
```

## 4. Why the site's bot panels are still quiet

The website reads live bot numbers from `BOT_API_ORIGIN`, which is not set, so `/api/status`
answers `503 not_connected` and the site says so instead of inventing numbers. The gateway bot
in this repository is a command bot; it exposes no HTTP API. When an API service exists (or when
the bot is given one), set `BOT_API_ORIGIN` in the website's environment and every panel fills
in on the next request.

## 5. Costs and gotchas

- Railway bills by usage; a small always-on bot fits the trial credit and the Hobby plan.
- Never commit the token. If it appears in a screenshot, log or repo, reset it.
- One bot, one guild. The handler refuses commands from any other server, on purpose.