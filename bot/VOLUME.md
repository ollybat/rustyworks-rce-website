# Giving the bot a volume, so its settings survive a redeploy

Written for the Spinback RCE bot service on Railway. Everything here is the
smallest change that makes the bot's own saves durable without needing the
website token and without a database.

## The honest starting point

Today the bot has exactly one durable home: it POSTs its settings to this
website, which needs BOT_SETTINGS_TOKEN on the bot side AND on the site side.
That token is set on the bot service and NOT on the site, so the website
answers 503 no-token and the bot keeps everything in memory. Restart the
service and the servers, log channels, staff roles and kits are gone.

So: a volume by itself changes nothing. It is a disk. It only helps once the bot
is told to write its settings to it. That is step 3 below, and it is the part
that is worth doing.

## Step 1 - one variable, or the volume will look broken

Railway mounts volumes as the root user, and the bot image runs as the node
user, so a fresh mount is not writable by the process. Railway's documented fix
is one variable on the service:

    RAILWAY_RUN_UID=0

Set it in Service, Variables. Skip it and you will get a directory that exists,
looks mounted, and refuses every write - the worst kind of failure, because it
looks like persistence until the day it matters.

## Step 2 - attach the volume

Service, right click, Attach Volume (or the command palette, Cmd+K). Pick the
bot service, then set the mount path:

    /app/data

That is deliberate. Railway puts your application at /app, and its own guidance
is that an app writing to ./data should have the volume mounted at /app/data.
The Dockerfile already creates /app/data and gives it to the node user, so no
environment variable is needed at all with this path. If you would rather mount
somewhere else (say /data), set SETTINGS_DIR=/data - the module checks
SETTINGS_DIR, then DATA_DIR, then /app/data, then /data, then ./data.

## Step 3 - tell the bot to use it

bot/store-file.mjs is already written and pushed. It exports the same names as
bot/store-postgres.mjs, so the wiring is small. In bot/server.mjs:

1. next to the existing imports, add:

       import * as fileStore from './store-file.mjs';

2. in persistSettings(), save locally FIRST and treat that as the durable
   result, then try the website as a bonus. Today the function begins:

       async function persistSettings() {
         const token = settingsToken();
         if (!token) return { ok: false, detail: 'BOT_SETTINGS_TOKEN is not set ...' };

   That early return is exactly what makes a missing token mean "memory only".
   Call fileStore.saveSettings(settings) before it, keep its answer, and then -
   if the token is set - still POST to the website as now. Return ok when either
   home accepted the save, and put both outcomes in detail, for example:
   'file revision 4 in /app/data; website 503'.

3. in loadSettings(), after the website read gives nothing (no token, or an
   empty answer), fall back to fileStore.loadSettings() and apply it with the
   same field-by-field checks the website path already uses. If both are empty,
   change nothing - an empty store must never look like "clear the settings".

4. wherever the bot reports its storage kind (the website already shows one in
   /api/status), report the truth after this change, for example
   storage: 'website+file' or 'file' - not 'website' when the website refused.

Exact line numbers are deliberately absent: the copy of server.mjs in this
project is 98,438 bytes and the deployed one is larger, so the anchors above
(the persistSettings signature and that early return) are what to search for.
Search first, then patch:

    grep -n 'async function persistSettings' bot/server.mjs
    grep -n 'async function loadSettings' bot/server.mjs

## Step 4 - prove it, do not assume it

On the service shell:

    node volume-check.mjs

Expect "a mounted, writable directory is in use", the free space line, and
"wrote and read back volume-probe.json". Then redeploy and run it again: if the
first-seen time is still the earlier one, the volume is genuinely keeping data.
If it is missing, the mount path is wrong or the volume is attached to another
service.

Then prove the settings path itself: change one saved setting in Discord, run
node volume-check.mjs again for the token/database lines, and check that
settings.json exists, has a revision above 1, and that a second redeploy still
reports the same revision rather than starting again at 1.

## What a volume does not do

- It is one volume per service, one mount path. Do not scale this service to two
  replicas: both would fight over the same file. railway.json already sets
  numReplicas 1 - keep it that way, or give each replica its own volume.
- It does not survive deleting the volume. Railway queues a deleted volume for
  permanent deletion within 48 hours, and there is no undo in the bot's code.
- It is not a backup. It holds the same credentials the website copy holds, in
  plain text, mode 0600. If you want history, bot/store-file.mjs already writes
  an append-only settings.history.jsonl next to it (last 25 saves kept).
- It does not replace the website copy. Keep both: the website is what the site
  and the panels read, the file is what makes a restart harmless.
