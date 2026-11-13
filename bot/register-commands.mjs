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

/* Administrator (8) or Manage Server (32): the two ways to be allowed to configure the bot. */
const ADMIN_OR_MANAGE = String(8 | 32);
const payload = COMMANDS.map(function (cmd) {
  const copy = Object.assign({}, cmd, { dm_permission: false });
  if (cmd.name !== 'ping') copy.default_member_permissions = ADMIN_OR_MANAGE;
  return copy;
});

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
