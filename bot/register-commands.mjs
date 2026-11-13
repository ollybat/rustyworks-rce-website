#!/usr/bin/env node
/* ==========================================================================
   Register the single /dashboard command — run once, re-run after changes.

     DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... \
       node bot/register-commands.mjs

   It is registered *guild-scoped* (only that one server ever sees it) with
   default_member_permissions "0", which hides it from every member who is not
   an administrator — and the server owner always counts as one. dm_permission
   is false and contexts is [GUILD], so it cannot be used anywhere else.
   ========================================================================== */

const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
  console.error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID first.");
  process.exit(1);
}

const commands = [];   /* the /dashboard command was removed with the dashboard */

const url = "https://discord.com/api/v10/applications/" + DISCORD_APPLICATION_ID +
  "/guilds/" + DISCORD_GUILD_ID + "/commands";

/* PUT is Discord's bulk overwrite: the guild ends up with exactly this list. POST takes a
   single command object, so posting an array was always rejected with 400. */
const response = await fetch(url, {
  method: "PUT",
  headers: {
    authorization: "Bot " + DISCORD_BOT_TOKEN,
    "content-type": "application/json",
  },
  body: JSON.stringify(commands),
});

console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
