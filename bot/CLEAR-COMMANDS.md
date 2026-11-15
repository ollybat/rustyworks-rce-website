# Clearing the bot's registered commands

Requested: delete the command set and start over. This file is for whoever can deploy the bot - the
agent who wrote it cannot push bot/commands.mjs (154 KB) or bot/server.mjs (157 KB), and holds no
Discord token, so the site half is done and this half is not.

## How the set actually gets to Discord (read from the code, not assumed)

- bot/commands.mjs exports COMMANDS; that array is the only source of the list.
- bot/server.mjs registers it at startup, and bot/register-commands.mjs does the same thing on demand
  for a check without a redeploy. Both send one PUT to
  https://discord.com/api/v10/applications/<appId>/guilds/<guildId>/commands
- A PUT replaces the whole set. It is not an add. Sending an empty array therefore removes every
  command the bot has registered in that guild, in one call.

## To clear them now

Either of these works:

1. Preferred: while the new list is being written, put the new commands in bot/commands.mjs and let the
   next deploy register them. An empty array registers nothing, so the order does not matter - you can
   set COMMANDS = [] today and fill it in later.

2. Without touching the bot: run one PUT with an empty body from anywhere with the bot token, e.g.

       curl -X PUT "https://discord.com/api/v10/applications/$APP_ID/guilds/$GUILD_ID/commands" \
         -H "Authorization: Bot $DISCORD_BOT_TOKEN" -H "Content-Type: application/json" -d "[]"

   The next boot of server.mjs will PUT the list from commands.mjs again, so pair this with step 1
   unless you want the old set to come straight back.

## What stops working, so nobody is surprised

- Every slash command disappears from every server the bot is in, /setup included. The bot stays online
  and keeps running; users simply have no commands until a new set is registered.
- This site's Get started page still describes the old flow (it names /setup run and the setup panels).
  Those pages need rewriting once the new set exists, and that is deliberate: they are not cleared here,
  because the request was the command list.
- public/data/commands.json is already cleared, and the Commands page says so plainly.
- The bot keeps its own saved settings; clearing commands touches nothing else.

## How to check it worked

    node register-commands.mjs

prints the list Discord now holds. After clearing it should print "registered 0 command(s)". Discord's
own command list, or a GET to the same URL, shows the same thing. If the old set comes back after a
redeploy, the COMMANDS array was not the one being sent.
