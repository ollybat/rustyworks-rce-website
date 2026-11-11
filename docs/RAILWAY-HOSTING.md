# Hosting the Spinback RCE bot on Railway

Two services, one project. The bot itself never needs a public URL; the small API service
next to it is what gives the website its numbers, so nothing on the site has to read the
operator's endpoints any more.

## 1. Before you touch Railway

1. Discord Developer Portal -> your application -> Bot -> copy the **bot token** (Reset if you
   have ever pasted it somewhere public).
2. Turn on the two privileged intents if the bot needs them: **Server Members** and
   **Message Content**. A kit/economy bot normally needs both.
3. Make sure the invite uses your application id 1570023832717361213 and the bot scope.

## 2. Create the project

1. railway.app -> New Project -> **Deploy from GitHub repo** (or Empty Project, then add the
   repo). Railway builds Node or Python automatically; a Dockerfile in the repo wins if there
   is one.
2. If the code is not on GitHub yet, push it first - Railway cannot deploy from a zip.
3. Optional: start from Railway's own Discord bot template instead (Node discord.js or
   Python discord.py) and drop your code in - the settings below are the same.

## 3. Variables

Set these in the service's Variables tab (never in the repository):

- DISCORD_TOKEN - the bot token from step 1
- Anything your bot already reads: database URL, owner ids, log channel ids
- STATUS_API_KEY - only if you also deploy the API service below

## 4. Settings that keep a bot alive

- **Replicas: 1.** Two bots sharing one token disconnect each other, so never scale up.
- **Keep sleeping off.** A Discord bot holds a websocket; a sleeping service drops it.
- **Restart policy: on failure.** A bot that crashes should come back by itself.
- No public networking needed for the bot - it makes outbound connections only.
- Logs tab is your friend: the first deploy tells you immediately if an intent or token is wrong.

## 5. The API service that feeds the website

Deploy a second service in the same project that exposes the numbers the site shows:

- GET /api/status -> online, version, uptime, and the totals (players, servers, guilds)
- GET /api/servers -> the server list your own bot knows about
- GET /api/kitbuilder/stats -> generated and saved kit counters
- GET /media/entitys/entities.json -> the item list the Kit Studio builds from
- GET /media/kitbuilder/<shortname>.png -> one icon per item
- GET /media/kitbuilder/presets/<name>.json -> the preset loadouts

Give it a Railway domain (Settings -> Networking -> Generate Domain), then tell me the address
and I will point every page, the Worker and the dashboard at it in one pass. The site already
keeps its own copy of anything it fetches, so a redeploy of your API cannot empty the studio.

## 6. Costs and reality checks

- Railway bills by usage; a small always-on bot fits comfortably in the trial credit and the
   Hobby plan, but a busy bot with a database costs more than nothing.
- Hosting moves the process, not the data: if the bot writes to SQLite on a container disk,
   attach a volume or it is wiped on every deploy.
- Your Discord token in Variables is encrypted at rest, but treat it as a secret anyway: reset
   it if it ever appears in a screenshot, log or repository.

## 7. What I still need from you

- The bot's repository (or a zip) and its language, so I can write the Dockerfile and the
   start command correctly.
- Whether the bot already has an HTTP API, or whether the API service above should be written
   from scratch - I can do that, with the same endpoints the site already calls.