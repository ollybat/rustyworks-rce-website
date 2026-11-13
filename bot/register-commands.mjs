/* Registers the same command set that bot/server.mjs registers at startup, using the REST
   API directly. Handy for checking the payload without a redeploy: node register-commands.mjs
   The list itself lives in commands.mjs, so both paths always agree. */
import { COMMANDS } from './commands.mjs';

const token = (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '').trim();
const appId = (process.env.DISCORD_CLIENT_ID || '1570023832717361213').trim();
const guildId = (process.env.DISCORD_GUILD_ID || '').trim();

if (!token) {
  console.error('No bot token found in the environment (DISCORD_BOT_TOKEN / DISCORD_TOKEN / BOT_TOKEN).');
  process.exit(1);
}
if (!guildId) {
  console.error('No DISCORD_GUILD_ID set, so there is no guild to register commands in.');
  process.exit(1);
}

/* No default_member_permissions is sent on purpose: the roles saved in step 1 of setup are
   the staff roles, and the bot enforces that itself on every use. Sending an administrator
   requirement here would hide the staff commands from the very roles the server appointed. */
const payload = COMMANDS.map(function (cmd) { return Object.assign({}, cmd, { dm_permission: false }); });

const res = await fetch('https://discord.com/api/v10/applications/' + appId + '/guilds/' + guildId + '/commands', {
  method: 'PUT',
  headers: { authorization: 'Bot ' + token, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await res.json().catch(function () { return null; });
if (!res.ok) {
  console.error('Discord refused the registration (' + res.status + '):', JSON.stringify(body));
  process.exit(1);
}
console.log('registered ' + (Array.isArray(body) ? body.length : 0) + ' command(s): ' + (Array.isArray(body) ? body.map(function (c) { return '/' + c.name; }).join(', ') : ''));
