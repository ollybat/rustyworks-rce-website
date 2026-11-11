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

const command = {
  name: "dashboard",
  description: "Open your Spinback RCE dashboard (server owner only)",
  type: 1,                          /* CHAT_INPUT */
  dm_permission: false,             /* never in DMs */
  contexts: [0],                    /* GUILD only — no user-install */
  default_member_permissions: "0",  /* hidden from everyone except admins/owner */
};

const url = "https://discord.com/api/v10/applications/" + DISCORD_APPLICATION_ID +
  "/guilds/" + DISCORD_GUILD_ID + "/commands";

const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: "Bot " + DISCORD_BOT_TOKEN,
    "content-type": "application/json",
  },
  body: JSON.stringify(command),
});

console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
