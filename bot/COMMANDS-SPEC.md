# The command set the owner asked for

Written from the owner's own list on request. This file exists because the agent that wrote it cannot
push bot/commands.mjs (154 KB) or bot/server.mjs (157 KB), and holds no Discord token - so the site
side is live and this is the bot-side handoff.

Nothing here is invented. Where the owner did not give a description, this file says so instead of
guessing, and the site's command cards say "No description stated." in the same places.

## The rule that governs every command

Every command except the setup group runs in the game only once a Rust server is linked and its
connection has been tested. In the catalogue this is the needsSetup flag, and on the page it shows as
the badge "needs setup done" (5 of the 6 command groups carry it; setup itself does not).

## What to register

Six command groups, 37 subcommands. The names, exactly as given:

  /setup server | view | remove | edit | refresh
  /kits grab | config | give | refresh | authspawn | build | add
  /user linkpanel | forcelink | forceunlink | transfer
  /lookup
  /queue-skip give | remove | balance
  /server add-ban | remove-ban | kick | add-warn | remove-warn | mute-chat | unmute-chat |
          mute-voice | unmute-voice | list-bans | add-vip | remove-vip | add-moderator |
          remove-moderator | add-admin | remove-admin | add-owner | remove-owner

Authority, as given:

- /setup server needs Administrator or Manage Server.
- /kits grab and /kits config are KITMANAGER.
- The rest of the staff commands work from the roles saved in /setup server, which the owner listed as
  Owner (required), Co-Owner, Head Admin, Admin, Moderator, Linked (required).
- What /lookup, /user forcelink, /user forceunlink and /user transfer should do has not been described;
  ask before implementing rather than inventing behaviour.
- /kits config must offer: add, edit, remove and view binds, each with cooldowns and roles, up to 3 kits
  per emote, Lock Kits, and an Emote Guide.
- /kits build is Kit Studio: build a kit, import an install code, or choose from 18 pre-made kits.
- /kits add installs from a Base64 Kit Install Code. /kits grab copies the real kit names from the server.
- /kits authspawn gives one kit per Auth Group (User, VIP, Moderator, Admin, Owner) on respawn.
- /user linkpanel posts a panel with Link Account and Unlink buttons.
- /setup server's three steps are: roles, log channels, then the server's name, IP, RCON port and
  password, with the connection tested before anything is saved.
- Log channels the owner listed, 15 of them, each blankable to disable that log: Server, Console,
  Command, RCON Command Usage, Linking, Killfeed, EventFeed, Emote Kits, Admin, Zorp, Teleport, Clan,
  Catch-A-Ride, Join/Leave, Error.
- Server connections: 0/3 linked as given. The bot reconnects automatically within a minute.

## Registering it

The list lives in bot/commands.mjs as COMMANDS, and both bot/server.mjs at startup and
bot/register-commands.mjs send it as ONE PUT, which replaces the whole set. So the order to work in is:

1. build COMMANDS from the list above;
2. run node register-commands.mjs to push it without waiting for a redeploy - it prints the names it
   registered, which is the check that matters;
3. keep public/data/commands.json in step. Today it is written by hand from the same list; the durable
   fix is one generator that writes the JSON from COMMANDS, so the site and the bot cannot drift.

## What the site already does with this list

public/data/commands.json holds it (6 commands, 37 subcommands, empty goals), the Commands page draws it
through commands.js, and public/search.js indexes the same file, so the commands are already searchable
site-wide. Only the bot half is missing, and it is missing for one reason: the file that holds it is
bigger than the push ceiling of the agent writing this.
