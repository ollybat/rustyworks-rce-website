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
  { name: "help", description: "What every command does, and what each one needs set up first", dm_permission: false },
  { name: "setup", description: "Configure Spinback RCE for this server", dm_permission: false,
    options: [
      { type: 1, name: "run", description: "Guided setup: roles, logging channels, then your Rust server" },
      { type: 1, name: "status", description: "Checklist of what is saved and what is still missing" },
      { type: 1, name: "edit", description: "Change a saved server IP, RCON port or password" },
      { type: 1, name: "refresh", description: "Force a fresh RCON connection and report what the server says" },
    ] },
  { name: "kits", description: "Emote kits: binds, cooldowns, giving and installing", dm_permission: false,
    options: [
      { type: 1, name: "grab", description: "Read the real kit names from the Rust server" },
      { type: 1, name: "config", description: "Emote kit wizard: binds, cooldowns, roles, lock kits, emote guide" },
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
  var built = embed(0x5865f2, "Spinback RCE", "Every line was measured just now, at " + when() + ".");
  built.fields = [
    field("Gateway", code(Number.isFinite(gw) && gw >= 0 ? gw + " ms" : "not measured") + " heartbeat\n" +
      (ctx.gateway === "online" ? "connected" : ctx.gateway || "unknown"), true),
    field("Uptime", code(duration(ctx.uptime())), true),
    field("Node", code(process.version), true),
    field("Memory", code(formatBytes(proc.rss)) + " resident\n" + code(formatBytes(proc.heapUsed)) + " heap", true),
    field("Guild", guild ? code(guild.name) + "\n" + guild.memberCount + " members, " + ((guild.roles && guild.roles.length) || 0) + " roles" : "not reported yet", true),
    field("Commands", code(String(ctx.commandCount())) + " registered here", true),
    field("Website", site.ok ? "answering, " + ms(site.ms) + (site.body && site.body.app ? "\napp: " + code(site.body.app) : "") : "no answer after " + ms(site.ms) + (site.error ? "\n" + site.error.slice(0, 90) : ""), true),
    field("Settings store", ctx.storeTokenSet() ? "the website accepts saves from this bot" : "not configured yet (BOT_SETTINGS_TOKEN)", true),
    field("Servers linked", code(String(ctx.servers().length)), true),
    field("How the check works", "one harmless command (serverinfo) over RCON, and whatever the server answers is what you see", false),
  ];
  built.footer = { text: "Site: " + ctx.siteUrl + " | checked at " + when() };
  return { embeds: [built], components: [row([button("ping:again", "Check again", 1), link("Status page", ctx.siteUrl + "/status.html")])] };
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
  built.fields = [
    field("Step 1 - Staff roles", setRoles.length ? setRoles.map(function (s) { return s[1] + ": <@&" + roles[s[0]] + ">"; }).join("\n") : "none saved yet", false),
    field("Step 2 - Logging channels", setChannels.length ? setChannels.length + " of " + LOG_TYPES.length + " log types have a channel" : "none saved yet", false),
    field("Step 3 - Rust servers", servers.length ? servers.map(function (s) { return code(s.name + " " + s.host + ":" + s.port); }).join("\n") : "none linked yet", false),
  ];
  built.footer = { text: "Needs Administrator or Manage Server. Passwords are never shown back to you." };
  return { embeds: [built], components: [
    row([button("setup:roles", "1. Roles", 1), button("setup:linked", "Linked role", 2), button("setup:channels", "2. Logging channels", 1)]),
    row([button("setup:server", "3. Rust server", 1), button("setup:test", "Test a connection", 2)]),
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

/* /help -------------------------------------------------------------------- */
export function helpHome() {
  return {
    embeds: [embed(0x5865f2, "Spinback RCE commands",
      "Pick a command to see every subcommand, who may run it and what it needs set up first.")],
    components: [
      row([button("help:cmd:ping", "/ping - live health", 1), button("help:cmd:setup", "/setup - configure", 1), button("help:cmd:kits", "/kits - emote kits", 1)]),
      row([button("help:cmd:server", "/server - ask your Rust", 1), button("help:cmd:user", "/user - player links", 1)]),
      row([link("Status page", "https://spinback-j7ao5f.camelai.app/status.html"), link("Commands reference", "https://spinback-j7ao5f.camelai.app/commands.html")]),
    ],
    flags: EPH,
  };
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
        "**run** - guided panel: roles, logging channels, then your Rust server",
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
  var built = embed(next.length ? 0xfaa81a : 0x3ba55d, "Setup status",
    next.length ? "What is saved right now is below, then what is still missing, in the order worth doing it." : "Everything the bot can check is in place.");
  built.fields = checks.map(function (c) { return field(c[0], c[1], true); });
  if (next.length) built.fields.push(field("What is missing", next.slice(0, 6).map(function (n) { return "- " + n; }).join("\n"), false));
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
  var saved = ROLE_SLOTS.map(function (s) { return s[0]; }).filter(function (key) { return roles[key]; });
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
  return ROLE_SLOTS.map(function (s) { return { slot: s[0], label: s[1], id: roles[s[0]] || null }; }).filter(function (r) { return r.id; });
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
  return { embeds: [built], components: [row([button("user:config", "Back to links", 2), button("user:forcelink", "Confirm one now", 1)])], flags: EPH };
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
  var server = ctx.servers()[0];
  if (!server) return { embeds: [embed(0xdc4c4c, "No server linked", "Link one first with /setup run.")], flags: EPH };
  var answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: ctx.kits().listCommand });
  var lines = String((answer && answer.answer) || "").split("\n").filter(Boolean);
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c,
    answer && answer.ok ? "Kits the server reported" : "The server did not answer",
    answer && answer.ok ? (lines.length ? block(lines.slice(0, 40).join("\n").slice(0, 1500)) : "It answered with nothing.") : String((answer && answer.detail) || "no answer"));
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
  var text = null;
  try { text = Buffer.from(raw, "base64").toString("utf8"); } catch (error) { text = null; }
  var ok = !!text && text.length > 2 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  if (!ok) return { embeds: [embed(0xdc4c4c, "That does not decode", "The value is not valid Base64, or it does not decode to readable text. Nothing was stored.")], flags: EPH };
  var count = ctx.installKit(raw, text);
  var built = embed(0x3ba55d, "Install code accepted",
    "Stored exactly as given, keyed by a hash of the code so two different codes cannot overwrite each other. Sending it to your server needs your own install command, set in the kit settings.");
  built.fields = [
    field("Decoded length", text.length + " characters", true),
    field("Codes stored", String(count), true),
    field("First line", code(text.split("\n")[0].slice(0, 150)), false),
  ];
  return { embeds: [built], flags: EPH };
}
export function authSpawnNote(ctx, group, kit) {
  ctx.setAuthSpawn(group, kit);
  return { embeds: [embed(kit ? 0x3ba55d : 0xfaa81a, kit ? "Respawn kit set" : "Respawn kit cleared",
    kit ? "**" + group + "** will be given " + code(kit) + " on respawn." : "**" + group + "** no longer receives a kit on respawn.")], flags: EPH };
}
export function refreshCooldowns(ctx, scope, target) {
  var cleared = ctx.clearCooldowns(scope, target);
  var what = scope === "user" ? "gamertag " + target : scope === "kit" ? "kit " + target : scope === "all-users" ? "every linked user" : "every kit";
  return { embeds: [embed(0x3ba55d, "Cooldowns cleared", "Cleared **" + cleared + "** record" + (cleared === 1 ? "" : "s") + " for " + what + ".")], flags: EPH };
}
export async function giveKit(ctx, opts) {
  var command = String(ctx.kits().giveCommand || "").trim();
  var target = opts.gamertag || opts.user || "";
  if (!command) {
    return { embeds: [embed(0xfaa81a, "Delivery needs one more setting",
      "To hand a kit over in game the bot must send your server own give command over RCON, and it will not guess what that is called.\n\nSet a template in the kit settings using {player} and {kit}, and this command runs exactly that.")], flags: EPH };
  }
  if (!target) return { embeds: [embed(0xdc4c4c, "Who should get it?", "Name a gamertag, or a Discord user whose gamertag is linked.")], flags: EPH };
  var server = ctx.servers()[0];
  if (!server) return { embeds: [embed(0xdc4c4c, "No server linked", "Link one first with /setup run.")], flags: EPH };
  var final = command.split("{player}").join(target).split("{kit}").join(opts.kit);
  var answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: final });
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c, answer && answer.ok ? "Sent" : "The server refused it",
    "Command: " + code(final) + "\n" + (answer && answer.answer ? "It said: " + answer.answer.slice(0, 400) : String((answer && answer.detail) || "no answer")));
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
  (((interaction.data || {}).components) || []).forEach(function (r) {
    ((r.components) || []).forEach(function (c) { if (c && c.custom_id) out[c.custom_id] = c.value; });
  });
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
  if (name === "help") return helpHome();
  /* /setup is how you get out of the gate, so it is the only command that runs before setup
     is finished. Everything else answers with the checklist instead of doing nothing. */
  if (name !== "setup") {
    var gate = setupState(ctx);
    if (gate.complete !== true) return gatePayload(ctx, "/" + name + (sub ? " " + sub : ""));
  }
  if (name === "setup") {
    if (sub === "refresh") return testServerByName(ctx, options.server);
    if (sub === "status") return setupStatus(ctx);
    var panel = setupPanel(ctx);
    if (sub === "edit") panel.embeds[0].description = "Pick **3. Rust server** to change a saved server address, port or password. New details are tested before anything is saved.";
    return panel;
  }
  if (name === "kits") {
    if (sub === "grab") { var quick = grabKits(ctx); return quick || grabKitsRun(ctx); }
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
    if (sub === "forcelink") return forcelinkPicker();
    if (sub === "forceunlink") return unlinkPicker(ctx);
    if (sub === "transfer") return transferPicker(ctx);
    if (sub === "linkpanel") return options.channel ? { postPanelTo: options.channel } : channelPickerForPanel();
    if (sub === "roster") return rosterPanel(ctx);
    return userPanel(ctx);
  }
  return { content: "That command is not wired up here yet.", flags: EPH };
}
