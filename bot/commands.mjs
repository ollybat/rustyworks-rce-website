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
  { name: "setup", description: "Configure Spinback RCE for this server", dm_permission: false,
    options: [
      { type: 1, name: "run", description: "Guided setup: roles, logging channels, then your Rust server" },
      { type: 1, name: "edit", description: "Change a saved server IP, RCON port or password" },
      { type: 1, name: "refresh", description: "Force a fresh RCON connection and report what the server says" },
    ] },
  { name: "kits", description: "Emote kits: binds, cooldowns, giving and installing", dm_permission: false,
    options: [
      { type: 1, name: "grab", description: "Read the real kit names from the Rust server" },
      { type: 1, name: "config", description: "Emote kit wizard: binds, cooldowns, roles, lock kits, emote guide" },
      { type: 1, name: "give", description: "Give a kit to a gamertag or a linked Discord user",
        options: [
          { type: 3, name: "kit", description: "Kit name", required: true },
          { type: 3, name: "gamertag", description: "In-game name to give it to" },
          { type: 6, name: "user", description: "Discord user whose linked gamertag receives it" },
        ] },
      { type: 1, name: "refresh", description: "Clear kit cooldowns",
        options: [
          { type: 3, name: "scope", description: "What to clear", required: true,
            choices: [{ name: "One user", value: "user" }, { name: "One kit", value: "kit" },
              { name: "All linked users", value: "all-users" }, { name: "All kits", value: "all-kits" }] },
          { type: 3, name: "target", description: "Gamertag or kit name, when the scope needs one" },
        ] },
      { type: 1, name: "auth-spawn", description: "Give a kit to an Auth Group on every respawn",
        options: [
          { type: 3, name: "group", description: "Auth group", required: true,
            choices: AUTH_GROUPS.map(function (g) { return { name: g, value: g }; }) },
          { type: 3, name: "kit", description: "Kit to hand out (blank stops giving one)" },
        ] },
      { type: 1, name: "build", description: "Kit Studio: build a kit on the website or work from an install code" },
      { type: 1, name: "add", description: "Install a kit from a Base64 kit install code",
        options: [{ type: 3, name: "code", description: "The Base64 install code", required: true }] },
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

/* /kits -------------------------------------------------------------------- */
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
export function permissionNote() { return embed(0xdc4c4c, "Not allowed", "This needs **Administrator** or **Manage Server** on this Discord server."); }
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
export function dispatchCommand(ctx, name, sub, options) {
  if (name === "ping") return pingReply(ctx);
  if (name === "setup") {
    if (sub === "refresh") return testServerByName(ctx, options.server);
    var panel = setupPanel(ctx);
    if (sub === "edit") panel.embeds[0].description = "Pick **3. Rust server** to change a saved server address, port or password. New details are tested before anything is saved.";
    return panel;
  }
  if (name === "kits") {
    if (sub === "grab") { var quick = grabKits(ctx); return quick || grabKitsRun(ctx); }
    if (sub === "config") return kitsPanel(ctx);
    if (sub === "give") return giveKit(ctx, { kit: options.kit, gamertag: options.gamertag, user: options.user });
    if (sub === "refresh") return refreshCooldowns(ctx, options.scope, options.target);
    if (sub === "auth-spawn") return authSpawnNote(ctx, options.group, options.kit);
    if (sub === "build") return kitStudioPanel(ctx);
    if (sub === "add") return installKit(ctx, options.code);
  }
  return { content: "That command is not wired up here yet.", flags: EPH };
}
