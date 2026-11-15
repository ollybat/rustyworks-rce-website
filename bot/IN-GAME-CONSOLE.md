# In-game console commands from Discord - proposal

Written 2026-11-28 for whoever can push bot/server.mjs and bot/commands.mjs (both are over the
push ceiling of the agent that wrote this, so this file is a spec, not a patch).

## What the request was

"make all commands run like in game commands and api and much more".

Three separable things fell out of that, and only the third is done:

1. an in-game console runner - a Discord command that sends a real Rust Console Edition admin
   console line over RCON and shows what came back (the "like in game commands" part);
2. parity - every command the bot registers actually runs, and the site's
   public/data/commands.json keeps matching what is registered, so the Commands page cannot lie;
3. a public, read-only API - DONE and live (see the bottom of this file).

## 1. The console runner

### What already exists to build on

- server.mjs holds the RCON path and the per-server settings (settings.servers), and already
  knows the password per server. applySettings(sections) is the writer; settings are queued
  per-section by persistSettings.
- bot/network-guard.mjs (isPublicAddress) already refuses private and special-purpose addresses
  for outbound RCON. Outbound only - keep it.
- The /server command group already reads a server. A console runner is a sibling subcommand,
  not a new architecture.
- The site never sees any of this. It is Discord-only, and the API stays read-only.

### Shape

  /server console   server:<choice>   command:<string>   [ephemeral]

- Require the same staff authority the rest of the bot uses: the saved STAFF_ROLE_RECIPES ids,
  or Administrator / Manage Server / guild owner. Read the existing check and call it; do not
  write a second copy of that rule.
- Ephemeral by default. Console output is for the admin who asked, not the channel.
- Echo the exact line that was sent, in a code block, before the output. If the line is refused,
  say which allowlist entry refused it.

### Safety, in the order it should happen

1. Length cap on the command string (a few hundred characters is plenty for a console line).
2. Refuse newline and CR outright. One command per invocation, never a batch - a pasted block
   must not become several commands.
3. Allowlist, not blocklist. Suggested first set, all read-mostly, all safe to repeat:
     say, server.info, server.save, players, banlist, server.writecfg
   server.writecfg is listed because it is what makes a config change stick, and it is worth
   gating behind a second confirmation rather than being reachable in one keystroke.
4. Refuse anything that can end a session or the process: quit, exit, restart, server.stop,
   ownerid changes. Refusing these is a feature, not a limitation, and the refusal message
   should say so and point at /setup.
5. Output cap. RCON replies can be enormous (player lists especially). Truncate to a few
   thousand characters, say how much was cut, and never chunk a reply into a channel flood.
6. Redaction pass on the way out: the RCON password, the settings token, and anything that
   looks like a Bearer token must never appear in a reply, even if a console command echoes it.
7. Log it. A console line is an administrative action: record who, which server, which line,
   what it returned (truncated), and put it where the other admin actions are logged.

### The parity half

- registers exactly the commands in public/data/commands.json, and that file is regenerated from
  the registration table rather than hand-edited. Right now the site's copy is a careful hand
  transcription: it is correct today and it can drift tomorrow. A generator is the durable fix.
- Give subcommands their conventional aliases where Rust admins expect them, and put those
  aliases in commands.json too, so the Commands page can show them.
- /ping should report the last settings save outcome, not just reachability (already item 2 in
  bot/NEXT-PATCHES.md). A console runner is not trustworthy until a save is known to have landed.

## 2. What the API part became

Shipped and live today:

- https://spinback-j7ao5f.camelai.app/api.html - the list, written for people.
- https://spinback-j7ao5f.camelai.app/data/api.json - the same list, machine-readable.
- sitemap.xml updated; footer links to it on every page that loads page.js.

It documents the bot's live endpoints (/api/status, /api/shim, /api/guilds) and marks
/api/servers as not published yet - which it is, until the corrected step 1 in
bot/servers-endpoint.patch lands. It repeats one rule that matters more than the endpoints:
nothing in it writes anything, ever.

## 3. Open decisions (need the bot owner, not an agent)

- Which console lines belong on the allowlist above the first set.
- Whether server.writecfg needs a second confirmation, and in what form.
- Whether console output should ever be visible to a channel (default: no).
- Whether a console runner is wanted at all, or whether /server's existing read path is
  already enough. It is a genuinely powerful command and it should be an explicit choice.
