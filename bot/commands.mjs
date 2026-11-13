/* Spinback RCE slash commands.

   Payloads here are raw Discord JSON rather than discord.js component classes, so this module
   cannot fail to load because a class name moved between versions. Every number shown to a
   person is measured: gateway latency, uptime, memory and the website check all come from the
   running process or a real request. Where the bot cannot know something - a server kit list,
   the name of a plugin command - it says so instead of inventing it. */

export const LOG_TYPES = [
  ["server", "Server log"], ["console", "Console log"], ["command", "Command log"],
  ["rcon", "RCON command usage"], ["linking", "Linking log"], ["killfeed", "Killfeed log"],
  ["eventfeed", "EventFeed log"], ["emoteKits", "Emote Kits log"], ["admin", "Admin log"],
  ["zorp", "Zorp log"], ["teleport", "Teleport log"], ["clan", "Clan log"],
  ["catchARide", "Catch-A-Ride log"], ["joinLeave", "Join and leave log"], ["errors", "Error log"],
];
export const ROLE_SLOTS = [
  ["owner", "Owner"], ["coOwner", "Co-Owner"], ["headAdmin", "Head Admin"],
  ["admin", "Admin"], ["moderator", "Moderator"], ["linked", "Linked"],
];
export const AUTH_GROUPS = ["User", "VIP", "Moderator", "Admin", "Owner"];
const EPH = 64;
const BT = String.fromCharCode(96);

export const COMMANDS = [
  { name: "ping", description: "Bot and website health, measured right now", dm_permission: false },
  { name: "help", description: "What every command does, and what each one needs set up first", dm_permission: false,
    options: [
      { type: 3, name: "command", description: "Open one command own help page straight away",
        choices: [{ name: "ping", value: "ping" }, { name: "help", value: "help" }, { name: "setup", value: "setup" },
          { name: "kits", value: "kits" }, { name: "user", value: "user" }, { name: "server", value: "server" }] },
    ] },
  { name: "setup", description: "Configure Spinback RCE for this server", dm_permission: false,
    options: [
      { type: 1, name: "run", description: "Guided setup: roles, logging channels, then your Rust server" },
      { type: 1, name: "roles", description: "Pick your staff roles from a list: no ids to copy" },
      { type: 1, name: "channels", description: "Logging channels: pick them, or let the bot create them" },
      { type: 1, name: "server", description: "Add or change the Rust server, tested before it is saved" },
      { type: 1, name: "suggest", description: "Read the role and channel names here and propose a full setup" },
      { type: 1, name: "doctor", description: "Health check: measure every saved setting and list what to fix" },
      { type: 1, name: "import", description: "Paste your server.cfg RCON lines and let the bot read them" },
      { type: 1, name: "export", description: "Your saved settings as copyable text, with no passwords in it" },
      { type: 1, name: "reset", description: "Clear the saved settings again, after typing a confirmation" },
      { type: 1, name: "status", description: "Checklist of what is saved and what is still missing" },
      { type: 1, name: "edit", description: "Change a saved server IP, RCON port or password" },
      { type: 1, name: "refresh", description: "Force a fresh RCON connection and report what the server says",
        options: [{ type: 3, name: "server", description: "Server name to test (leave blank for the first saved one)" }] },
    ] },
  { name: "kits", description: "Emote kits: binds, cooldowns, giving and installing", dm_permission: false,
    options: [
      { type: 1, name: "grab", description: "Read the real kit names from the Rust server" },
      { type: 1, name: "config", description: "Emote kit wizard: binds, cooldowns, roles, lock kits, emote guide" },
      { type: 1, name: "commands", description: "Set your kit plugin own list command and give template" },
      { type: 1, name: "doctor", description: "Check the kit settings and see exactly what is still missing" },
      { type: 1, name: "give", description: "Give a kit to a gamertag or a linked Discord user",
        options: [
          { type: 3, name: "kit", description: "Kit name (leave blank to open the panel)" },
          { type: 3, name: "gamertag", description: "In-game name to give it to" },
          { type: 6, name: "user", description: "Discord user whose linked gamertag receives it" },
        ] },
      { type: 1, name: "refresh", description: "Clear kit cooldowns",
        options: [
          { type: 3, name: "scope", description: "What to clear (leave blank to open the panel)",
            choices: [{ name: "One user", value: "user" }, { name: "One kit", value: "kit" },
              { name: "All linked users", value: "all-users" }, { name: "All kits", value: "all-kits" }] },
          { type: 3, name: "target", description: "Gamertag or kit name, when the scope needs one" },
        ] },
      { type: 1, name: "auth-spawn", description: "Give a kit to an Auth Group on every respawn",
        options: [
          { type: 3, name: "group", description: "Auth group (leave blank to open the panel)",
            choices: AUTH_GROUPS.map(function (g) { return { name: g, value: g }; }) },
          { type: 3, name: "kit", description: "Kit to hand out (blank stops giving one)" },
        ] },
      { type: 1, name: "cooldowns", description: "See the kit cooldown records the bot is holding" },
      { type: 1, name: "build", description: "Kit Studio: build a kit on the website or work from an install code" },
      { type: 1, name: "add", description: "Install a kit from a Base64 kit install code",
        options: [{ type: 3, name: "code", description: "The Base64 install code (blank opens the panel)" }] },
    ] },
  { name: "user", description: "Player links: who is who in your clan", dm_permission: false,
    options: [
      { type: 1, name: "whois", description: "Look up which Discord account is behind a gamertag",
        options: [{ type: 3, name: "gamertag", description: "Gamertag, or part of one" }] },
      { type: 1, name: "pending", description: "Link requests waiting for confirmation, with approve and reject" },
      { type: 1, name: "forcelink", description: "Link a Discord user to a gamertag yourself" },
      { type: 1, name: "forceunlink", description: "Remove a player link" },
      { type: 1, name: "transfer", description: "Move a link to a new Discord account or a new gamertag" },
      { type: 1, name: "linkpanel", description: "Post a panel with Link Account and Unlink buttons in a channel",
        options: [{ type: 7, name: "channel", description: "Channel to post it in", channel_types: [0] }] },
      { type: 1, name: "roster", description: "See every linked player" },
    ] },
  { name: "server", description: "Ask your Rust server over RCON without changing anything", dm_permission: false,
    options: [
      { type: 1, name: "info", description: "Name, players online, map and uptime, as the server reports them" },
      { type: 1, name: "players", description: "The names and ping the server reports for everyone online" },
      { type: 1, name: "time", description: "The in-game clock" },
      { type: 1, name: "status", description: "The server's own status answer, exactly as it arrives" },
      { type: 1, name: "check", description: "Open a fresh RCON connection now and time it" },
    ] },
];

function embed(c, t, d) { return { color: c, title: t, description: d }; }
function field(n, v, i) { return { name: n, value: v, inline: !!i }; }
function row(c) { return { type: 1, components: c }; }
function button(id, label, style) { return { type: 2, custom_id: id, label: label, style: style || 2 }; }
function link(label, url) { return { type: 2, style: 5, label: label, url: url }; }
function input(id, label, value, required) {
  return { type: 4, custom_id: id, label: label, style: 1, required: !!required, value: value || undefined, max_length: 220 };
}
function area(id, label, value, required) {
  return { type: 4, custom_id: id, label: label, style: 2, required: !!required, value: value || undefined, max_length: 2000 };
}
function roleSelect(id, placeholder, minValues) {
  return { type: 6, custom_id: id, placeholder: placeholder, min_values: minValues === undefined ? 1 : minValues, max_values: 1 };
}
function channelSelect(id, placeholder, kinds) {
  return { type: 8, custom_id: id, placeholder: placeholder, channel_types: kinds || [0, 5] };
}
function stringSelect(id, placeholder, options, minValues, maxValues) {
  return { type: 3, custom_id: id, placeholder: placeholder, min_values: minValues === undefined ? 1 : minValues,
    max_values: maxValues || 1, options: options };
}
function when() { return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"; }
function ms(n) { return Number.isFinite(n) ? Math.round(n) + " ms" : "not measured"; }
function code(text) { return BT + text + BT; }
function block(text) { return BT + BT + BT + "\n" + text + "\n" + BT + BT + BT; }
function duration(s) {
  var n = Math.max(0, Math.floor(s));
  var d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60);
  if (d) return d + "d " + h + "h " + m + "m";
  if (h) return h + "h " + m + "m";
  return m + "m " + (n % 60) + "s";
}
export function formatBytes(b) { return (Math.round((b / 1048576) * 10) / 10) + " MB"; }

/* /ping -------------------------------------------------------------------- */
export async function pingReply(ctx) {
  var started = Date.now();
  var site = { ok: false, ms: null, body: null, error: null };
  try {
    var res = await fetch(ctx.siteUrl + "/api/config-check", { headers: { accept: "application/json" } });
    site.ms = Date.now() - started;
    site.ok = res.ok;
    try { site.body = await res.json(); } catch (e) { site.body = null; }
  } catch (error) { site.ms = Date.now() - started; site.error = String((error && error.message) || error); }
  var proc = process.memoryUsage();
  var gw = ctx.ping();
  var guild = ctx.guildInfo;
  /* The setup row below is read from what is saved here, so it costs nothing and cannot lie:
     a saved role or channel that no longer exists in the guild is counted as gone, and a
     channel the bot cannot post in is counted separately. Pressing Health check is what
     measures the servers, because that opens real connections. */
  var pingRoles = ctx.settings.staffRoles || {};
  var pingChannels = ctx.settings.logChannels || {};
  var pingServers = ctx.servers();
  var savedSlots = ROLE_SLOTS.filter(function (s) { return s[0] !== "linked" && pingRoles[s[0]]; });
  var goneSlots = guild ? savedSlots.filter(function (s) {
    return !(guild.roles || []).filter(function (r) { return String(r.id) === String(pingRoles[s[0]]); }).length;
  }) : [];
  var setTypes = LOG_TYPES.filter(function (t) { return pingChannels[t[0]]; });
  var cannotPost = guild ? setTypes.filter(function (t) {
    var found = (guild.channels || []).filter(function (c) { return String(c.id) === String(pingChannels[t[0]]); })[0];
    return found && found.canSend === false;
  }) : [];
  var pingGate = setupState(ctx);
  var built = embed(0x5865f2, "Spinback RCE", "Every line was measured just now, at " + when() + ".");
  var lastCheck = ctx.lastServerCheck && ctx.lastServerCheck();
  built.fields = [
    field("Gateway", code(Number.isFinite(gw) && gw >= 0 ? gw + " ms" : "not measured") + " heartbeat\n" +
      (ctx.gateway === "online" ? "connected" : ctx.gateway || "unknown"), true),
    field("Uptime", code(duration(ctx.uptime())), true),
    field("Node", code(process.version), true),
    field("Memory", code(formatBytes(proc.rss)) + " resident\n" + code(formatBytes(proc.heapUsed)) + " heap", true),
    field("Guild", guild ? code(guild.name) + "\n" + guild.memberCount + " members, " + ((guild.roles && guild.roles.length) || 0) + " roles" : "not reported yet", true),
    field("Commands", code(String(ctx.commandCount())) + " registered here", true),
    field("Last server check", lastCheck
      ? (lastCheck.ok ? "answered" : "did not answer") + " " + code(String(lastCheck.host || "unknown") + ":" + String(lastCheck.port || 0))
        + (lastCheck.ms == null ? "" : " in " + ms(lastCheck.ms)) + " • " + String(lastCheck.at || "").slice(0, 19).replace("T", " ")
      : "not checked since the bot started", false),
    field("Website", site.ok ? "answering, " + ms(site.ms) + (site.body && site.body.app ? "\napp: " + code(site.body.app) : "") : "no answer after " + ms(site.ms) + (site.error ? "\n" + site.error.slice(0, 90) : ""), true),
    field("Settings store", ctx.storeTokenSet() ? "the website accepts saves from this bot" : "not configured yet (BOT_SETTINGS_TOKEN)", true),
    field("Servers linked", code(String(pingServers.length)) + (pingServers.length ? "\n" + pingServers.map(function (s) { return s.host + ":" + s.port; }).join(", ").slice(0, 120) : "\nnone yet"), true),
    field("Staff roles", code(savedSlots.length + " of " + ROLE_SLOTS.length) + " slots" + (goneSlots.length ? "\n" + goneSlots.length + " point at a role that is gone" : "") + (guild ? "" : "\nthe role list has not arrived yet"), true),
    field("Log channels", code(setTypes.length + " of " + LOG_TYPES.length) + " log types" + (cannotPost.length ? "\n" + cannotPost.length + " the bot cannot post in" : "") + (guild ? "" : "\nthe channel list has not arrived yet"), true),
    field("Setup gate", pingGate.complete ? "passed: staff commands are unlocked" : "still closed: " + (pingGate.rolesSaved ? "" : "no staff role saved. ") + (pingGate.serverLinked ? "" : "no tested Rust server linked."), true),
    field("How the check works", "one harmless command (serverinfo) over RCON, and whatever the server answers is what you see. Nothing here is estimated.", false),
  ];
  if (!pingGate.complete) built.fields.push(field("Next step", "Press **Start setup** below, or run **/setup doctor** for a health check that measures every saved setting and lists what to fix first.", false));
  built.footer = { text: "Site: " + ctx.siteUrl + " | checked at " + when() };
  var buttons = [button("ping:again", "Check again", 1)];
  if (!pingGate.complete) buttons.push(button("setup:roles", "Start setup", 3));
  buttons.push(button("setup:doctor", "Health check", 2));
  buttons.push(link("Commands reference", ctx.siteUrl + "/commands.html#cmd-setup"));
  return { embeds: [built], components: [row(buttons)], flags: EPH };
}

/* /setup ------------------------------------------------------------------- */
export function setupPanel(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var setRoles = ROLE_SLOTS.filter(function (s) { return roles[s[0]]; });
  var channels = ctx.settings.logChannels || {};
  var setChannels = LOG_TYPES.filter(function (s) { return channels[s[0]]; });
  var servers = ctx.servers();
  var built = embed(0xfaa81a, "Spinback RCE setup",
    "Three steps: roles, logging channels, then your Rust server. The RCON connection is tested before anything is saved, so a wrong port or password never lands in your settings.");
  var progress = (ROLE_SLOTS.filter(function (slot) { return slot[0] !== "linked" && roles[slot[0]]; }).length ? 1 : 0)
    + (setChannels.length ? 1 : 0) + (servers.length ? 1 : 0);
  built.fields = [
    field("Setup progress", progress + " of 3 steps complete", true),
    field("Step 1 - Staff roles", setRoles.length ? setRoles.map(function (s) { return s[1] + ": <@&" + roles[s[0]] + ">"; }).join("\n") : "none saved yet", false),
    field("Step 2 - Logging channels", setChannels.length ? setChannels.length + " of " + LOG_TYPES.length + " log types have a channel" : "none saved yet", false),
    field("Step 3 - Rust servers", servers.length ? servers.map(function (s) { return code(s.name + " " + s.host + ":" + s.port); }).join("\n") : "none linked yet", false),
  ];
  built.fields.push(field("Not sure where to start",
    "Press **Find them for me**: the bot reads the role and channel names in this server, proposes a match for each slot and each log type, and shows you the whole list before anything is saved. **Health check** then measures everything it can reach and says what to fix first.", false));
  built.footer = { text: "Admin or Manage Server. Panels are ephemeral, and passwords are never shown back to you." };
  return { embeds: [built], components: [
    row([button("setup:roles", "1. Staff roles", 1), button("setup:channels", "2. Log channels", 1), button("setup:server", "3. Rust server", 1)]),
    row([button("setup:suggest", "Find them for me", 2), button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2)]),
    row([button("setup:import", "Import server.cfg", 2), button("setup:export", "Export settings", 2), button("setup:reset", "Reset", 4)]),
  ], flags: EPH };
}
export function rolesModal() {
  return { title: "Staff roles", custom_id: "modal:roles",
    components: ROLE_SLOTS.slice(0, 5).map(function (s) { return row([input("role_" + s[0], s[1] + " role id", "", false)]); }) };
}
export function linkedRoleModal() {
  return { title: "Linked role", custom_id: "modal:linked",
    components: [row([input("role_linked", "Role id for linked players", "", false)])] };
}
export function logTypeMenu() {
  return { embeds: [embed(0x3ba55d, "Logging channels", "Choose a log type, then pick its channel. A type with no channel is simply switched off.")],
    components: [row([{ type: 3, custom_id: "setup:logtype", placeholder: "Which kind of log?",
      options: LOG_TYPES.slice(0, 25).map(function (p) { return { label: p[1], value: p[0] }; }) }])], flags: EPH };
}
export function channelMenu(typeKey) {
  var found = LOG_TYPES.filter(function (p) { return p[0] === typeKey; })[0];
  return { embeds: [embed(0x3ba55d, "Pick a channel", "Log type: **" + (found ? found[1] : typeKey) + "**")],
    components: [row([{ type: 8, custom_id: "setup:channel:" + typeKey, placeholder: "Where should these logs go?", channel_types: [0, 5] }])], flags: EPH };
}
export function serverModal(existing) {
  var e = existing || {};
  return { title: existing ? "Edit Rust server" : "Add a Rust server",
    custom_id: "modal:server" + (existing ? ":" + e.id : ""),
    components: [
      row([input("srv_name", "Server name", e.name || "", !existing)]),
      row([input("srv_host", "Server IP or host", e.host || "", true)]),
      row([input("srv_port", "RCON port", e.port ? String(e.port) : "", true)]),
      row([input("srv_pass", "RCON password", "", !existing)]),
    ] };
}
export function serverPicker(ctx) {
  var servers = ctx.servers();
  if (!servers.length) return { embeds: [embed(0xdc4c4c, "No server saved yet", "Add one with **3. Rust server** on the setup panel.")],
    components: [row([button("setup:server", "Add a server", 1)])], flags: EPH };
  return { embeds: [embed(0xfaa81a, "Which server?", "Choose one. The check opens a fresh RCON connection.")],
    components: [row([{ type: 3, custom_id: "setup:pick", placeholder: "Saved servers",
      options: servers.slice(0, 25).map(function (s) { return { label: s.name.slice(0, 90), value: s.id, description: (s.host + ":" + s.port).slice(0, 90) }; }) }])], flags: EPH };
}
export async function testAndSaveServer(ctx, data, existingId) {
  var host = String(data.srv_host || "").trim();
  var port = Number(String(data.srv_port || "").trim());
  var password = String(data.srv_pass || "");
  var name = String(data.srv_name || "").trim() || (existingId ? "server" : host);
  var answer = await ctx.rconTest({ host: host, port: port, password: password, command: "serverinfo" });
  if (!answer || answer.ok !== true) {
    return { embeds: [embed(0xdc4c4c, "Not saved - the connection failed",
      "**" + host + ":" + port + "** did not answer the check, so nothing was written.\n\nReason: " +
      code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 400))],
      components: [row([button("setup:server", "Try again", 1)])], flags: EPH };
  }
  var saved = await ctx.saveServer({ id: existingId, name: name, host: host, port: port, password: password });
  var lines = String(answer.answer || "").split("\n").slice(0, 6).join("\n");
  var built = embed(0x3ba55d, existingId ? "Server updated" : "Server linked and tested",
    "**" + name + "** answered " + code(answer.command || "serverinfo") + " in " + ms(answer.ms) + ".\n" +
    (saved.ok ? "Saved to the website." : "Kept in this bot memory only: " + saved.detail));
  if (lines) built.fields = [field("What the server said", block(lines.slice(0, 900)), false)];
  return { embeds: [built], components: [row([button("setup:test", "Test again", 2), button("setup:server", "Add another", 2)])], flags: EPH };
}
export async function testServerByName(ctx, name) {
  var wanted = String(name || "").trim();
  var server = ctx.servers().filter(function (s) { return s.name === wanted; })[0] || ctx.servers()[0];
  if (!server) return { embeds: [embed(0xdc4c4c, "No server linked", "Link one first with /setup run.")], flags: EPH };
  var answer = await ctx.rconTest({ host: server.host, port: server.port, password: server.password, command: "serverinfo" });
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c,
    answer && answer.ok ? "A fresh connection works" : "A fresh connection failed",
    "**" + server.name + "** (" + server.host + ":" + server.port + ") " +
    (answer && answer.ok ? "answered in " + ms(answer.ms) + "." : "did not answer."));
  if (answer && answer.ok && answer.answer) built.fields = [field("What it said", block(String(answer.answer).slice(0, 900)), false)];
  if (answer && !answer.ok) built.fields = [field("Reason", code(answer.reason || "unknown") + "\n" + String(answer.detail || "").slice(0, 400), false)];
  return { embeds: [built], flags: EPH };
}

/* /server ------------------------------------------------------------------ */
/* Four read-only questions, answered by your Rust server itself. The bot only ever asks the
   commands on its fixed allowed list, so nothing here can change a game. Whatever comes back
   is printed exactly as it arrived, with the round trip next to it: if a host answers with
   something unexpected, you see that rather than a tidy summary the bot made up. */
const SERVER_QUESTIONS = [
  ["info", "serverinfo", "What the server says about itself: name, players online, map and uptime"],
  ["players", "playerlist", "The names and ping the server reports for everyone online"],
  ["time", "gettime", "The in-game clock"],
  ["status", "status", "The server's own status answer, exactly as it arrives"],
  ["check", "serverinfo", "Open a fresh connection right now and time it"],
];
function serverQuestion(which) {
  var wanted = String(which || "info").toLowerCase();
  for (var i = 0; i < SERVER_QUESTIONS.length; i++) if (SERVER_QUESTIONS[i][0] === wanted) return SERVER_QUESTIONS[i];
  return SERVER_QUESTIONS[0];
}
export async function serverSnapshot(ctx, which) {
  var question = serverQuestion(which);
  var servers = ctx.servers() || [];
  if (!servers.length) {
    return {
      embeds: [embed(0xdc4c4c, "No Rust server linked yet",
        "Link one with **/setup run**: the address, the RCON port and the password are tested before anything is saved.")],
      components: [row([link("How setup works", ctx.siteUrl + "/commands.html#setup"), link("Command list", ctx.siteUrl + "/commands.html#server")])],
      flags: EPH,
    };
  }
  var server = servers[0];
  var answer = await ctx.rconTest({ host: server.host, port: server.port, password: server.password, command: question[1] });
  var ok = answer && answer.ok === true;
  var built = embed(ok ? 0x3ba55d : 0xdc4c4c,
    "/server " + question[0] + (ok ? " - answered" : " - no answer"),
    "**" + server.name + "** (" + server.host + ":" + server.port + ")\nAsked " + code(question[1]) +
    (ok ? " and it answered in " + ms(answer.ms) + "." : " and it did not answer."));
  built.fields = [];
  if (ok && answer.answer) {
    var text = String(answer.answer).trim();
    built.fields.push(field("What the server answered",
      block(text.slice(0, 900) + (text.length > 900 ? "\n... and " + (text.length - 900) + " more characters" : "")), false));
  }
  if (!ok) {
    built.fields.push(field("Reason", code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 400), false));
    built.fields.push(field("What usually causes this", [
      "The RCON port is not the game or query port",
      "rcon.web is set to 1 on the server (this speaks the other kind)",
      "The host refuses connections from the wider internet, or an IP allowlist is on",
    ].join("\n"), false));
  }
  built.footer = { text: question[2] + " | checked at " + when() };
  return {
    embeds: [built],
    components: [row([button("server:" + question[0], "Ask again", 1), button("setup:server", "Server settings", 2), button("server:players", "Who is online", 2)])],
    flags: EPH,
  };
}

/* /user whois -------------------------------------------------------------- */
/* Reads the saved link list. It never guesses and never pings: Discord ids are printed as
   text, so looking somebody up cannot notify them. */
export function whoisReply(ctx, gamertag) {
  var wanted = String(gamertag || "").trim();
  var links = ctx.links() || [];
  var pending = ctx.pendingLinks() || [];
  if (!wanted) {
    return {
      embeds: [embed(0x5865f2, "/user whois",
        "Give it a gamertag, or part of one, to see which Discord account is behind it.\n" +
        code("/user whois gamertag: YourName") + "\n\n" + links.length + " link(s) on record, " + pending.length + " request(s) waiting.")],
      flags: EPH,
    };
  }
  var lower = wanted.toLowerCase();
  var exact = links.filter(function (l) { return String(l.gamertag).toLowerCase() === lower; });
  var found = exact.length ? exact : links.filter(function (l) { return String(l.gamertag).toLowerCase().indexOf(lower) > -1; });
  var waiting = pending.filter(function (p) { return String(p.gamertag).toLowerCase().indexOf(lower) > -1; });
  if (!found.length) {
    var missing = embed(0xfaa81a, "No link for " + wanted,
      "Nobody on record is linked to a gamertag like that."
      + (waiting.length
        ? "\n\n" + (waiting.length === 1 ? "One request is waiting" : waiting.length + " requests are waiting") + " with a matching name. A request is not proof: approve it with " + code("/user forcelink") + " only if it is genuine."
        : "\n\nA player can ask to be linked from the panel posted by " + code("/user linkpanel") + "."));
    return { embeds: [missing], flags: EPH };
  }
  var lines = found.slice(0, 12).map(function (l) {
    var at = l.at ? String(l.at).slice(0, 10) : "an unknown date";
    return "**" + l.gamertag + "**\nDiscord id " + code(String(l.userId)) + " linked " + at
      + (l.by ? " by id " + code(String(l.by).slice(0, 20)) : "");
  });
  var built = embed(0x3ba55d, found.length === 1 ? "1 link found" : found.length + " links found", lines.join("\n\n"));
  if (found.length > 12) built.footer = { text: "Showing the first 12 of " + found.length };
  if (waiting.length) {
    built.fields = [field("Also waiting on staff", waiting.slice(0, 8).map(function (p) {
      return "**" + p.gamertag + "** - id " + code(String(p.userId));
    }).join("\n").slice(0, 900), false)];
  }
  return { embeds: [built], components: [row([button("user:roster", "See the whole roster", 2)])], flags: EPH };
}

/* ==========================================================================
   Setup, made clickable
   --------------------------------------------------------------------------
   Everything below follows one rule: the bot shows what it found and then waits.
   No role, channel, server or kit command is written until somebody presses the button that
   says it will be, and every panel reports exactly what was stored (or the reason nothing was).
   Nothing is inferred from a name unless the panel says it was: proposals are labelled, listed
   in full, and saved only on Apply.
   ========================================================================== */

/* ------------------------------------------------- step 1: roles by picker --- */
function slotLines(ctx) {
  var roles = ctx.settings.staffRoles || {};
  return ROLE_SLOTS.map(function (s) {
    return s[1] + ": " + (roles[s[0]] ? "<@&" + roles[s[0]] + ">" : "not set");
  }).join("\n");
}
function nextEmptyStaffSlot(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var empty = ROLE_SLOTS.filter(function (s) { return s[0] !== "linked" && !roles[s[0]]; });
  return empty.length ? empty[0] : null;
}
export function setupRolePanel(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var filled = ROLE_SLOTS.filter(function (s) { return roles[s[0]]; }).length;
  var built = embed(0xfaa81a, "Step 1 - Staff roles",
    "Pick a slot, then choose the role from this server list. No ids to copy and nothing to type: "
    + filled + " of " + ROLE_SLOTS.length + " slots are set. Choosing nothing in the role list clears that slot again.");
  built.fields = [
    field("Saved so far", slotLines(ctx), false),
    field("What these roles mean", "The roles saved here are the staff roles: they, Administrator, Manage Server and the server owner may run every staff command, everywhere in the bot. Picking a role that no member has is allowed, it simply does nothing yet.", false),
    field("The Linked role", "Optional and different: it is the role the bot gives a member once their gamertag is linked, if you want one. A slot left empty is simply unused.", false),
  ];
  built.footer = { text: "Admin or Manage Server. These panels are ephemeral" };
  var rows = [];
  rows.push(row(ROLE_SLOTS.slice(0, 3).map(function (s) { return button("setup:slot:" + s[0], s[1] + (roles[s[0]] ? " - set" : ""), roles[s[0]] ? 1 : 2); })));
  rows.push(row(ROLE_SLOTS.slice(3).map(function (s) { return button("setup:slot:" + s[0], s[1] + (roles[s[0]] ? " - set" : ""), roles[s[0]] ? 1 : 2); })));
  rows.push(row([button("setup:roles:ids", "Type ids instead", 2), button("setup:suggest", "Find them by name", 2), button("setup:channels", "Next: log channels", 1)]));
  rows.push(row([button("setup:doctor", "Health check", 2), button("setup:test", "Test a connection", 2)]));
  return { embeds: [built], components: rows, flags: EPH };
}

export function setupRoleSlot(ctx, slotKey) {
  var found = ROLE_SLOTS.filter(function (s) { return s[0] === slotKey; })[0] || ROLE_SLOTS[0];
  var current = (ctx.settings.staffRoles || {})[found[0]];
  var built = embed(0xfaa81a, "Step 1 - " + found[1] + " role",
    (current ? "Currently **<@&" + current + ">**. " : "Nothing is saved for this slot yet. ")
    + "Pick the role from the list below." + (found[0] === "linked" ? " The linked role is the one the bot can hand out once a member links a gamertag." : "")
    + "\n\nPick nothing and press the list to clear this slot instead.");
  built.fields = [field("Saved so far", slotLines(ctx), false)];
  return { embeds: [built], components: [
    row([roleSelect("setup:slot:" + found[0], "Role for " + found[1], 0)]),
    row([button("setup:roles", "Back to all slots", 2), button("setup:suggest", "Find them by name", 2)]),
  ], flags: EPH };
}

export function roleSlotResult(ctx, slotKey, roleId, wrote) {
  var found = ROLE_SLOTS.filter(function (s) { return s[0] === slotKey; })[0] || ROLE_SLOTS[0];
  var note = wrote && wrote.ok
    ? embed(0x3ba55d, found[1] + (roleId ? " saved" : " cleared"),
      roleId ? "**" + found[1] + "** is now <@&" + roleId + ">. Saved to the website as well, so it survives a restart."
        : "**" + found[1] + "** is now empty, and nothing will match that slot. Saved to the website too.")
    : embed(0xfaa81a, found[1] + (roleId ? " set, in memory only" : " cleared, in memory only"),
      "The website refused the save, so this holds until the service restarts. Reason: " + String((wrote && wrote.detail) || "not stated").slice(0, 200));
  var next = nextEmptyStaffSlot(ctx);
  if (next) note.fields = [field("Next", "**" + next[1] + "** is still empty: press its button below.", false)];
  else note.fields = [field("All five staff slots are set", "The Linked role is optional. Next step: logging channels, or the Rust server.", false)];
  var panel = setupRolePanel(ctx);
  return { embeds: [note, panel.embeds[0]], components: panel.components, flags: EPH };
}

/* ------------------------------------------------ step 2: log channels ------ */
export function channelSetupPanel(ctx) {
  var channels = ctx.settings.logChannels || {};
  var setCount = LOG_TYPES.filter(function (t) { return channels[t[0]]; }).length;
  var built = embed(0x3ba55d, "Step 2 - Logging channels",
    "Every log type is optional: a type with no channel is simply switched off, and " + setCount + " of " + LOG_TYPES.length + " have one.");
  built.fields = [
    field("Two ways", "**Pick them one by one** - choose a log type, then the channel for it.\n**Create them for me** - the bot makes a Spinback category and one channel per type you tick, shows you the exact list first, and reports each channel back as it is made.", false),
    field("Why the bot asks", "It only saves a channel it can actually post in, and it says so when it cannot. A log target the bot cannot write to would be worse than none.", false),
  ];
  return { embeds: [built], components: [
    row([button("setup:channels:pick", "Pick a type, then a channel", 1), button("setup:channels:build", "Create channels for me", 2)]),
    row([button("setup:roles", "Back to roles", 2), button("setup:server", "Next: the Rust server", 1)]),
  ], flags: EPH };
}

export function logChannelBuilder() {
  return { embeds: [embed(0x3ba55d, "Which logs should get a channel?",
    "Tick the log types you want. The bot creates one text channel per ticked type inside a new **Spinback** category, then saves each channel as that type target. Nothing else in the server is touched, and you see the list before it makes anything.")],
    components: [
      row([stringSelect("setup:channels:build:pick", "Log types to create channels for",
        LOG_TYPES.slice(0, 25).map(function (p) { return { label: p[1], value: p[0] }; }), 1, 10)]),
      row([button("setup:channels", "Back", 2)]),
    ], flags: EPH };
}

export function logChannelPlan(keys) {
  var list = (keys || []).map(function (key) {
    var found = LOG_TYPES.filter(function (t) { return t[0] === key; })[0];
    return "- **#" + (found ? found[0].toLowerCase() : key) + "** for " + (found ? found[1] : key);
  });
  var built = embed(0xfaa81a, "Create these channels?",
    "A category named **Spinback**, then " + (keys || []).length + " text channel(s) in this server:\n\n" + (list.join("\n") || "nothing selected"));
  built.fields = [field("Afterwards", "Each created channel is saved as that log type target, so logs start going there. A channel the bot cannot create is reported with the reason and simply skipped.", false)];
  built.footer = { text: "This is the only step that creates channels, and it does it only when you press Create" };
  return { embeds: [built], components: [
    row([button("setup:channels:build:go", "Create them", 3), button("setup:channels:build:cancel", "Cancel", 2)]),
  ], flags: EPH };
}

export function logChannelBuilt(created, failed, wrote) {
  var okList = created || [];
  var badList = failed || [];
  var built = embed(badList.length ? 0xfaa81a : 0x3ba55d, "Log channels",
    okList.length + " channel(s) created and saved" + (badList.length ? ", " + badList.length + " skipped" : "") + "."
    + (wrote && wrote.ok ? "" : " The website refused the settings save, so these ids live in this bot memory only: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  if (okList.length) built.fields = [field("Created", okList.slice(0, 12).join("\n").slice(0, 1000), false)];
  if (badList.length) built.fields = (built.fields || []).concat([field("Skipped", badList.slice(0, 8).join("\n").slice(0, 1000), false)]);
  return { embeds: [built], components: [
    row([button("setup:channels", "Back to log channels", 2), button("setup:doctor", "Health check", 2), button("setup:server", "Next: the Rust server", 1)]),
  ], flags: EPH };
}

/* ------------------------------------------------- step 3: the Rust server -- */
export function serverStepPanel(ctx) {
  var servers = ctx.servers();
  var built = embed(0x3ba55d, "Step 3 - Your Rust server",
    "The address, the RCON port and the password come from your server.cfg. Nothing is saved until the server answers a real RCON command, so a wrong port or password cannot land in your settings."
    + (servers.length ? "\n\nAlready saved: " + servers.map(function (s) { return code(s.name + " " + s.host + ":" + s.port); }).join(", ") : ""));
  built.fields = [
    field("Where the details are", "In server.cfg: " + code("rcon.ip") + ", " + code("rcon.port") + ", " + code("rcon.password") + ". " + code("rcon.web") + " must be " + code("0") + ", because this bot speaks the classic source RCON protocol."),
    field("If it will not answer", "The port is the thing people get wrong most: it is the RCON port from server.cfg, not the game or query port. Then rcon.web. Then an IP allowlist on the host, because the bot runs from a cloud address that can change."),
    field("Two ways in", "Type the details, or paste the RCON lines from server.cfg and let the bot read them."),
  ];
  return { embeds: [built], components: [
    row([button("setup:server", "Enter the details", 1), button("setup:import", "Paste server.cfg", 2)]),
    row([button("setup:test", "Test a saved server", 2), button("setup:doctor", "Health check", 2)]),
    row([button("setup:roles", "Back to roles", 2), button("setup:channels", "Back to log channels", 2)]),
  ], flags: EPH };
}

/* ------------------------------------------- find it for me: name proposals -- */
/* Names are matched against hints, and the panel says which hint matched. Nothing is saved
   here: the bot proposes, prints the whole proposal, and waits for Apply. */
const ROLE_HINTS = [
  ["owner", ["owner", "founder", "creator", "leader"]],
  ["coOwner", ["co-owner", "coowner", "co owner", "vice owner", "deputy owner", "second owner"]],
  ["headAdmin", ["head admin", "headadmin", "senior admin", "staff manager", "staff lead"]],
  ["admin", ["admin", "administrator"]],
  ["moderator", ["moderator", "trial mod"]],
  ["linked", ["linked", "verified", "linked player"]],
];
const LOG_HINTS = {
  server: ["server", "status"], console: ["console"], command: ["command"], rcon: ["rcon"],
  linking: ["link"], killfeed: ["kill"], eventfeed: ["event"], emoteKits: ["emote", "kit"],
  admin: ["admin"], zorp: ["zorp"], teleport: ["teleport", "tp"], clan: ["clan"],
  catchARide: ["catch", "car"], joinLeave: ["join", "leave", "welcome", "goodbye"],
  errors: ["error"],
};
function normName(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
/* A channel the bot cannot read the type of is not excluded: it is proposed and labelled, so a
   person decides. Only voice, category and stage channels are refused as log targets. */
function looksLikeTextChannel(channel) {
  var kind = channel && channel.kind;
  if (kind === undefined || kind === null || kind === "") return true;
  if (typeof kind === "number") return kind === 0 || kind === 5 || kind === 15;
  var text = String(kind).toLowerCase();
  if (text.indexOf("voice") > -1 || text.indexOf("categor") > -1 || text.indexOf("stage") > -1) return false;
  return true;
}
export function setupSuggest(ctx) {
  var guild = ctx.guildInfo;
  if (!guild) return { embeds: [embed(0xdc4c4c, "Nothing to read yet", "The bot has not received this server role and channel list yet. Try again in a moment.")], flags: EPH };
  var roles = (guild.roles || []).slice();
  var channels = (guild.channels || []).slice();
  var proposal = { roles: {}, channels: {} };
  var usedRoles = {};
  var roleHits = [];
  ROLE_HINTS.forEach(function (pair) {
    var slot = pair[0];
    var found = null;
    roles.forEach(function (role) {
      if (found || usedRoles[role.id]) return;
      var name = normName(role.name);
      var exact = pair[1].some(function (hint) { return name === normName(hint); });
      var loose = pair[1].some(function (hint) { return name.indexOf(normName(hint)) > -1; });
      if (exact) found = { id: role.id, name: role.name, how: "exact name match" };
      else if (loose) found = { id: role.id, name: role.name, how: "name contains " + normName(pair[1][0]) };
    });
    if (found) {
      usedRoles[found.id] = true;
      roleHits.push({ slot: slot, hit: found });
      proposal.roles[slot] = { roleId: found.id, name: found.name, how: found.how };
    }
  });
  var usedChannels = {};
  var channelHits = [];
  LOG_TYPES.forEach(function (type) {
    var hints = LOG_HINTS[type[0]] || [];
    var found = null;
    channels.forEach(function (channel) {
      if (found || usedChannels[channel.id] || channel.canSend === false) return;
      if (!looksLikeTextChannel(channel)) return;
      var name = normName(channel.name);
      var exact = hints.some(function (hint) { return name === normName(hint); });
      var loose = hints.some(function (hint) { return name.indexOf(normName(hint)) > -1; });
      if (exact) found = { id: channel.id, name: channel.name, how: "exact name match" };
      else if (loose) found = { id: channel.id, name: channel.name, how: "name contains " + normName(hints[0]) };
    });
    if (found) {
      usedChannels[found.id] = true;
      channelHits.push({ slot: type[0], label: type[1], hit: found });
      proposal.channels[type[0]] = { channelId: found.id, name: found.name, how: found.how };
    }
  });
  var built = embed(0xfaa81a, "What the names suggest",
    "Read from the " + roles.length + " role(s) and " + channels.length + " channel(s) the bot can see here, at " + when() + ". Nothing is saved yet: the whole proposal is below, and Apply does the writing.");
  built.fields = [
    field("Roles proposed (" + roleHits.length + " of " + ROLE_SLOTS.length + ")",
      roleHits.length ? roleHits.map(function (r) {
        var label = ROLE_SLOTS.filter(function (s) { return s[0] === r.slot; })[0];
        return "**" + (label ? label[1] : r.slot) + "** -> " + r.hit.name + " (" + r.hit.how + ")";
      }).join("\n").slice(0, 1000) : "No role name matched any slot. Save them by hand from the role slots panel.", false),
    field("Log channels proposed (" + channelHits.length + ")", channelHits.length ? channelHits.map(function (c) {
      return "**" + c.label + "** -> #" + c.hit.name + " (" + c.hit.how + ")";
    }).join("\n").slice(0, 1000) : (channels.length ? "No channel name matched a log type." : "The bot can see no channels in this server yet. Create them with **2. Log channels**, then run this again."), false),
    field("Not matched", roleHits.length === ROLE_SLOTS.length && channelHits.length ? "Everything was matched." :
      "Anything missing above is deliberate: no guess was made for it. Save or pick those by hand. " +
      (channels.length ? "" : "This server reports no channels to the bot at all, which also means it cannot post logs anywhere."), false),
  ];
  built.footer = { text: "A name match is a suggestion, not a decision: Apply writes exactly what is listed above" };
  var rows = [];
  if (roleHits.length || channelHits.length) {
    rows.push(row([button("setup:suggest:apply", "Apply all - roles and channels", 3),
      button("setup:suggest", "Read the names again", 2)]));
  } else {
    rows.push(row([button("setup:suggest", "Read the names again", 2)]));
  }
  rows.push(row([button("setup:roles", "Pick roles by hand", 2), button("setup:channels", "Pick channels by hand", 2)]));
  rows.push(row([button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2)]));
  /* The proposal travels with the panel so Apply can only ever write the list that was on
     screen. The caller deletes this key before the panel is sent, because Discord would not
     understand it. */
  return { embeds: [built], components: rows, flags: EPH, proposalData: proposal };
}

export function suggestApplied(ctx, roles, channels, wrote, proposal) {
  var roleCount = (roles || []).length;
  var channelCount = (channels || []).length;
  var built = embed(wrote && wrote.ok ? 0x3ba55d : 0xfaa81a, "Proposal applied",
    roleCount + " role slot(s) and " + channelCount + " log channel(s) saved."
    + (wrote && wrote.ok ? " The website has them too, so they survive a restart."
      : " The website refused the save, so this holds until the service restarts: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  var fields = [];
  if (roleCount) fields.push(field("Roles saved", (roles || []).join("\n").slice(0, 1000), false));
  if (channelCount) fields.push(field("Log channels saved", (channels || []).join("\n").slice(0, 1000), false));
  if (proposal && (proposal.roleMisses || []).length) fields.push(field("Roles left alone", proposal.roleMisses.join(", ") + " - no name matched, so nothing was guessed.", false));
  if (fields.length) built.fields = fields;
  return { embeds: [built], components: [
    row([button("setup:roles", "Check the roles", 2), button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2)]),
  ], flags: EPH };
}

/* ------------------------------------------------ health check: the doctor --- */
function rconAdvice(reason) {
  var table = {
    timeout: "nothing answered in time. The port is usually the game or query port rather than the RCON port, or RCON is off, or rcon.web is 1 (this bot speaks the other kind: set rcon.web 0). A host that only accepts listed IPs looks exactly like this too, because the bot runs from a cloud address that can change.",
    "bad-password": "the server answered and refused the password, so the address and port are right. Compare rcon.password in server.cfg with what is saved here, character for character.",
    "refused-host": "that address is not on the public internet, so the bot will not connect to it. Use the public IP or hostname from server.cfg.",
    "refused-port": "that port number cannot exist. rcon.port is normally a five digit number.",
    "no-password": "no RCON password is saved for this server. Add one with /setup server.",
    "connect-failed": "the connection itself failed. Check the address, and that the port is open to the internet.",
    "closed-before-auth": "the server closed the connection before the password exchange finished. RCON is probably off, or the host is refusing the bot.",
    closed: "the server closed the connection while it was answering, so the reply is incomplete.",
    unexpected: "the connection failed in an unexpected way; the detail above comes from the operating system.",
  };
  return table[String(reason || "")] || "the reason is above. If it repeats, the port, the address and rcon.web are the three things worth re-reading in server.cfg.";
}
export async function setupDoctor(ctx) {
  var guild = ctx.guildInfo;
  var roles = ctx.settings.staffRoles || {};
  var channels = ctx.settings.logChannels || {};
  var servers = ctx.servers() || [];
  var kits = ctx.kits();
  var fields = [];
  var todo = [];

  /* 1 - staff roles, including ids that no longer exist */
  var savedSlots = ROLE_SLOTS.filter(function (s) { return roles[s[0]]; });
  var stale = [];
  if (guild && savedSlots.length) {
    savedSlots.forEach(function (s) {
      var known = (guild.roles || []).filter(function (r) { return String(r.id) === String(roles[s[0]]); })[0];
      if (!known) stale.push(s[1]);
    });
  }
  fields.push(field("Staff roles", savedSlots.length + " of " + ROLE_SLOTS.length + " slots set"
    + (stale.length ? "\n" + stale.join(", ") + " point at a role that is no longer in this server" : "")
    + (guild ? "" : "\nThe bot has not received this server role list yet, so ids could not be checked"), false));
  if (!savedSlots.length) todo.push("Save at least one staff role: **1. Staff roles** on the setup panel, or /setup suggest to have the names read for you.");
  else if (stale.length) todo.push("Clear or replace the role slots that no longer exist: " + stale.join(", ") + ".");

  /* 2 - log channels, including ones the bot cannot post in */
  var chSet = 0, chGone = [], chNoPost = [], chUnknown = [];
  LOG_TYPES.forEach(function (type) {
    var id = channels[type[0]];
    if (!id) return;
    chSet += 1;
    if (!guild) return;
    var found = (guild.channels || []).filter(function (c) { return String(c.id) === String(id); })[0];
    if (!found) { chGone.push(type[1]); return; }
    if (found.canSend === false) chNoPost.push(type[1] + " (#" + found.name + ")");
    else if (found.canSend === null || found.canSend === undefined) chUnknown.push(type[1] + " (#" + found.name + ")");
  });
  fields.push(field("Log channels", chSet + " of " + LOG_TYPES.length + " types set"
    + (chGone.length ? "\n" + chGone.length + " point at a channel that is gone" : "")
    + (chNoPost.length ? "\nthe bot cannot post in: " + chNoPost.slice(0, 6).join(", ") : "")
    + (chUnknown.length ? "\ncould not read its permission in: " + chUnknown.slice(0, 6).join(", ") : ""), false));
  if (chNoPost.length) todo.push("Give the bot permission to post in the listed channels, or point those log types somewhere else.");
  if (chGone.length) todo.push("Re-pick the log types whose channel is gone.");
  if (!chSet) todo.push("Optional but useful: **2. Log channels**.");

  /* 3 - one fresh RCON connection per saved server, measured */
  var probeLines = [];
  var probes = servers.slice(0, 3);
  for (var i = 0; i < probes.length; i++) {
    var server = probes[i];
    var answer = await ctx.rconTest({ host: server.host, port: server.port, password: server.password, command: "serverinfo" });
    if (answer && answer.ok === true) {
      probeLines.push("**" + server.name + "** answered in " + ms(answer.ms) + ": " + String(answer.answer || "").split("\n")[0].slice(0, 90));
    } else {
      probeLines.push("**" + server.name + "** did not answer -> " + code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 220) + "\n" + rconAdvice(answer && answer.reason));
      todo.push("Fix the connection to " + server.name + " (" + server.host + ":" + server.port + "): " + rconAdvice(answer && answer.reason).slice(0, 220));
    }
  }
  fields.push(field("Rust servers", servers.length
    ? servers.length + " saved, " + probes.length + " opened a fresh connection just now\n\n" + probeLines.join("\n\n").slice(0, 1000)
    : "none saved yet", false));
  if (!servers.length) todo.push("Link your Rust server: **3. Rust server**, or /setup import to paste the lines from server.cfg.");

  /* 4 - kit settings, checked against their own rules */
  var give = String(kits.giveCommand || "").trim();
  var list = String(kits.listCommand || "").trim();
  var install = String(kits.installCommand || "").trim();
  var giveIssues = [];
  if (give && give.indexOf("{player}") === -1) giveIssues.push("no {player}");
  if (give && give.indexOf("{kit}") === -1) giveIssues.push("no {kit}");
  fields.push(field("Kit settings",
    (list ? "list command set" : "no list command") + "\n"
    + (give ? "give template set" : "no give template") + (giveIssues.length ? " (" + giveIssues.join(", ") + ")" : "")
    + "\n" + (install ? "install command set" : "no install command")
    + "\n" + (kits.binds || []).length + " bind(s), " + Object.keys(kits.authSpawn || {}).length + " respawn kit(s), kits " + (kits.locked ? "locked" : "unlocked"), false));
  if (!list || !give) todo.push("Set your kit plugin own commands with **/kits commands**: without a list command the bot cannot read your real kit names, and without a give template it cannot hand a kit over.");
  if (giveIssues.length) todo.push("The give template needs both {player} and {kit} in it, otherwise the bot has nothing to put the target and the kit into.");

  /* 5 - where settings are stored */
  fields.push(field("Storage", ctx.storeTokenSet()
    ? "The website accepts saves, so settings survive a restart."
    : "BOT_SETTINGS_TOKEN is not set, so anything saved stays in this bot memory until it restarts.", false));
  if (!ctx.storeTokenSet()) todo.push("Set BOT_SETTINGS_TOKEN to the same value on the website service and this one, or every save lives in memory only.");

  /* 6 - the gate itself */
  var state = setupState(ctx);
  fields.push(field("Setup gate", state.complete ? "passed: staff commands are unlocked" : "still closed: " + (state.rolesSaved ? "" : "no staff role saved. ") + (state.serverLinked ? "" : "no tested Rust server linked."), false));

  var built = embed(todo.length ? 0xfaa81a : 0x3ba55d, "Health check",
    "Everything below was measured at " + when() + ": role and channel ids were checked against this server, and each saved server was asked a real RCON command just now. "
    + (todo.length ? "Then the list of what to fix, most important first." : "Nothing needs fixing."));
  built.fields = fields.slice(0, 10);
  if (todo.length) built.fields.push(field("Do this next", todo.slice(0, 5).map(function (line) { return "- " + line; }).join("\n").slice(0, 1000), false));
  built.footer = { text: "Read-only: this panel changed nothing" };
  return { embeds: [built], components: [
    row([button("setup:roles", "Roles", 1), button("setup:channels", "Log channels", 1), button("setup:server", "Rust server", 1)]),
    row([button("kits:commands", "Kit commands", 2), button("setup:doctor", "Run it again", 2), button("setup:status", "Status", 2)]),
  ], flags: EPH };
}

/* ----------------------------------------------------- import server.cfg ----- */
export function setupImportPanel() {
  return { embeds: [embed(0x5865f2, "Import your Rust server details",
    "Paste the RCON lines out of server.cfg, or just the address and password on one line. The bot reads exactly what is in front of it, says which pieces it found and which are missing, then tests the connection - and only saves the server if it answers.")],
    components: [
      row([button("setup:import:paste", "Paste the details", 1), button("setup:server", "Type them by hand", 2)]),
      row([button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2)]),
    ], flags: EPH };
}

export function setupImportModal() {
  return { title: "Paste RCON details", custom_id: "modal:import", components: [
    row([area("import_text", "server.cfg lines, or: host port password", "", true)]),
  ] };
}

/* Reads what is there. Every field it did not find is reported as missing rather than filled in. */
export function parseServerText(text) {
  var out = { host: null, port: null, password: null, web: null, found: [], missing: [], notes: [] };
  var lines = String(text || "").split(/\r?\n/);
  var strip = function (value) { return String(value || "").replace(/^["']|["']$/g, "").trim(); };
  lines.forEach(function (rawLine) {
    var line = String(rawLine).trim();
    if (!line || line.charAt(0) === "#") return;
    var named = line.match(/^\s*(rcon\.[a-z]+)\s+(.+)$/i);
    if (named) {
      var key = String(named[1]).toLowerCase();
      var value = strip(named[2]);
      if (key === "rcon.ip") out.host = value;
      else if (key === "rcon.port") out.port = value;
      else if (key === "rcon.password") out.password = value;
      else if (key === "rcon.web") out.web = value;
      return;
    }
    var connect = line.match(/^\s*(?:connect|rcon)\s+(.+)$/i);
    var rest = connect ? connect[1].trim() : line;
    var pairs = rest.split(/\s+/);
    var first = pairs[0] || "";
    if (first.indexOf(":") > -1 && first.split(":").length === 2) {
      if (!out.host) {
        out.host = first.split(":")[0];
        out.port = first.split(":")[1];
        if (pairs[1] && !out.password) out.password = strip(pairs[1]);
      }
      return;
    }
    if (pairs.length >= 3 && !out.host && /^[0-9a-zA-Z.\-]+$/.test(first)) {
      out.host = first;
      out.port = pairs[1];
      out.password = strip(pairs.slice(2).join(" "));
    }
  });
  if (out.host) out.found.push("address (" + code(out.host) + ")");
  if (out.port) out.found.push("port (" + code(String(out.port)) + ")");
  if (out.password) out.found.push("password (hidden)");
  if (out.web !== null) out.found.push(code("rcon.web") + ": " + code(String(out.web)));
  if (!out.host) out.missing.push("the address (" + code("rcon.ip") + ")");
  if (!out.port) out.missing.push("the port (" + code("rcon.port") + ")");
  if (!out.password) out.missing.push("the password (" + code("rcon.password") + ")");
  if (out.web === "1") out.notes.push("**rcon.web is 1** in what you pasted. This bot speaks the classic source RCON protocol, so set " + code("rcon.web 0") + " on the server, or the connection will look like a timeout.");
  var portNumber = Number(out.port);
  if (out.port && !(portNumber >= 1 && portNumber <= 65535)) out.notes.push("**" + code(String(out.port)) + " is not a port number** that can exist, so nothing will be sent to it.");
  return out;
}

export function setupImportResult(parsed) {
  var ready = !!parsed && !!parsed.host && !!parsed.port && !!parsed.password && Number(parsed.port) >= 1 && Number(parsed.port) <= 65535;
  var built = embed(ready ? 0x3ba55d : 0xfaa81a, ready ? "Read it - ready to test" : "Not everything was there",
    ready
      ? "Next the bot opens one RCON connection to **" + parsed.host + ":" + parsed.port + "** and asks " + code("serverinfo") + ". If it answers, the server is saved. If it does not, nothing is written and you get the reason."
      : "The bot found what is below. It will not fill in the rest, so add the missing pieces by hand or paste a fuller section of server.cfg.");
  built.fields = [
    field("Found", parsed && parsed.found.length ? parsed.found.join("\n") : "nothing recognisable", false),
    field("Missing", parsed && parsed.missing.length ? parsed.missing.join("\n") : "nothing", false),
  ];
  if (parsed && parsed.notes.length) built.fields.push(field("Worth knowing", parsed.notes.join("\n\n").slice(0, 1000), false));
  var rows = [];
  if (ready) rows.push(row([button("setup:import:go", "Test and save this server", 1), button("setup:import:paste", "Paste it again", 2)]));
  else rows.push(row([button("setup:import:paste", "Paste it again", 2), button("setup:server", "Enter it by hand", 1)]));
  rows.push(row([button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2)]));
  return { embeds: [built], components: rows, flags: EPH };
}

/* ------------------------------------------------------------- export -------- */
export function setupExport(ctx) {
  var guild = ctx.guildInfo;
  var roles = ctx.settings.staffRoles || {};
  var channels = ctx.settings.logChannels || {};
  var kits = ctx.kits();
  var roleName = function (id) {
    var found = guild ? (guild.roles || []).filter(function (r) { return String(r.id) === String(id); })[0] : null;
    return found ? found.name : "no longer in this server";
  };
  var channelName = function (id) {
    var found = guild ? (guild.channels || []).filter(function (c) { return String(c.id) === String(id); })[0] : null;
    return found ? "#" + found.name : "no longer in this server";
  };
  var roleLines = ROLE_SLOTS.filter(function (s) { return roles[s[0]]; }).map(function (s) {
    return s[1] + " = " + roleName(roles[s[0]]) + " (" + roles[s[0]] + ")";
  });
  var channelLines = LOG_TYPES.filter(function (t) { return channels[t[0]]; }).map(function (t) {
    return t[1] + " = " + channelName(channels[t[0]]) + " (" + channels[t[0]] + ")";
  });
  var built = embed(0x5865f2, "Your saved settings",
    "Everything saved here, as text you can copy. **No RCON password is in this at all**: it never leaves the service that talks to your server, so this is safe to paste into a private note.");
  built.fields = [
    field("Roles", roleLines.length ? block(roleLines.join("\n").slice(0, 900)) : "none saved", false),
    field("Log channels", channelLines.length ? block(channelLines.join("\n").slice(0, 900)) : "none saved", false),
    field("Kit commands", block([
      "list = " + (kits.listCommand ? kits.listCommand : "(not set)"),
      "give = " + (kits.giveCommand ? kits.giveCommand : "(not set)"),
      "install = " + (kits.installCommand ? kits.installCommand : "(not set)"),
      "binds = " + (kits.binds || []).length,
      "respawn kits = " + Object.keys(kits.authSpawn || {}).length,
      "kits locked = " + (kits.locked ? "yes" : "no"),
    ].join("\n")), false),
    field("Servers", ctx.servers().length ? block(ctx.servers().map(function (s) {
      return s.name + " = " + s.host + ":" + s.port + " (password not shown)";
    }).join("\n").slice(0, 900)) : "none saved", false),
    field("Player links", ctx.links().length + " link(s) and " + ctx.pendingLinks().length + " waiting", true),
    field("Stored where", ctx.storeTokenSet() ? "on the website, so it survives a restart" : "in this bot memory only: BOT_SETTINGS_TOKEN is not set", true),
  ];
  built.footer = { text: "Exported at " + when() };
  return { embeds: [built], components: [
    row([button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2), button("setup:reset", "Reset instead", 4)]),
  ], flags: EPH };
}

/* -------------------------------------------------------------- reset -------- */
export function setupResetPanel(ctx) {
  var roles = Object.keys(ctx.settings.staffRoles || {}).length;
  var channels = Object.keys(ctx.settings.logChannels || {}).length;
  var servers = ctx.servers().length;
  var kits = ctx.kits();
  var built = embed(0xdc4c4c, "Reset the settings?",
    "This clears the configuration and nothing else. It is the switch for starting over, and it asks you to type a word first because there is no undo.");
  built.fields = [
    field("What goes", [roles + " role slot(s)", channels + " log channel(s)", servers + " server(s)", (kits.binds || []).length + " bind(s)", Object.keys(kits.authSpawn || {}).length + " respawn kit(s)", "the kit commands", "the stored install codes"].join("\n"), false),
    field("What stays", [ctx.links().length + " player link(s)", ctx.pendingLinks().length + " waiting request(s)", "the link panel message id", "the log types already set in this server (the channels themselves are never deleted)"].join("\n"), false),
  ];
  built.footer = { text: "No channel, role, kit or player is ever deleted by this" };
  return { embeds: [built], components: [
    row([button("setup:reset:go", "I want to reset", 4), button("setup:status", "Back to status", 2), button("setup:doctor", "Health check", 2)]),
  ], flags: EPH };
}

export function setupResetModal() {
  return { title: "Confirm reset", custom_id: "modal:reset", components: [
    row([input("reset_word", "Type RESET in capitals", "", true)]),
  ] };
}

export function setupResetDone(ctx, cleared, wrote) {
  var built = embed(wrote && wrote.ok ? 0x3ba55d : 0xfaa81a, "Settings reset",
    cleared + " stored settings cleared."
    + (wrote && wrote.ok ? " The website agrees, so a restart will not bring them back."
      : " The website refused the save, so a restart may bring them back: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  built.fields = [
    field("Kept", ctx.links().length + " player link(s) and " + ctx.pendingLinks().length + " waiting request(s), exactly as they were.", false),
    field("Start again", "Press **1. Staff roles**, or run **/setup suggest** to have the role and channel names read for you.", false),
  ];
  return { embeds: [built], components: [
    row([button("setup:roles", "Start setup again", 1), button("setup:status", "Status", 2)]),
  ], flags: EPH };
}

/* --------------------------------------------------- kit commands + doctor --- */
export function kitCommandsPanel(ctx) {
  var kits = ctx.kits();
  var list = String(kits.listCommand || "").trim();
  var give = String(kits.giveCommand || "").trim();
  var install = String(kits.installCommand || "").trim();
  var built = embed(0xff7200, "Your kit plugin own commands",
    "This bot will not invent the name of a command inside your kit plugin. Give it yours, exactly as you would type them in the game console, and it uses them as given.");
  built.fields = [
    field("List kits", list ? code(list) : "not set - /kits grab cannot read your real kit names without it", false),
    field("Give a kit", give ? code(give) : "not set - /kits give has nothing to send", false),
    field("Install a kit", install ? code(install) : "not set - install codes stay stored until you set this", false),
    field("Placeholders", "The give template is filled in with " + code("{player}") + " and " + code("{kit}") + ", and install code with " + code("{code}") + " if you use it. Any wording around them is kept exactly as you write it.", false),
  ];
  built.footer = { text: "Leave a field blank when saving to clear that one command" };
  return { embeds: [built], components: [
    row([button("kits:commands:edit", "Enter the commands", 1), button("kits:grab", "Read my kits now", 2)]),
    row([button("kits:doctor", "Check the kit setup", 2), button("kits:config", "Back to Emote Kits", 2)]),
  ], flags: EPH };
}

export function kitCommandsModal(ctx) {
  var kits = ctx.kits();
  return { title: "Kit plugin commands", custom_id: "modal:kitcommands", components: [
    row([area("kit_list", "List command (as your plugin wants it)", kits.listCommand || "", false)]),
    row([area("kit_give", "Give template, using {player} and {kit}", kits.giveCommand || "", false)]),
    row([area("kit_install", "Install command, using {code} (optional)", kits.installCommand || "", false)]),
  ] };
}

export function kitCommandsResult(ctx, change, wrote) {
  var kits = ctx.kits();
  var built = embed(wrote && wrote.ok ? 0x3ba55d : 0xfaa81a, "Kit commands saved",
    change + (wrote && wrote.ok ? " Saved to the website as well." : " The website refused the save, so this holds until the service restarts: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  var give = String(kits.giveCommand || "");
  var issues = [];
  if (give && give.indexOf("{player}") === -1) issues.push("the give template has no " + code("{player}"));
  if (give && give.indexOf("{kit}") === -1) issues.push("the give template has no " + code("{kit}"));
  built.fields = [field("Now set", [
    "list = " + (kits.listCommand ? code(kits.listCommand) : "not set"),
    "give = " + (kits.giveCommand ? code(kits.giveCommand) : "not set"),
    "install = " + (kits.installCommand ? code(kits.installCommand) : "not set"),
  ].join("\n"), false)];
  if (issues.length) built.fields.push(field("Still to do", issues.join("\n") + "\n\nWithout both placeholders the bot has nothing to put the player and the kit into, and it will not guess.", false));
  else if (kits.giveCommand) built.fields.push(field("Next", "Press **Read my kits now** to ask your server for the real kit names, or give one with /kits give.", false));
  return { embeds: [built], components: [
    row([button("kits:grab", "Read my kits now", 1), button("kits:commands", "Back to the commands", 2), button("kits:config", "Emote Kits", 2)]),
  ], flags: EPH };
}

export function kitsDoctor(ctx) {
  var kits = ctx.kits();
  var binds = kits.binds || [];
  var auth = kits.authSpawn || {};
  var give = String(kits.giveCommand || "").trim();
  var list = String(kits.listCommand || "").trim();
  var install = String(kits.installCommand || "").trim();
  var todo = [];
  var broken = binds.filter(function (b) { return !b.emote || !(b.kits || []).length; });
  if (!list) todo.push("Set your kit plugin **list command** with /kits commands: without it, /kits grab cannot read your real kit names, and this bot will not invent them.");
  if (!give) todo.push("Set a **give template** with /kits commands, using {player} and {kit}: until then /kits give has nothing to send.");
  else if (give.indexOf("{player}") === -1 || give.indexOf("{kit}") === -1) todo.push("The give template needs both {player} and {kit} in it.");
  if (install && install.indexOf("{code}") === -1) todo.push("The install command has no {code} in it, so there is nowhere for a kit code to go.");
  if (!binds.length) todo.push("Add at least one bind with /kits config: a bind is what ties an emote to its kits.");
  if (broken.length) todo.push(broken.length + " bind(s) are incomplete and should be edited or removed.");
  if (!Object.keys(auth).length) todo.push("Optional: give an auth group a kit on respawn with /kits auth-spawn.");
  var built = embed(todo.length ? 0xfaa81a : 0x3ba55d, "Kit setup check",
    "Read from what is saved at " + when() + ". Nothing was sent to your server by this panel, so a kit name is only ever checked against what the plugin itself reports.");
  built.fields = [
    field("Commands", "list: " + (list ? code(list) : "not set") + "\ngive: " + (give ? code(give) : "not set") + "\ninstall: " + (install ? code(install) : "not set"), false),
    field("Binds", binds.length ? binds.slice(0, 10).map(function (b) {
      return code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " | " + b.cooldown + "s" : "") + (b.roleId ? " | <@&" + b.roleId + ">" : "");
    }).join("\n").slice(0, 1000) : "none yet", false),
    field("Respawn kits", Object.keys(auth).length ? Object.keys(auth).map(function (g) { return g + " -> " + code(auth[g]); }).join("\n") : "none set", false),
    field("Kits lock", kits.locked ? "kits are locked: members cannot take a bind" : "unlocked", true),
    field("Install codes held", String(Object.keys(ctx.settings.installs || {}).length), true),
  ];
  if (todo.length) built.fields.push(field("Do this next", todo.slice(0, 5).map(function (t) { return "- " + t; }).join("\n").slice(0, 1000), false));
  built.footer = { text: "Read-only: this panel changed nothing" };
  return { embeds: [built], components: [
    row([button("kits:commands", "Kit commands", 1), button("kits:grab", "Read my kits now", 2), button("kits:config", "Emote Kits", 2)]),
  ], flags: EPH };
}

/* /help -------------------------------------------------------------------- */
export function helpHome(ctx) {
  var built = embed(0x5865f2, "Spinback RCE commands",
    "Pick a command to see every subcommand, who may run it and what it needs set up first.");
  var state = ctx ? setupState(ctx) : null;
  if (state && state.complete !== true) {
    var missing = [];
    if (!state.rolesSaved) missing.push("no staff role is saved yet");
    if (!state.serverLinked) missing.push("no Rust server is linked and tested yet");
    built.fields = [field("Setup is not finished", missing.join(", ") + ". Everything except **/setup**, **/ping** and this page stays locked until it is. Press **Start setup** below.", false)];
  }
  var rows = [
    row([button("help:cmd:ping", "/ping - live health", 1), button("help:cmd:setup", "/setup - configure", 1), button("help:cmd:kits", "/kits - emote kits", 1)]),
    row([button("help:cmd:server", "/server - ask your Rust", 1), button("help:cmd:user", "/user - player links", 1)]),
  ];
  if (state && state.complete !== true) rows.push(row([button("setup:roles", "Start setup", 3), button("setup:doctor", "Health check", 2)]));
  rows.push(row([link("Status page", "https://spinback-j7ao5f.camelai.app/status.html"), link("Commands reference", "https://spinback-j7ao5f.camelai.app/commands.html")]));
  return { embeds: [built], components: rows, flags: EPH };
}

export function helpDetail(name) {
  var pages = {
    ping: embed(0x5865f2, "Help: /ping",
      "One embed, everything in it measured at the moment you run it: the gateway heartbeat, uptime, Node version, memory, the guild this bot is in, how many commands it registered, and a live request to the website with the round-trip time."),
    setup: embed(0xfaa81a, "Help: /setup",
      "Your server, wired up in three steps. The Rust connection is tested before anything is saved, so a wrong port or password never lands in your settings."),
    kits: embed(0xff7200, "Help: /kits",
      "Emote kits end to end: the real kit names from your server, binds with cooldowns and roles, giving kits out, clearing cooldowns, respawn kits per auth group, and installing kits built in Kit Studio."),
    server: embed(0x3ba55d, "Help: /server",
      "Four read-only questions put to your Rust server over RCON: info, players, time and status, plus a fresh-connection check. The bot only ever asks the commands on its allowed list, so nothing here can change your game - and whatever the server answers is shown as it arrived."),
    user: embed(0x2ecc71, "Help: /user",
      "Player links: look one up with whois, confirm a request by hand with forcelink, remove or transfer one, post the member-facing link panel, or read the whole roster. Links are the bot's record of which Discord account belongs to which gamertag."),
  };
  var extras = {
    ping: [
      field("Permissions", "Anyone in this server can run it.", false),
      field("Needs first", "Nothing. It works before setup is finished, and says what is still missing.", false),
    ],
    setup: [
      field("Subcommands", [
        "**run** - the panel: roles, logging channels, then your Rust server",
        "**roles** - pick each staff role from a list, with no ids to copy",
        "**channels** - choose log channels one by one, or have the bot create them",
        "**server** - add or change the Rust server, tested before it is saved",
        "**suggest** - read the names in this server and propose the whole setup",
        "**doctor** - measure everything saved and list what to fix first",
        "**import** - paste your server.cfg RCON lines and let the bot read them",
        "**export** - your settings as copyable text, with no passwords in it",
        "**reset** - clear the saved settings, after typing a confirmation",
        "**status** - a checklist of what is saved and what is still missing",
        "**edit** - change a saved server address, RCON port or password",
        "**refresh** - open a fresh RCON connection and report exactly what the server answers",
      ].join("\n"), false),
      field("Permissions", "Administrator or Manage Server. Panels are ephemeral.", false),
      field("Needs first", "The RCON port and password from server.cfg, with rcon.web set to 0.", false),
    ],
    kits: [
      field("Subcommands", [
        "**grab** - read the real kit names from your Rust server",
        "**config** - binds, cooldowns, roles, lock kits, emote guide",
        "**give** - hand a kit to a gamertag or a linked Discord user",
        "**refresh** - clear cooldowns for one user, one kit, everyone or every kit",
        "**cooldowns** - see the cooldown records the bot is holding",
        "**commands** - set your kit plugin own list command and give template",
        "**doctor** - check the kit settings and see what is still missing",
        "**auth-spawn** - give a group a kit on every respawn",
        "**build** - Kit Studio on the website, or work from an install code",
        "**add** - install a kit from a Base64 install code",
      ].join("\n"), false),
      field("Permissions", "Administrator or Manage Server.", false),
      field("Needs first", "Your kit plugin own command names, and a give template using {player} and {kit}. The bot will not guess either.", false),
    ],
    server: [
      field("Subcommands", [
        "**info** - what the server says about itself",
        "**players** - the live player list with ping",
        "**time** - the in-game clock",
        "**status** - the server's own status answer",
        "**check** - a fresh connection, timed",
      ].join("\n"), false),
      field("Permissions", "Staff roles saved in setup, plus Administrator, Manage Server and the server owner.", false),
      field("Read-only", "Only the commands on the bot's allowed list are ever sent: serverinfo, playerlist, gettime and status. Nothing can be changed from here.", false),
      field("Needs first", "Setup finished: one staff role and one tested Rust server, because a connection is what answers these.", false),
    ],
    user: [
      field("Subcommands", [
        "**whois** - find the Discord account behind a gamertag",
        "**pending** - link requests waiting for confirmation, with approve and reject",
        "**forcelink** - link one by hand",
        "**forceunlink** - remove a link",
        "**transfer** - move a link to another account or gamertag",
        "**linkpanel** - post the member-facing panel in a channel",
        "**roster** - everyone who is linked",
      ].join("\n"), false),
      field("Permissions", "Staff roles saved in setup, plus Administrator, Manage Server and the server owner.", false),
      field("Why a link is not taken on trust", "A request is a claim, not proof. The bot records it as waiting until staff confirm it or the server verifies it in game.", false),
    ],
  };
  var out = pages[name] || pages.ping;
  out.fields = extras[name] || [];
  return out;
}

/* /setup status ------------------------------------------------------------ */
export function setupStatus(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var channels = ctx.settings.logChannels || {};
  var servers = ctx.servers();
  var kits = ctx.kits();
  var checks = [
    ["Staff roles stored", Object.keys(roles).length + " of " + ROLE_SLOTS.length],
    ["Log channels stored", Object.keys(channels).length + " of " + LOG_TYPES.length],
    ["Rust servers linked", String(servers.length)],
    ["Kit binds", String((kits.binds || []).length)],
    ["Auth groups with a respawn kit", String(Object.keys(kits.authSpawn || {}).length)],
  ];
  var next = [];
  if (!servers.length) next.push("Run **/setup run** and add your Rust server, so the RCON connection can be tested.");
  if (!Object.keys(roles).length) next.push("Step 1: save your staff roles so staff-only features know who is who.");
  if (!Object.keys(channels).length) next.push("Step 2: choose a channel for the log types you want.");
  if (!kits.listCommand) next.push("Set your kit plugin list command, then **/kits grab** reads your real kit names.");
  if (!kits.giveCommand) next.push("Set a give template using {player} and {kit}, then **/kits give** can hand kits out in game.");
  if (!ctx.storeTokenSet()) next.push("Set BOT_SETTINGS_TOKEN to the same value on the website and the bot, otherwise saves stay in this bot memory only.");
  var diagnostics = ctx.diagnostics && ctx.diagnostics();
  var problems = diagnostics && Array.isArray(diagnostics.problems) ? diagnostics.problems : [];
  var built = embed(next.length || problems.length ? 0xfaa81a : 0x3ba55d, "Setup status",
    next.length ? "What is saved right now is below, then what is still missing, in the order worth doing it." : "Everything the bot can check is in place.");
  built.fields = checks.map(function (c) { return field(c[0], c[1], true); });
  if (next.length) built.fields.push(field("What is missing", next.slice(0, 6).map(function (n) { return "- " + n; }).join("\n"), false));
  if (problems.length) built.fields.push(field("Problems found just now", problems.slice(0, 8).map(function (p) { return "- " + p; }).join("\n").slice(0, 1000), false));
  built.footer = { text: "Read-only: nothing on this panel changes your settings" };
  return { embeds: [built], components: [row([button("setup:roles", "Roles", 1), button("setup:channels", "Log channels", 1), button("setup:server", "Rust server", 1)])], flags: EPH };
}

/* /kits cooldowns ---------------------------------------------------------- */
export function cooldownsPanel(ctx, rows) {
  var list = rows || [];
  var built = embed(0xff7200, "Kit cooldowns",
    list.length
      ? "The cooldown records this bot is holding right now."
      : "No cooldown records are being held. Cooldowns are this bot own bookkeeping, so this stays empty until the in-game hook reports a kit use back to the bot.");
  if (list.length) built.fields = [field("On record", list.slice(0, 20).join("\n").slice(0, 1000), false)];
  built.footer = { text: "Clearing is instant: /kits refresh, or the button below" };
  return { embeds: [built], components: [row([button("kits:config", "Back to Emote Kits", 2), button("kits:clear", "Clear all cooldowns", 2)])], flags: EPH };
}

/* /kits -------------------------------------------------------------------- */
/* ------------------------------------------------------------ setup gate --- */
/* Nothing that touches a Rust server or a player runs until the two things that make
   those possible exist: at least one staff role saved, and one tested Rust server.
   /setup is the one exception, because it is how you get there. */
export function setupState(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var saved = ROLE_SLOTS.map(function (s) { return s[0]; }).filter(function (key) { return key !== "linked" && roles[key]; });
  return {
    rolesSaved: saved.length,
    serverLinked: ctx.servers().length > 0,
    complete: saved.length > 0 && ctx.servers().length > 0,
  };
}

export function gatePayload(ctx, wanted) {
  var state = setupState(ctx);
  var lines = [];
  if (!state.rolesSaved) lines.push("- **Step 1 - Staff roles** have not been saved yet, so the bot cannot tell staff from anyone else.");
  if (!state.serverLinked) lines.push("- **Step 3 - No Rust server** is linked and tested yet, so there is nothing to send commands to.");
  var built = embed(0xfaa81a, "Finish setup first",
    "**" + wanted + "** stays locked until setup is finished. Two things are needed, and each one is a button on the setup panel:\n\n" + lines.join("\n"));
  built.fields = [
    field("Step 1 - Staff roles", state.rolesSaved ? state.rolesSaved + " saved" : "not saved yet", true),
    field("Step 2 - Logging channels", Object.keys(ctx.settings.logChannels || {}).length + " of " + LOG_TYPES.length + " set", true),
    field("Step 3 - Rust server", state.serverLinked ? "linked and tested" : "not linked yet", true),
  ];
  built.footer = { text: "The roles you save here are the roles allowed to run staff commands" };
  var panel = setupPanel(ctx);
  return { embeds: [built, panel.embeds[0]], components: panel.components, flags: EPH };
}

/* The roles saved in step 1 are the staff roles: they, Administrator, and the guild owner
   are the people who may run anything that configures or edits. */
export function staffRoleList(ctx) {
  var roles = ctx.settings.staffRoles || {};
  return ROLE_SLOTS.filter(function (s) { return s[0] !== "linked"; }).map(function (s) { return { slot: s[0], label: s[1], id: roles[s[0]] || null }; }).filter(function (r) { return r.id; });
}

export function staffRoleNames(ctx) {
  var list = staffRoleList(ctx);
  if (!list.length) return null;
  return list.map(function (r) { return r.label + ": <@&" + r.id + ">"; }).join("\n");
}

/* ---------------------------------------------------------------- /user ---- */
export function linkRecords(ctx) {
  var links = ctx.links() || [];
  var pending = ctx.pendingLinks() || [];
  return { links: links, pending: pending };
}

export function userPanel(ctx) {
  var held = linkRecords(ctx);
  var built = embed(0x3ba55d, "Player links",
    "Who is who: a Discord account with the Rust Console gamertag it belongs to. Links are the base for kits, kits-by-role, auth groups and the roster, so they are worth keeping accurate.");
  built.fields = [
    field("Linked players", String(held.links.length), true),
    field("Waiting to be confirmed", String(held.pending.length), true),
    field("Link panel posted", ctx.linkPanel() && ctx.linkPanel().channelId ? "in <#" + ctx.linkPanel().channelId + ">" : "not yet", true),
  ];
  if (held.links.length) {
    built.fields.push(field("Most recent", held.links.slice(-8).map(function (l) { return "<@" + l.userId + "> -> " + code(l.gamertag); }).join("\n"), false));
  }
  built.footer = { text: "Staff only. Players link themselves through the link panel" };
  return { embeds: [built], components: [
    row([button("user:forcelink", "Force link", 1), button("user:unlink", "Force unlink", 2), button("user:transfer", "Transfer a link", 2)]),
    row([button("user:roster", "Roster", 2), button("user:panel", "Post the link panel", 1), button("user:pending", "Waiting list", 2)]),
  ], flags: EPH };
}

/* The panel staff post in a channel. Its buttons work for everyone in the server, because
   linking is a member action, not a staff one. */
export function linkPanelPayload() {
  var built = embed(0x3ba55d, "Link your Rust Console account",
    "Press **Link account**, type your Rust Console gamertag exactly as it appears in game, and the bot will check it against the links already on record.");
  built.fields = [
    field("Already linked?", "Press **Unlink** and go through the confirmation. Staff can always do it for you.", false),
    field("How it is verified", "This panel records your request. A request is only trusted once your server confirms it: staff confirm it with /user forcelink, or your server own in-game command does it automatically.", false),
  ];
  built.footer = { text: "One gamertag can only be linked to one Discord account" };
  return { embeds: [built], components: [
    row([button("link:start", "Link account", 1), button("link:unlink", "Unlink", 3)]),
  ] };
}

export function linkModal() {
  return { title: "Link your account", custom_id: "modal:link:self", components: [
    row([input("link_gamertag", "Your Rust Console gamertag", "", true)]),
  ] };
}

export function forcelinkPicker() {
  return { embeds: [embed(0x3ba55d, "Force link: who?", "Choose the Discord account, then type the gamertag on the next screen.")],
    components: [row([{ type: 5, custom_id: "user:forcelink:user", placeholder: "Discord account" }])], flags: EPH };
}

export function forcelinkModal(userId) {
  return { title: "Force link", custom_id: "modal:forcelink:" + userId, components: [
    row([input("link_gamertag", "Gamertag to attach", "", true)]),
  ] };
}

export function adviceOnGamertag(ctx, gamertag, forUserId) {
  var found = (ctx.links() || []).filter(function (l) { return l.gamertag.toLowerCase() === gamertag.toLowerCase(); })[0];
  if (!found) return { free: true };
  if (found.userId === forUserId) return { free: false, reason: "already-this-user", detail: "That gamertag is already linked to that same Discord account." };
  return { free: false, reason: "taken", detail: "That gamertag is already linked to <@" + found.userId + ">. Use **Transfer a link** to move it, or unlink it first." };
}

export function unlinkPicker(ctx) {
  var links = ctx.links() || [];
  if (!links.length) return { embeds: [embed(0xfaa81a, "Nothing to unlink", "No links are on record yet.")], components: [row([button("user:panel", "Post the link panel", 1)])], flags: EPH };
  return { embeds: [embed(0x3ba55d, "Force unlink: which link?", "Choose the player, then confirm. Nothing is removed until you confirm.")],
    components: [row([{ type: 3, custom_id: "user:unlink:pick", placeholder: "Linked players",
      options: links.slice(0, 25).map(function (l) { return { label: l.gamertag.slice(0, 90), value: l.gamertag, description: ("Discord " + l.userId).slice(0, 90) }; }) }])], flags: EPH };
}

export function unlinkConfirm(gamertag, userId) {
  return { embeds: [embed(0xfaa81a, "Remove this link?", "Player: " + code(gamertag) + "\nDiscord: <@" + userId + ">\n\nKits, auth groups and the roster all use this link, so anything set up against it will stop matching.")],
    components: [row([button("user:unlink:go:" + gamertag, "Yes, remove it", 4), button("user:config", "Cancel", 2)])], flags: EPH };
}

export function transferPicker(ctx) {
  var links = ctx.links() || [];
  if (!links.length) return { embeds: [embed(0xfaa81a, "Nothing to transfer", "No links are on record yet.")], components: [row([button("user:forcelink", "Force link instead", 1)])], flags: EPH };
  return { embeds: [embed(0x3ba55d, "Transfer: which link?", "Pick the link to move. Then you can change the Discord account, the gamertag, or both at once.")],
    components: [row([{ type: 3, custom_id: "user:transfer:pick", placeholder: "Linked players",
      options: links.slice(0, 25).map(function (l) { return { label: l.gamertag.slice(0, 90), value: l.gamertag, description: ("Discord " + l.userId).slice(0, 90) }; }) }])], flags: EPH };
}

export function transferModal(gamertag) {
  return { title: "Transfer " + gamertag.slice(0, 30), custom_id: "modal:transfer:" + gamertag, components: [
    row([input("move_user", "New Discord user id (required)", "", true)]),
    row([input("move_gamertag", "New gamertag (leave blank to keep " + gamertag.slice(0, 20) + ")", "", false)]),
  ] };
}

export function rosterPanel(ctx) {
  var held = linkRecords(ctx);
  var lines = held.links.slice(0, 40).map(function (l) {
    return "<@" + l.userId + "> -> " + code(l.gamertag) + (l.by ? " (by <@" + l.by + ">)" : "");
  });
  var built = embed(0x3ba55d, "Linked players", held.links.length
    ? "Every link on record, newest last."
    : "No links on record yet. Post the link panel so players can link themselves, or use **Force link**.");
  if (lines.length) built.fields = [field("Roster (" + held.links.length + ")", lines.join("\n").slice(0, 1000), false)];
  if (held.links.length > 40) built.fields.push(field("Cut off", "Showing the first 40 of " + held.links.length + ".", false));
  return { embeds: [built], components: [row([button("user:config", "Back to links", 2), button("user:panel", "Post the link panel", 1)])], flags: EPH };
}

export function pendingPanel(ctx) {
  var pending = ctx.pendingLinks() || [];
  var built = embed(0x3ba55d, "Waiting to be confirmed", pending.length
    ? "These players asked to link. Confirm one with **Force link**, or let your server own in-game verification do it."
    : "Nobody is waiting: no unconfirmed link requests are on record.");
  if (pending.length) built.fields = [field("Requests", pending.slice(0, 20).map(function (p) { return "<@" + p.userId + "> asked for " + code(p.gamertag); }).join("\n").slice(0, 1000), false)];
  var rows = pending.slice(0, 4).map(function (p) {
    return row([button("user:pending:yes:" + p.userId, ("Approve " + p.gamertag).slice(0, 76), 3),
      button("user:pending:no:" + p.userId, "Reject", 4)]);
  });
  rows.push(row([button("user:config", "Back to links", 2), button("user:forcelink", "Confirm one by hand", 1)]));
  if (pending.length) built.footer = { text: "Approve writes the link as you, so the record shows who confirmed it" };
  return { embeds: [built], components: rows, flags: EPH };
}

export function channelPickerForPanel() {
  return { embeds: [embed(0x3ba55d, "Where should the panel go?", "Pick the channel. The panel is posted there for everyone, and the bot keeps its message id so it can point back to it later.")],
    components: [row([{ type: 8, custom_id: "user:panel:channel", placeholder: "Channel", channel_types: [0] }])], flags: EPH };
}

/* -------------------------------------------------- kit panels for bare use --- */
export function kitGiveModal() {
  return { title: "Give a kit", custom_id: "modal:kitgive", components: [
    row([input("give_kit", "Kit name", "", true)]),
    row([input("give_target", "Gamertag (or leave blank and use the Discord option)", "", false)]),
    row([input("give_user", "Discord user id", "", false)]),
  ] };
}

export function kitRefreshPanel(ctx) {
  return { embeds: [embed(0xff7200, "Clear cooldowns", "Choose the scope. The bot reports the exact number of records it cleared, and clears nothing it does not hold.")],
    components: [
      row([button("kits:refresh:user", "One player", 2), button("kits:refresh:kit", "One kit", 2)]),
      row([button("kits:refresh:all-users", "All linked players", 3), button("kits:refresh:all-kits", "Every kit", 3)]),
    ], flags: EPH };
}

export function kitRefreshModal(scope) {
  var label = scope === "user" ? "Gamertag" : "Kit name";
  return { title: "Clear cooldowns", custom_id: "modal:refresh:" + scope, components: [row([input("refresh_target", label, "", true)])] };
}

export function kitSpawnPanel(ctx) {
  var auth = ctx.kits().authSpawn || {};
  return { embeds: [embed(0xff7200, "Respawn kits per auth group",
    "Pick a group, then type the kit it should receive on every respawn. Leaving the kit blank stops that group receiving one.")],
    components: [
      row(AUTH_GROUPS.slice(0, 3).map(function (g) { return button("kits:spawn:" + g, g + (auth[g] ? " - " + auth[g] : ""), auth[g] ? 1 : 2); })),
      row(AUTH_GROUPS.slice(3).map(function (g) { return button("kits:spawn:" + g, g + (auth[g] ? " - " + auth[g] : ""), auth[g] ? 1 : 2); })),
      row([button("kits:config", "Back to Emote Kits", 2)]),
    ], flags: EPH };
}

export function kitSpawnModal(group, currentKit) {
  return { title: group + " respawn kit", custom_id: "modal:spawn:" + group, components: [
    row([input("spawn_kit", "Kit for " + group + " (blank to stop)", currentKit || "", false)]),
  ] };
}

export function kitAddPanel() {
  return { embeds: [embed(0x5865f2, "Install a kit",
    "Paste a Base64 install code from Kit Studio. The bot checks it really is Base64 that decodes to text, stores it exactly as given, and never guesses what is inside.")],
    components: [row([button("kits:add:code", "Enter a code", 1), button("kits:studio", "Open Kit Studio", 5)]), row([button("kits:config", "Back to Emote Kits", 2)])], flags: EPH };
}

export function kitAddModal() {
  return { title: "Install a kit", custom_id: "modal:kitcode", components: [
    row([input("install_code", "Base64 kit install code", "", true)]),
  ] };
}

export function kitsPanel(ctx) {
  var binds = ctx.kits().binds || [];
  var auth = ctx.kits().authSpawn || {};
  var built = embed(0xff7200, "Emote Kits",
    "A bind ties an emote to up to three kits, with a cooldown and an optional role. Cooldown bookkeeping is the bot own; emote names are your server own wording.");
  built.fields = [
    field("Binds", binds.length ? binds.map(function (b) {
      return code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " (" + b.cooldown + "s)" : "") + (b.roleId ? " <@&" + b.roleId + ">" : "");
    }).join("\n").slice(0, 1000) : "none yet", false),
    field("Lock kits", ctx.kits().locked ? "locked" : "unlocked", true),
    field("Auth groups with a kit", String(Object.keys(auth).length), true),
    field("Cooldowns on record", String(ctx.cooldownCount()), true),
  ];
  built.footer = { text: "Emote and kit names come from your own server" };
  return { embeds: [built], components: [
    row([button("kits:add", "Add a bind", 1), button("kits:edit", "Edit a bind", 2), button("kits:remove", "Remove a bind", 2)]),
    row([button("kits:lock", ctx.kits().locked ? "Unlock kits" : "Lock kits", 2), button("kits:guide", "Emote guide", 2), button("kits:refresh", "Cooldowns", 2)]),
  ], flags: EPH };
}
export function bindModal(existing) {
  var e = existing || {};
  var kits = e.kits || [];
  return { title: existing ? "Edit a bind" : "Add a bind",
    custom_id: "modal:bind" + (existing ? ":" + e.emote : ""),
    components: [
      row([input("bind_emote", "Emote name", e.emote || "", true)]),
      row([input("bind_kit1", "Kit 1", kits[0] || "", true)]),
      row([input("bind_kit2", "Kit 2", kits[1] || "", false)]),
      row([input("bind_kit3", "Kit 3", kits[2] || "", false)]),
      row([input("bind_cooldown", "Cooldown in seconds", e.cooldown ? String(e.cooldown) : "", false)]),
    ] };
}
export function bindList(ctx, mode) {
  var binds = ctx.kits().binds || [];
  var removing = mode === "remove";
  return { embeds: [embed(0xff7200, removing ? "Remove a bind" : "Edit a bind", binds.length ? "Choose one." : "No binds yet.")],
    components: binds.length ? [row([{ type: 3, custom_id: "kits:pickbind:" + (removing ? "remove" : "edit"), placeholder: "Your binds",
      options: binds.slice(0, 25).map(function (b) { return { label: b.emote.slice(0, 90), value: b.emote, description: (b.kits || []).join(", ").slice(0, 90) }; }) }])] : [row([button("kits:add", "Add a bind", 1)])],
    flags: EPH };
}
export function bindRoleMenu(emote) {
  return { embeds: [embed(0xff7200, "Who may use it?", "Pick the role allowed to use the " + code(emote) + " bind, or press Skip for everyone.")],
    components: [row([{ type: 6, custom_id: "kits:role:" + emote, placeholder: "Role (optional)" }]), row([button("kits:role:skip:" + emote, "Skip", 2)])], flags: EPH };
}
export function emoteGuide(ctx) {
  var binds = ctx.kits().binds || [];
  var auth = ctx.kits().authSpawn || {};
  return { embeds: [embed(0xff7200, "Emote guide",
    "This is what you have configured here. Nothing is filled in for you, because emote names are your server own.\n\n" +
    (binds.length ? binds.map(function (b) {
      return "- " + code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " | " + b.cooldown + "s cooldown" : "") + (b.roleId ? " | <@&" + b.roleId + "> only" : "");
    }).join("\n") : "No binds yet. Use Add a bind.") +
    "\n\nAuth groups on respawn: " + (Object.keys(auth).length ? Object.keys(auth).map(function (g) { return g + " -> " + auth[g]; }).join(", ") : "none set"))],
    components: [row([button("kits:config", "Back to the panel", 2)])], flags: EPH };
}
export function grabKits(ctx) {
  if (!String(ctx.kits().listCommand || "").trim()) {
    return { embeds: [embed(0xfaa81a, "No kit list command is set",
      "Reading the real kit names means asking your server a command it understands, and this bot will not invent the name of one.\n\nSet your kit plugin list command in the kit settings, and this runs it and shows exactly what comes back.")], flags: EPH };
  }
  return null;
}
export async function grabKitsRun(ctx) {
  var listCommand = String(ctx.kits().listCommand || "").replace(/[\r\n]+/g, " ").trim();
  if (!listCommand) return grabKits(ctx);
  var server = (ctx.servers() || [])[0];
  if (!server) return { embeds: [embed(0xdc4c4c, "No server linked", "Link one first with /setup server.")], flags: EPH };
  var answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: listCommand });
  var lines = String((answer && answer.answer) || "").split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
  var known = lines.filter(function (line) { return line.length <= 60 && /^[\p{L}\p{N}_ .-]+$/u.test(line); }).slice(0, 100);
  if (answer && answer.ok && known.length && ctx.setKnownKits) ctx.setKnownKits(known);
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c,
    answer && answer.ok ? "Kits the server reported" : "The server did not answer",
    answer && answer.ok ? (lines.length ? block(lines.slice(0, 40).join("\n").slice(0, 1500)) : "It answered with nothing.") : String((answer && answer.detail) || "no answer"));
  if (answer && answer.ok && known.length) built.fields = [field("Kit names learned for autocomplete", known.slice(0, 30).map(code).join(", ").slice(0, 1000), false)];
  return { embeds: [built], flags: EPH };
}


export function kitStudioPanel(ctx) {
  return { embeds: [embed(0x5865f2, "Kit Studio",
    "Build a kit slot by slot on the website, then bring it back here as an install code. The site and this bot share the same 299-item catalogue, so a kit made there is the same kit here.")],
    components: [row([link("Open Kit Studio", ctx.siteUrl + "/dashboard/kitbuilder.html"), button("kits:add", "Install a code", 1)])], flags: EPH };
}
export function installKit(ctx, rawCode) {
  var raw = String(rawCode || "").trim();
  if (!raw) return { embeds: [embed(0xdc4c4c, "No code given", "Paste the Base64 install code from Kit Studio.")], flags: EPH };
  if (raw.length > 16000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 === 1) {
    return { embeds: [embed(0xdc4c4c, "That code is not valid", "Paste a Base64 text code no longer than 16,000 characters. Nothing was stored.")], flags: EPH };
  }
  var text = null;
  try { text = Buffer.from(raw, "base64").toString("utf8"); } catch (error) { text = null; }
  var canonical = text && Buffer.from(text, "utf8").toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "");
  var ok = !!canonical && text.length > 2 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  if (!ok) return { embeds: [embed(0xdc4c4c, "That code does not decode", "The value must be valid Base64 that decodes to readable text. Nothing was stored.")], flags: EPH };
  var found = [];
  var seen = new Set();
  text.split(/\r?\n/).forEach(function (line) {
    var match = /^\s*kit\s+add\s+(?:"([^"]{1,60})"|'([^']{1,60})'|([^\s]{1,60}))/i.exec(line);
    if (!match) return;
    var name = String(match[1] || match[2] || match[3] || "").trim();
    var key = name.toLowerCase();
    if (!name || seen.has(key) || !/^[\p{L}\p{N}_ .-]+$/u.test(name)) return;
    seen.add(key);
    found.push(name);
  });
  found = found.slice(0, 100);
  var count = ctx.installKit(raw, text);
  if (found.length && ctx.setKnownKits) ctx.setKnownKits(found);
  var built = embed(0xfaa81a, "Code preview saved - not installed",
    "The bot saved a hash and short preview of this code. It does not execute pasted commands or install items on the Rust server. Recognised names below are suggestions only.");
  built.fields = [
    field("Kit names found", found.length ? found.slice(0, 20).map(code).join(", ") : "No kit add declarations were recognised", false),
    field("Decoded length", text.length + " characters", true),
    field("Code previews stored", String(count), true),
  ];
  return { embeds: [built], flags: EPH };
}


export function authSpawnNote(ctx, group, kit) {
  ctx.setAuthSpawn(group, kit);
  return { embeds: [embed(kit ? 0xfaa81a : 0x3ba55d, kit ? "Respawn preference saved - not active" : "Respawn preference cleared",
    kit
      ? "**" + group + "** is saved with preference " + code(kit) + ". Automatic respawn delivery needs a Rust game-event/plugin connector, which is not connected yet."
      : "**" + group + "** no longer has a saved respawn-kit preference.")], flags: EPH };
}
export function refreshCooldowns(ctx, scope, target) {
  var cleared = ctx.clearCooldowns(scope, target);
  var what = scope === "user" ? "gamertag " + target : scope === "kit" ? "kit " + target : scope === "all-users" ? "every linked user" : "every kit";
  return { embeds: [embed(0x3ba55d, "Cooldowns cleared", "Cleared **" + cleared + "** record" + (cleared === 1 ? "" : "s") + " for " + what + ".")], flags: EPH };
}
export async function giveKit(ctx, opts) {
  opts = opts || {};
  var kits = ctx.kits();
  if (kits.locked) return { embeds: [embed(0xfaa81a, "Kit delivery is paused",
    "A staff member paused manual kit delivery. Open **/kits config** and resume it before sending another kit.")], flags: EPH };
  var command = String(kits.giveCommand || "").replace(/[\r\n]+/g, " ").trim();
  var kit = String(opts.kit || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  if (!kit) return { embeds: [embed(0xdc4c4c, "Which kit?", "Enter the exact kit name you want to give.")], flags: EPH };
  var userValue = opts.user && typeof opts.user === "object" ? (opts.user.id || opts.user.value || "") : opts.user;
  var userId = String(userValue || "").trim();
  var linked = userId ? (ctx.links() || []).find(function (entry) { return String(entry.userId) === userId; }) : null;
  if (userId && !linked) return { embeds: [embed(0xfaa81a, "That Discord account is not linked",
    "Link the Discord account to its Rust gamertag first. The bot will never send a Discord id to the Rust server.")], flags: EPH };
  var target = String(opts.gamertag || (linked && linked.gamertag) || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  if (!target) return { embeds: [embed(0xdc4c4c, "Who should get it?", "Enter a gamertag or choose a Discord account that already has a confirmed link.")], flags: EPH };
  if (/[\u0000-\u001f;'"\\]/.test(target) || /[\u0000-\u001f;'"\\]/.test(kit)) {
    return { embeds: [embed(0xdc4c4c, "That name cannot be sent safely",
      "The gamertag or kit name contains a command separator, quote, backslash or control character. Remove those characters and try again.")], flags: EPH };
  }
  if (!command || !command.includes("{player}") || !command.includes("{kit}")) {
    return { embeds: [embed(0xfaa81a, "Delivery needs one more setting",
      "Set a give template in **/kits commands** containing both {player} and {kit}. The bot will not guess the plugin's command syntax.")], flags: EPH };
  }
  var server = (ctx.servers() || [])[0];
  if (!server) return { embeds: [embed(0xdc4c4c, "No server linked", "Link and test a Rust server in **/setup server** first.")], flags: EPH };
  var cooldownSeconds = Math.max(0, Math.min(86400, Number(kits.giveCooldownSeconds == null ? 30 : kits.giveCooldownSeconds) || 0));
  var reservation = ctx.reserveKitGive ? ctx.reserveKitGive(target, kit, cooldownSeconds) : { ok: true, key: null, cooldownSeconds: 0 };
  if (!reservation.ok) return { embeds: [embed(0xfaa81a, reservation.inProgress ? "That giveaway is already running" : "Giveaway cooldown",
    reservation.inProgress
      ? "A giveaway for " + code(target) + " and " + code(kit) + " is already in progress. Wait for its result."
      : "Wait **" + reservation.remainingSeconds + " seconds** before giving " + code(kit) + " to " + code(target) + " again.")], flags: EPH };
  var final = command.split("{player}").join(target).split("{kit}").join(kit).slice(0, 300);
  var answer = null;
  try {
    answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: final });
  } finally {
    if (ctx.finishKitGive) ctx.finishKitGive(reservation, !!(answer && answer.ok));
  }
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c, answer && answer.ok ? "Sent" : "The server refused it",
    "Player: " + code(target) + "\nKit: " + code(kit) + "\nCommand: " + code(final) + "\n"
    + (answer && answer.answer ? answer.answer.slice(0, 400) : String((answer && answer.detail) || "no answer"))
    + (answer && answer.ok && cooldownSeconds > 0 ? "\n\nA " + cooldownSeconds + "s per-player + kit cooldown is now active." : ""));
  return { embeds: [built], flags: EPH };
}


export function permissionNote(ctx) {
  var names = ctx ? staffRoleNames(ctx) : null;
  return embed(0xdc4c4c, "Not allowed",
    names
      ? "Staff commands are for the roles saved in step 1 of setup:\n\n" + names + "\n\nAdministrator and the server owner always count."
      : "No staff roles have been saved yet, so only Administrator, Manage Server and the server owner may run this. Save your staff roles in step 1 of /setup to hand this out.");
}

export function wrongGuildNote() { return embed(0xdc4c4c, "Wrong server", "Spinback RCE is configured for one Discord server, and this is not it."); }

export function optionMap(interaction) {
  var out = {};
  var list = (interaction.options && interaction.options.data) || [];
  list.forEach(function (o) {
    if (o.type === 1) { out.__sub = o.name; (o.options || []).forEach(function (inner) { out[inner.name] = inner.value; }); }
    else out[o.name] = o.value;
  });
  return out;
}
export function customId(interaction) {
  return String(interaction.customId || (interaction.data && interaction.data.custom_id) || "");
}
export function modalFields(interaction) {
  var out = {};
  var rows = interaction.components || ((interaction.data || {}).components) || [];
  rows.forEach(function (row) {
    (row.components || []).forEach(function (component) {
      var id = component && (component.customId || component.custom_id);
      if (id) out[id] = component.value == null ? "" : component.value;
    });
  });
  var collection = interaction.fields && interaction.fields.fields;
  if (collection && typeof collection.values === "function") {
    for (var fieldValue of collection.values()) {
      var key = fieldValue && (fieldValue.customId || fieldValue.custom_id);
      if (key && out[key] === undefined) out[key] = fieldValue.value == null ? "" : fieldValue.value;
    }
  }
  return out;
}
export function kitGivePanel(ctx) {
  var links = (ctx.links() || []).slice(0, 25);
  var components = [row([button("kits:give", "Type a kit and a gamertag", 1)])];
  if (links.length) {
    components.push(row([{ type: 3, custom_id: "kits:give:pick", placeholder: "Or pick a linked player",
      options: links.map(function (l) { return { label: l.gamertag.slice(0, 90), value: l.gamertag }; }) }]));
  } else {
    components.push(row([button("user:config", "Nobody is linked yet - open links", 2)]));
  }
  return { embeds: [embed(0xff7200, "Give a kit",
    "Two ways in: type the kit and a gamertag, or pick a player who is already linked. The kit goes out with the give template you saved, and the server answer is shown back to you as it comes.")],
    components: components, flags: EPH };
}

export function dispatchCommand(ctx, name, sub, options) {
  if (name === "ping") return pingReply(ctx);
  if (name === "help") return options.command ? helpDetail(options.command) : helpHome(ctx);
  /* /setup is how you get out of the gate, so it is the only command that runs before setup
     is finished. Everything else answers with the checklist instead of doing nothing. */
  if (name !== "setup") {
    var gate = setupState(ctx);
    if (gate.complete !== true) return gatePayload(ctx, "/" + name + (sub ? " " + sub : ""));
  }
  if (name === "setup") {
    if (sub === "refresh") return testServerByName(ctx, options.server);
    if (sub === "status") return setupStatus(ctx);
    if (sub === "roles") return setupRolePanel(ctx);
    if (sub === "channels") return channelSetupPanel(ctx);
    if (sub === "server") return serverStepPanel(ctx);
    if (sub === "suggest") return setupSuggest(ctx);
    if (sub === "doctor") return setupDoctor(ctx);
    if (sub === "import") return setupImportPanel();
    if (sub === "export") return setupExport(ctx);
    if (sub === "reset") return setupResetPanel(ctx);
    var panel = setupPanel(ctx);
    if (sub === "edit") panel.embeds[0].description = "Pick **3. Rust server** to change a saved server address, port or password. New details are tested before anything is saved.";
    return panel;
  }
  if (name === "kits") {
    if (sub === "grab") { var quick = grabKits(ctx); return quick || grabKitsRun(ctx); }
    if (sub === "commands") return kitCommandsPanel(ctx);
    if (sub === "doctor") return kitsDoctor(ctx);
    if (sub === "config") return kitsPanel(ctx);
    if (sub === "give") {
      if (!options.kit && !options.gamertag && !options.user) return kitGivePanel(ctx);
      return giveKit(ctx, { kit: options.kit, gamertag: options.gamertag, user: options.user });
    }
    if (sub === "refresh") {
      if (!options.scope) return kitRefreshPanel(ctx);
      return refreshCooldowns(ctx, options.scope, options.target);
    }
    if (sub === "auth-spawn") {
      if (!options.group) return kitSpawnPanel(ctx);
      return authSpawnNote(ctx, options.group, options.kit);
    }
    if (sub === "cooldowns") return cooldownsPanel(ctx, ctx.cooldownList());
    if (sub === "build") return kitStudioPanel(ctx);
    if (sub === "add") {
      if (!options.code) return kitAddPanel();
      return installKit(ctx, options.code);
    }
  }
  if (name === "server") return serverSnapshot(ctx, sub || "info");
  if (name === "user") {
    if (sub === "whois") return whoisReply(ctx, options.gamertag);
    if (sub === "pending") return pendingPanel(ctx);
    if (sub === "forcelink") return forcelinkPicker();
    if (sub === "forceunlink") return unlinkPicker(ctx);
    if (sub === "transfer") return transferPicker(ctx);
    if (sub === "linkpanel") return options.channel ? { postPanelTo: options.channel } : channelPickerForPanel();
    if (sub === "roster") return rosterPanel(ctx);
    return userPanel(ctx);
  }
  return { content: "That command is not wired up here yet.", flags: EPH };
}
