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
      { type: 1, name: "refresh", description: "Force a fresh RCON connection and report what the server says",
        options: [{ type: 3, name: "server", description: "Saved server to check (blank checks every one)", autocomplete: true }] },
    ] },
  { name: "kits", description: "Kit settings, player giveaways, cooldowns and kit-code previews", dm_permission: false,
    options: [
      { type: 1, name: "grab", description: "Read the real kit names from the Rust server",
        options: [{ type: 3, name: "server", description: "Saved server to ask (blank uses the first)", autocomplete: true }] },
      { type: 1, name: "config", description: "Emote kit wizard: binds, cooldowns, roles, lock kits, emote guide" },
      { type: 1, name: "give", description: "Give a kit to a gamertag or a linked Discord user",
        options: [
          { type: 3, name: "kit", description: "Kit name (leave blank to open the panel)", autocomplete: true },
          { type: 3, name: "gamertag", description: "In-game name to give it to", autocomplete: true },
          { type: 6, name: "user", description: "Discord user whose linked gamertag receives it" },
          { type: 3, name: "server", description: "Saved server to send it on (blank uses the first)", autocomplete: true },
        ] },
      { type: 1, name: "refresh", description: "Clear active manual kit-give cooldowns",
        options: [
          { type: 3, name: "scope", description: "What to clear (leave blank to open the panel)",
            choices: [{ name: "One user", value: "user" }, { name: "One kit", value: "kit" },
              { name: "All linked users", value: "all-users" }, { name: "All kits", value: "all-kits" }] },
          { type: 3, name: "target", description: "Gamertag or kit name, when the scope needs one", autocomplete: true },
        ] },
      { type: 1, name: "auth-spawn", description: "Save an Auth Group respawn-kit preference (game hook required)",
        options: [
          { type: 3, name: "group", description: "Auth group (leave blank to open the panel)",
            choices: AUTH_GROUPS.map(function (g) { return { name: g, value: g }; }) },
          { type: 3, name: "kit", description: "Kit to hand out (blank stops giving one)", autocomplete: true },
        ] },
      { type: 1, name: "cooldowns", description: "See active manual kit-give cooldowns" },
      { type: 1, name: "build", description: "Kit Studio: build a kit on the website or work from an install code" },
      { type: 1, name: "add", description: "Preview a kit code and recognise its kit names",
        options: [{ type: 3, name: "code", description: "The Base64 install code (blank opens the panel)" }] },
    ] },
  { name: "user", description: "Player links: who is who in your clan", dm_permission: false,
    options: [
      { type: 1, name: "forcelink", description: "Link a Discord user to a gamertag yourself",
        options: [
          { type: 6, name: "user", description: "Discord account to link (blank opens the picker)" },
          { type: 3, name: "gamertag", description: "Gamertag to attach to it" },
        ] },
      { type: 1, name: "forceunlink", description: "Remove a player link",
        options: [{ type: 3, name: "gamertag", description: "Linked player to remove (blank opens the list)", autocomplete: true }] },
      { type: 1, name: "transfer", description: "Move a link to a new Discord account or a new gamertag",
        options: [
          { type: 3, name: "gamertag", description: "Link to move (blank opens the list)", autocomplete: true },
          { type: 6, name: "to_user", description: "New Discord account for it" },
          { type: 3, name: "to_gamertag", description: "New gamertag for it" },
        ] },
      { type: 1, name: "linkpanel", description: "Post a panel with Link Account and Unlink buttons in a channel",
        options: [{ type: 7, name: "channel", description: "Channel to post it in", channel_types: [0] }] },
      { type: 1, name: "roster", description: "See every linked player, or search for one",
        options: [{ type: 3, name: "search", description: "Gamertag or Discord id to look for (blank lists everyone)", autocomplete: true }] },
    ] },
];

/* The slots that make someone staff. "linked" is the role given to linked players, so it must
   never count as staff: if it did, every linked player could run /setup and give kits. */
export const STAFF_SLOTS = ROLE_SLOTS.filter(function (s) { return s[0] !== "linked"; });

/* The log types the bot writes itself today. The rest need the in-game feed (kill feed, chat,
   teleports...), which is not connected yet, and the setup panel says so. */
export const LIVE_LOGS = ["command", "rcon", "linking", "emoteKits", "admin", "errors"];

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
/* A Discord timestamp that every viewer sees in their own time zone ("3 days ago"). */
function ago(when) {
  var t = Date.parse(when || "");
  return Number.isFinite(t) ? "<t:" + Math.floor(t / 1000) + ":R>" : "";
}
/* ------------------------------------------------------------- the look ---- */
/* Every reply passes through dress() on its way out, so the whole bot shares one look:
   the Spinback mark and name on top, a status marker on the title, a timestamp each viewer
   sees in their own time, and a small icon on each button so panels scan at a glance.
   It only adds what is missing and never pushes a reply past Discord's limits. */
export const BRAND = "Spinback RCE";
var TITLE_MARKS = { 0x3ba55d: "\u2705", 0xdc4c4c: "\u26d4", 0xfaa81a: "\u26a0\ufe0f" };
var BUTTON_ICONS = [
  [/^(back|all commands|home)|back to|^cancel|keep it|left alone/i, "\u21a9\ufe0f"],
  [/^previous|^prev\b|\u2190/i, "\u25c0\ufe0f"],
  [/^next|\u2192/i, "\u25b6\ufe0f"],
  [/check again|refresh|read again|test|try again|try another|read kit names/i, "\ud83d\udd04"],
  [/reject|remove|delete|unlink|clear/i, "\ud83d\uddd1\ufe0f"],
  [/^yes|approve|save|confirm/i, "\u2705"],
  [/transfer/i, "\ud83d\udd00"],
  [/role/i, "\ud83d\udee1\ufe0f"],
  [/roster|players/i, "\ud83d\udc65"],
  [/link/i, "\ud83d\udd17"],
  [/one player/i, "\ud83d\udc64"],
  [/reference|help|guide/i, "\ud83d\udcd6"],
  [/set it now/i, "\u2699\ufe0f"],
  [/code/i, "\ud83e\uddf0"],
  [/open the list/i, "\u23f3"],
  [/give/i, "\ud83c\udf81"],
  [/^add|new|install/i, "\u2795"],
  [/channel|log/i, "\ud83d\udcdc"],
  [/server/i, "\ud83d\udda5\ufe0f"],
  [/waiting|pending/i, "\u23f3"],
  [/cooldown/i, "\u23f1\ufe0f"],
  [/status|ping/i, "\ud83d\udce1"],
  [/edit|settings|config|delivery|setup|emote/i, "\u2699\ufe0f"],
  [/kit|studio|build/i, "\ud83e\uddf0"],
];
function startsWithMark(text) { return /^[\u2190-\u2bff\ud83c-\ud83e\u2600-\u27bf]/.test(String(text || "")); }
export function buttonIcon(label) {
  for (var i = 0; i < BUTTON_ICONS.length; i++) if (BUTTON_ICONS[i][0].test(String(label || ""))) return BUTTON_ICONS[i][1];
  return null;
}
function embedSize(e) {
  var n = String(e.title || "").length + String(e.description || "").length + String((e.footer || {}).text || "").length + String((e.author || {}).name || "").length;
  (e.fields || []).forEach(function (f) { n += String(f.name || "").length + String(f.value || "").length; });
  return n;
}
export function dress(payload, ctx) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.custom_id) return payload;
  var site = ctx && ctx.siteUrl ? String(ctx.siteUrl).replace(/\/+$/, "") : "";
  var icon = /^https:\/\//.test(site) ? site + "/media/icon-192.png" : undefined;
  var out = Object.assign({}, payload);
  if (Array.isArray(out.embeds)) {
    var total = out.embeds.reduce(function (n, e) { return n + embedSize(e || {}); }, 0);
    out.embeds = out.embeds.map(function (e, i) {
      if (!e || typeof e !== "object") return e;
      var d = Object.assign({}, e);
      var mark = TITLE_MARKS[d.color];
      if (mark && d.title && !startsWithMark(d.title) && d.title.length < 240) { d.title = mark + " " + d.title; total += 3; }
      if (i === 0 && !d.author && total + BRAND.length < 5900) { d.author = icon ? { name: BRAND, icon_url: icon } : { name: BRAND }; total += BRAND.length; }
      if (i === out.embeds.length - 1 && !d.timestamp) d.timestamp = new Date().toISOString();
      if (i === out.embeds.length - 1 && !d.footer && total + BRAND.length < 5900) { d.footer = icon ? { text: BRAND, icon_url: icon } : { text: BRAND }; total += BRAND.length; }
      else if (d.footer && icon && !d.footer.icon_url) d.footer = Object.assign({}, d.footer, { icon_url: icon });
      return d;
    });
  }
  if (Array.isArray(out.components)) {
    out.components = out.components.map(function (r) {
      if (!r || r.type !== 1 || !Array.isArray(r.components)) return r;
      return Object.assign({}, r, { components: r.components.map(function (c) {
        if (!c || c.type !== 2 || c.emoji || startsWithMark(c.label)) return c;
        var e = buttonIcon(c.label);
        return e ? Object.assign({}, c, { emoji: { name: e } }) : c;
      }) });
    });
  }
  return out;
}

/* Shown at the top of the setup panels while nothing is being saved for real. */
export function storageWarning(ctx) {
  if (ctx.storeTokenSet()) return null;
  return embed(0xdc4c4c, "Settings are not being saved",
    "BOT_SETTINGS_TOKEN is not set on the bot, so everything set up here - roles, servers, log channels, binds and player links - lives in the bot's memory and is lost the next time it restarts or redeploys.\n\n" +
    "**Fix:** choose a long random value and set it as BOT_SETTINGS_TOKEN in two places: the bot's service on Railway, and the website's environment. Use the same value in both. The website's Settings page then works too.");
}
/* The last RCON check of a saved server, as one line: "answered 2 minutes ago, 41 ms". */
function checkDot(ctx, server) {
  var c = ctx.serverChecks ? ctx.serverChecks()[server.id] : null;
  return !c ? "\u26aa" : c.ok ? "\ud83d\udfe2" : "\ud83d\udd34";
}
/* A small progress bar for panels: "▰▰▱ 2 of 3". */
export function progressBar(done, total) {
  var d = Math.max(0, Math.min(total, done));
  return "\u25b0".repeat(d) + "\u25b1".repeat(total - d) + " " + d + " of " + total;
}
function lastCheckLine(ctx, server) {
  var c = ctx.serverChecks ? ctx.serverChecks()[server.id] : null;
  if (!c) return "not checked since the bot started";
  return (c.ok ? "answered" : "did not answer (" + (c.reason || "unknown") + ")") + " " + ago(c.at) + (c.ok && Number.isFinite(c.ms) ? ", " + c.ms + " ms" : "");
}
/* Anything typed by a person that is put into an RCON command line: no quotes, backslashes or
   control characters, one space at a time, and a sane length. */
export function cleanArg(value) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
/* A saved server by id or name (case-insensitive). No name means the first one; a name that
   matches nothing means none, so a typo never sends a command to the wrong server. */
export function findServer(ctx, wanted) {
  var list = ctx.servers() || [];
  var w = String(wanted || "").trim().toLowerCase();
  if (!w) return list[0] || null;
  return list.filter(function (s) { return String(s.id).toLowerCase() === w || String(s.name || "").toLowerCase() === w; })[0] || null;
}
function noServerPayload(ctx, wanted) {
  var names = (ctx.servers() || []).map(function (s) { return code(s.name); }).join(", ");
  return { embeds: [embed(0xdc4c4c, wanted ? "No saved server called " + String(wanted).slice(0, 60) : "No server linked",
    wanted ? "Saved servers: " + (names || "none") + ". Pick one from the suggestions as you type." : "Link one first with /setup run.")], flags: EPH };
}
/* Every kit name the bot has a real source for: what /kits grab read from the server, the
   kits in binds, and the respawn kits. Used for suggestions only; typing any name still works. */
export function knownKitNames(ctx) {
  var kits = ctx.kits() || {};
  var seen = {}, out = [];
  function add(n) { var k = String(n || "").trim(); if (!k || seen[k.toLowerCase()]) return; seen[k.toLowerCase()] = 1; out.push(k); }
  (kits.known || []).forEach(add);
  (kits.binds || []).forEach(function (b) { (b.kits || []).forEach(add); });
  Object.keys(kits.authSpawn || {}).forEach(function (g) { add(kits.authSpawn[g]); });
  return out;
}
/* Suggestions while someone types an option. Up to 25, names that start with what was typed
   first, then names that contain it. */
export function autocompleteChoices(ctx, name, sub, focused, opts) {
  var typed = String((focused && focused.value) || "").trim().toLowerCase();
  var fieldName = focused && focused.name;
  var pool = [];
  if (fieldName === "server") {
    pool = (ctx.servers() || []).map(function (s) { return { name: s.name + " (" + s.host + ":" + s.port + ")", value: s.id, match: s.name }; });
  } else if (fieldName === "kit" || (fieldName === "target" && opts && opts.scope === "kit")) {
    pool = knownKitNames(ctx).map(function (k) { return { name: k, value: k, match: k }; });
  } else if (fieldName === "gamertag" || fieldName === "target" || fieldName === "search") {
    pool = (ctx.links() || []).map(function (l) { return { name: l.gamertag, value: l.gamertag, match: l.gamertag }; });
  }
  var starts = [], contains = [];
  pool.forEach(function (c) {
    var m = String(c.match || c.name).toLowerCase();
    if (!typed || m.indexOf(typed) === 0) starts.push(c);
    else if (m.indexOf(typed) > -1 || String(c.name).toLowerCase().indexOf(typed) > -1) contains.push(c);
  });
  return starts.concat(contains).slice(0, 25).map(function (c) { return { name: String(c.name).slice(0, 100), value: String(c.value).slice(0, 100) }; });
}
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
    var res = await fetch(ctx.siteUrl + "/api/config-check", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(2500) });
    site.ms = Date.now() - started;
    site.ok = res.ok;
    try { site.body = await res.json(); } catch (e) { site.body = null; }
  } catch (error) { site.ms = Date.now() - started; site.error = String((error && error.message) || error); }
  var proc = process.memoryUsage();
  var gw = ctx.ping();
  var guild = ctx.guildInfo;
  var gwOk = Number.isFinite(gw) && gw >= 0;
  var gwDot = !gwOk ? "\u26aa" : gw < 200 ? "\ud83d\udfe2" : gw < 500 ? "\ud83d\udfe1" : "\ud83d\udd34";
  var checks = ctx.serverChecks ? ctx.serverChecks() : {};
  var serverDown = ctx.servers().some(function (s) { return checks[s.id] && !checks[s.id].ok; });
  var healthy = site.ok && ctx.storeTokenSet() && !serverDown && ctx.gateway === "online";
  var built = embed(!site.ok ? 0xdc4c4c : healthy ? 0x5865f2 : 0xff7200, "Bot status",
    (healthy ? "\ud83d\udfe2 **Everything is answering.**" : !site.ok ? "\ud83d\udd34 **The website is not answering.**" : "\ud83d\udfe1 **Running, with something to look at below.**") +
    "\nEvery line was measured just now, at " + when() + ".");
  built.fields = [
    field(gwDot + " Gateway", code(Number.isFinite(gw) && gw >= 0 ? gw + " ms" : "not measured") + " heartbeat\n" +
      (ctx.gateway === "online" ? "connected" : ctx.gateway || "unknown"), true),
    field("Uptime", code(duration(ctx.uptime())), true),
    field("Node", code(process.version), true),
    field("Memory", code(formatBytes(proc.rss)) + " resident\n" + code(formatBytes(proc.heapUsed)) + " heap", true),
    field("Guild", guild ? code(guild.name) + "\n" + guild.memberCount + " members, " + ((guild.roles && guild.roles.length) || 0) + " roles" : "not reported yet", true),
    field("Commands", code(String(ctx.commandCount())) + " registered here", true),
    field((site.ok ? "\ud83d\udfe2" : "\ud83d\udd34") + " Website", site.ok ? "answering, " + ms(site.ms) + (site.body && site.body.app ? "\napp: " + code(site.body.app) : "") : "no answer after " + ms(site.ms) + (site.error ? "\n" + site.error.slice(0, 90) : ""), true),
    field((ctx.storeTokenSet() ? "\ud83d\udfe2" : "\ud83d\udd34") + " Settings store", ctx.storeTokenSet() ? "the website accepts saves from this bot" : "not saved anywhere: BOT_SETTINGS_TOKEN is not set, so a restart forgets everything", true),
    field("Rust servers (" + ctx.servers().length + ")", ctx.servers().length
      ? fitLines(ctx.servers().map(function (s) { return checkDot(ctx, s) + " **" + s.name + "**: " + lastCheckLine(ctx, s); }), 1000)
      : "none linked yet", false),
    field("How the check works", "Gateway, uptime and memory come from this bot process; the website line is a live request made just now. Rust servers show their last RCON check - run **/setup refresh** for a fresh one.", false),
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
  var done = (setRoles.some(function (r) { return r[0] !== "linked"; }) ? 1 : 0) + (setChannels.length ? 1 : 0) + (servers.length ? 1 : 0);
  var tick = function (ok) { return ok ? "\u2705" : "\u2b1c"; };
  var built = embed(done === 3 ? 0x3ba55d : 0xff7200, "Spinback RCE setup",
    "**Progress** " + progressBar(done, 3) + (done === 3 ? " - all set" : "") + "\n\n" +
    "Three steps: roles, logging channels, then your Rust server. Roles and channels are picked from Discord's own menus, and the RCON connection is tested before anything is saved, so a wrong port or password never lands in your settings.");
  built.fields = [
    field(tick(setRoles.some(function (r) { return r[0] !== "linked"; })) + " Step 1 - Staff roles", setRoles.length ? setRoles.map(function (s) { return s[1] + ": <@&" + roles[s[0]] + ">"; }).join("\n") : "none saved yet", false),
    field(tick(setChannels.length) + " Step 2 - Logging channels", setChannels.length
      ? setChannels.slice(0, 8).map(function (s) { return s[1] + " -> <#" + channels[s[0]] + ">"; }).join("\n") + (setChannels.length > 8 ? "\n+" + (setChannels.length - 8) + " more" : "")
      : "none saved yet", false),
    field(tick(servers.length) + " Step 3 - Rust servers", servers.length ? fitLines(servers.map(function (s) { return checkDot(ctx, s) + " " + code(s.name + " " + s.host + ":" + s.port) + " - " + lastCheckLine(ctx, s); }), 1000) : "none linked yet", false),
  ];
  built.footer = { text: "Staff roles, Administrator, Manage Server and the server owner may change this. Passwords are never shown back to you." };
  var warning = storageWarning(ctx);
  return { embeds: warning ? [warning, built] : [built], components: [
    row([button("setup:roles", "1. Staff roles", 1), button("setup:linked", "Linked role", 2), button("setup:channels", "2. Logging channels", 1)]),
    row([button("setup:server", "3. Add a Rust server", 1), button("setup:edit", "Edit a server", 2), button("setup:test", "Test connections", 2)]),
  ], flags: EPH };
}
/* Staff roles are picked from Discord's own role menu: no Developer Mode, no copied ids. Each
   menu saves on its own, and clearing one removes that slot. Page 1 holds four slots, page 2
   the moderator and linked roles, because a message has room for five rows. */
export function rolesPanel(ctx, page) {
  var roles = ctx.settings.staffRoles || {};
  var second = Number(page) === 2;
  var slots = second ? ROLE_SLOTS.slice(4) : ROLE_SLOTS.slice(0, 4);
  var rows = slots.map(function (s) {
    var menu = { type: 6, custom_id: "setup:role:" + s[0], min_values: 0, max_values: 1,
      placeholder: s[0] === "linked" ? "Linked role (given to confirmed players)" : s[1] + " role" };
    if (roles[s[0]]) menu.default_values = [{ id: String(roles[s[0]]), type: "role" }];
    return row([menu]);
  });
  rows.push(row(second
    ? [button("setup:roles", "Back: first four roles", 2), button("setup:channels", "Next: logging channels", 1)]
    : [button("setup:roles:2", "Next: moderator and linked roles", 1), button("setup:home", "Back to setup", 2)]));
  var saved = ROLE_SLOTS.filter(function (s) { return roles[s[0]]; });
  var built = embed(0xff7200, "Roles (" + (second ? 2 : 1) + " of 2)",
    second
      ? "**Moderator** is a staff role. **Linked** is not: it is the role the bot gives a player once their gamertag is confirmed, and takes away when they are unlinked. Each pick saves straight away."
      : "Pick a role for each slot. Each pick saves straight away, and clearing a menu removes that slot. Staff commands are for these roles, plus Administrator, Manage Server and the server owner.");
  built.fields = [field("Saved now", saved.length ? saved.map(function (s) { return s[1] + ": <@&" + roles[s[0]] + ">"; }).join("\n") : "none yet", false)];
  return { embeds: [built], components: rows, flags: EPH };
}
export function rolesModal() {
  return { title: "Staff roles", custom_id: "modal:roles",
    components: STAFF_SLOTS.slice(0, 5).map(function (s) { return row([input("role_" + s[0], s[1] + " role id", "", false)]); }) };
}
export function linkedRoleModal() {
  return { title: "Linked role", custom_id: "modal:linked",
    components: [row([input("role_linked", "Role id for linked players", "", false)])] };
}
export function logTypeMenu(ctx) {
  var channels = (ctx && ctx.settings.logChannels) || {};
  return { embeds: [embed(0x1abc9c, "Logging channels",
    "Choose a log type, then pick its channel, or clear the channel to switch that log off. Types marked **written by the bot** work today; the others need the in-game feed (kill feed, chat and so on), which is not connected yet.")],
    components: [
      row([{ type: 3, custom_id: "setup:logtype", placeholder: "Which kind of log?",
        options: LOG_TYPES.slice(0, 25).map(function (p) {
          return { label: p[1], value: p[0], description: (channels[p[0]] ? "On" : "Off") + " - " + (LIVE_LOGS.indexOf(p[0]) > -1 ? "written by the bot" : "needs the in-game feed") };
        }) }]),
      row([button("setup:home", "Back to setup", 2)]),
    ], flags: EPH };
}
export function channelMenu(typeKey, ctx) {
  var found = LOG_TYPES.filter(function (p) { return p[0] === typeKey; })[0];
  var current = ((ctx && ctx.settings.logChannels) || {})[typeKey];
  var menu = { type: 8, custom_id: "setup:channel:" + typeKey, placeholder: "Where should these logs go?", channel_types: [0, 5], min_values: 0, max_values: 1 };
  if (current) menu.default_values = [{ id: String(current), type: "channel" }];
  var nav = [button("setup:channels", "Back to log types", 2)];
  if (current) nav.push(button("setup:logtest:" + typeKey, "Send a test message", 2));
  return { embeds: [embed(0x1abc9c, "Pick a channel",
    "Log type: **" + (found ? found[1] : typeKey) + "**" + (current ? "\nNow going to <#" + current + ">. Clear the menu to switch it off." : "\nOff right now.") +
    (LIVE_LOGS.indexOf(typeKey) > -1 ? "" : "\n\nThis type needs the in-game feed, which is not connected yet, so nothing will arrive until it is."))],
    components: [row([menu]), row(nav)], flags: EPH };
}
export function serverModal(existing) {
  var e = existing || {};
  return { title: existing ? "Edit Rust server" : "Add a Rust server",
    custom_id: "modal:server" + (existing ? ":" + e.id : ""),
    components: [
      row([input("srv_name", "Server name", e.name || "", !existing)]),
      row([input("srv_host", "Server IP or host", e.host || "", true)]),
      row([input("srv_port", "RCON port", e.port ? String(e.port) : "", true)]),
      row([input("srv_pass", existing ? "RCON password (blank keeps the saved one)" : "RCON password", "", !existing)]),
    ] };
}
/* One list, two jobs: testing a server (mode "test") and opening its edit form ("edit"). */
export function serverPicker(ctx, mode) {
  var testing = mode !== "edit";
  var servers = ctx.servers();
  if (!servers.length) return { embeds: [embed(0xdc4c4c, "No server saved yet", "Add one with **3. Add a Rust server** on the setup panel.")],
    components: [row([button("setup:server", "Add a server", 1), button("setup:home", "Back to setup", 2)])], flags: EPH };
  var rows = [row([{ type: 3, custom_id: testing ? "setup:pick:test" : "setup:pick", placeholder: testing ? "Server to test" : "Server to edit",
    options: servers.slice(0, 25).map(function (s) { return { label: s.name.slice(0, 90), value: s.id, description: (s.host + ":" + s.port).slice(0, 90) }; }) }])];
  rows.push(row(testing
    ? [button("setup:testall", servers.length > 1 ? "Test every server" : "Test it now", 1), button("setup:home", "Back to setup", 2)]
    : [button("setup:home", "Back to setup", 2)]));
  return { embeds: [embed(0xff7200, testing ? "Test a connection" : "Edit a server",
    testing ? "Choose a server, or test them all at once. Each check opens a fresh RCON connection and asks it serverinfo; nothing is changed."
      : "Choose the server to edit. Leave the password blank to keep the saved one; the new details are tested before anything is saved.")],
    components: rows, flags: EPH };
}
export async function testAndSaveServer(ctx, data, existingId) {
  var before = existingId ? (ctx.servers() || []).filter(function (s) { return s.id === existingId; })[0] : null;
  var host = String(data.srv_host || "").trim() || (before ? String(before.host || "") : "");
  var portText = String(data.srv_port || "").trim();
  var port = portText ? Number(portText) : (before ? Number(before.port) : NaN);
  /* Editing with the password left blank keeps the saved one, so changing a name or a port
     does not mean typing the password again (and a blank one used to fail the test). */
  var password = String(data.srv_pass || "") || (before ? String(before.password || "") : "");
  var name = String(data.srv_name || "").trim() || (before ? before.name : host);
  var retry = row([button(existingId ? "setup:edit" : "setup:server", "Try again", 1), button("setup:home", "Back to setup", 2)]);
  if (!host) return { embeds: [embed(0xdc4c4c, "Not saved", "The server IP or host is required.")], components: [retry], flags: EPH };
  if (!(Number.isInteger(port) && port >= 1 && port <= 65535)) {
    return { embeds: [embed(0xdc4c4c, "Not saved", "The RCON port must be a whole number from 1 to 65535 (you typed " + code(portText || "nothing") + ").")], components: [retry], flags: EPH };
  }
  var answer = await ctx.rconTest({ host: host, port: port, password: password, command: "serverinfo" });
  if (!answer || answer.ok !== true) {
    return { embeds: [embed(0xdc4c4c, "Not saved - the connection failed",
      "**" + host + ":" + port + "** did not answer the check, so nothing was written.\n\nReason: " +
      code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 400))],
      components: [retry], flags: EPH };
  }
  var saved = await ctx.saveServer({ id: existingId, name: name, host: host, port: port, password: password });
  var lines = String(answer.answer || "").split("\n").slice(0, 6).join("\n");
  var built = embed(0x3ba55d, existingId ? "Server updated" : "Server linked and tested",
    "**" + name + "** answered " + code(answer.command || "serverinfo") + " in " + ms(answer.ms) + ".\n" +
    (saved.ok ? "Saved to the website." : "Kept in this bot memory only: " + saved.detail));
  if (lines) built.fields = [field("What the server said", block(lines.slice(0, 900)), false)];
  return { embeds: [built], components: [row([button("setup:test", "Test connections", 2), button("setup:server", "Add another", 2), button("setup:home", "Back to setup", 2)])], flags: EPH };
}
/* A fresh RCON check of one saved server, or of every saved server at once (in parallel). */
export async function testServers(ctx, wanted) {
  var all = ctx.servers() || [];
  if (!all.length) return noServerPayload(ctx, "");
  var list = wanted ? [findServer(ctx, wanted)].filter(Boolean) : all.slice(0, 10);
  if (!list.length) return noServerPayload(ctx, wanted);
  var answers = await Promise.all(list.map(function (s) {
    return Promise.resolve(ctx.rconTest({ host: s.host, port: s.port, password: s.password, command: "serverinfo" }))
      .catch(function (error) { return { ok: false, reason: "unexpected", detail: String((error && error.message) || error) }; });
  }));
  if (ctx.recordCheck) list.forEach(function (s, i) { ctx.recordCheck(s.id, answers[i]); });
  var good = answers.filter(function (a) { return a && a.ok; }).length;
  var room = list.length > 3 ? 220 : 600;
  var built = embed(good === list.length ? 0x3ba55d : good ? 0xfaa81a : 0xdc4c4c,
    list.length === 1 ? (good ? "A fresh connection works" : "A fresh connection failed") : good + " of " + list.length + " servers answered",
    "Each check opens a fresh RCON connection and asks " + code("serverinfo") + ". Nothing is changed.");
  built.fields = list.map(function (s, i) {
    var a = answers[i];
    var said = a && a.ok && a.answer ? "\n" + block(String(a.answer).split("\n").slice(0, 5).join("\n").slice(0, room)) : "";
    return field((s.name + " (" + s.host + ":" + s.port + ")").slice(0, 250),
      a && a.ok ? "answered in " + ms(a.ms) + said : "did not answer: " + code((a && a.reason) || "unknown") + "\n" + String((a && a.detail) || "").slice(0, 300), false);
  });
  return { embeds: [built], components: [row([button(list.length === 1 && wanted ? "setup:test" : "setup:testall", "Test again", 2), button("setup:edit", "Edit a server", 2)])], flags: EPH };
}
export function testServerByName(ctx, name) { return testServers(ctx, name); }

/* /help -------------------------------------------------------------------- */
var STAFF_RULE = "Staff: the roles saved in step 1 of /setup, plus Administrator, Manage Server and the server owner. Before any staff role is saved, only those last three.";
function helpButtons(current) {
  return row(["ping", "setup", "kits", "user"].map(function (n) { return button("help:cmd:" + n, "/" + n, n === current ? 1 : 2); }));
}
export function helpHome(ctx) {
  var site = (ctx && ctx.siteUrl) || "https://spinback-j7ao5f.camelai.app";
  var built = embed(0x5865f2, "Spinback RCE commands",
    "Pick a command to see every subcommand, who may run it and what it needs set up first.\n\n" +
    "**/ping** - live bot and website health\n**/setup** - roles, logging channels and your Rust server\n" +
    "**/kits** - kit settings, manual giveaways and cooldowns\n**/user** - player links: confirm, move, remove, roster\n" +
    "**/help** - this page");
  built.footer = { text: "Options with suggestions (kits, gamertags, servers) fill in as you type" };
  return {
    embeds: [built],
    components: [helpButtons("") , row([link("Status page", site + "/status.html")])],
    flags: EPH,
  };
}

export function helpDetail(name, ctx) {
  var pages = {
    ping: embed(0x5865f2, "Help: /ping",
      "One embed, everything in it measured at the moment you run it: the gateway heartbeat, uptime, Node version, memory, the guild this bot is in, how many commands it registered, and a live request to the website with the round-trip time."),
    setup: embed(0xff7200, "Help: /setup",
      "Your server, wired up in three steps. Roles and channels come from Discord's own pickers, and the Rust connection is tested before anything is saved, so a wrong port or password never lands in your settings."),
    kits: embed(0xff7200, "Help: /kits",
      "Configure bind and Auth Group preferences, read kit names from your server, and manually give kits to linked players over RCON. Automatic emote and respawn actions require a Rust game-event/plugin connector, which is not connected yet."),
    user: embed(0x1abc9c, "Help: /user",
      "Player links: a Discord account with the Rust Console gamertag it belongs to. Players ask through the link panel; staff confirm, move or remove links, and the linked role follows the link."),
  };
  var extras = {
    ping: [
      field("Permissions", "Anyone in this server can run it.", false),
      field("Needs first", "Nothing. It works before setup is finished.", false),
    ],
    setup: [
      field("Subcommands", [
        "**run** - the setup panel: roles, logging channels, then your Rust servers",
        "**status** - a checklist of what is saved, plus live checks: can the bot post in each log channel, do the roles still exist, can it give the linked role",
        "**edit** - pick a saved server and change its address, port or password",
        "**refresh** `server` - a fresh RCON check of one server, or of every server (the result also shows in /ping)",
      ].join("\n"), false),
      field("Saving", "Settings are kept on the website. If the bot cannot write there (no BOT_SETTINGS_TOKEN), /setup says so in red: changes then last only until the bot restarts.", false),
      field("Permissions", STAFF_RULE + " Panels are only visible to you.", false),
      field("Needs first", "The RCON port and password from server.cfg, with rcon.web set to 0.", false),
    ],
    kits: [
      field("Subcommands", [
        "**grab** `server` - read the real kit names from your server (they then autocomplete)",
        "**config** - saved bind preferences, manual delivery, pause switch and guide",
        "**give** `kit` `gamertag` or `user` `server` - manually give a kit over RCON",
        "**refresh** `scope` `target` - clear manual giveaway cooldown records",
        "**cooldowns** - active manual giveaway timers (held in memory; reset on bot restart)",
        "**auth-spawn** `group` `kit` - save a respawn-kit preference; needs a Rust game-event connector to run",
        "**build** - open Kit Studio on the website",
        "**add** `code` - preview a Base64 code and recognise kit names; does not install the code",
      ].join("\n"), false),
      field("Delivery settings", "In **/kits config**, set the list command, give template and giveaway cooldown. Successful manual giveaways start a timer per gamertag + kit; failed RCON attempts do not. The manual pause switch blocks giveaways. Cooldown timers are in memory and reset when the bot restarts.", false),
      field("Permissions", STAFF_RULE, false),
      field("Needs first", "Finish setup, then configure your Rust plugin's list command and give template. Saved bind and respawn preferences do not trigger in-game actions until a Rust game-event/plugin connector is installed.", false),
    ],
    user: [
      field("Subcommands", [
        "**forcelink** `user` `gamertag` - link someone yourself (or pick them from a menu)",
        "**forceunlink** `gamertag` - remove a link, after a confirmation",
        "**transfer** `gamertag` `to_user` `to_gamertag` - move a link to a new account or gamertag",
        "**linkpanel** `channel` - post the Link account / Unlink panel for players",
        "**roster** `search` - every linked player, page by page, or only those matching a gamertag or Discord id",
      ].join("\n"), false),
      field("Waiting list", "Players who asked through the panel wait on the **Waiting list** in /user until staff approve or reject them, in one click each. The player is told by direct message either way (unless their DMs are closed; the reply says which). Posting a new link panel offers to remove the old one.", false),
      field("Permissions", STAFF_RULE + " The link panel's own buttons work for everyone.", false),
      field("Needs first", "Setup finished. Set a Linked role in /setup to have it given and taken away automatically (the bot needs Manage Roles, above that role).", false),
    ],
  };
  var out = pages[name] || pages.ping;
  out.fields = extras[name] || extras.ping;
  return { embeds: [out], components: [helpButtons(name), row([button("help:home", "All commands", 2)])], flags: EPH };
}

/* /setup status ------------------------------------------------------------ */
export function setupStatus(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var channels = ctx.settings.logChannels || {};
  var servers = ctx.servers();
  var kits = ctx.kits();
  var checks = [
    ["Staff roles stored", STAFF_SLOTS.filter(function (s) { return roles[s[0]]; }).length + " of " + STAFF_SLOTS.length],
    ["Linked role", roles.linked ? "<@&" + roles.linked + ">" : "not set"],
    ["Log channels stored", LOG_TYPES.filter(function (t) { return channels[t[0]]; }).length + " of " + LOG_TYPES.length],
    ["Rust servers linked", String(servers.length)],
    ["Kit binds", String((kits.binds || []).length)],
    ["Auth groups with a respawn kit", String(Object.keys(kits.authSpawn || {}).length)],
  ];
  var next = [];
  if (!ctx.storeTokenSet()) next.push("**Settings are not being saved.** Set BOT_SETTINGS_TOKEN to the same long random value on the bot (Railway) and the website, or a restart forgets everything.");
  if (!servers.length) next.push("Run **/setup run** and add your Rust server, so the RCON connection can be tested.");
  if (!STAFF_SLOTS.some(function (s) { return roles[s[0]]; })) next.push("Step 1: save your staff roles so staff-only features know who is who.");
  if (!LOG_TYPES.some(function (t) { return channels[t[0]]; })) next.push("Step 2: choose a channel for the log types you want.");
  if (!kits.listCommand) next.push("Set your kit plugin list command (**/kits config** > Delivery settings), then **/kits grab** reads your real kit names.");
  if (!kits.giveCommand) next.push("Set a give template using {player} and {kit} (**/kits config** > Delivery settings), then **/kits give** hands kits out in game.");
  /* Live checks of what is saved, from the guild as the bot sees it right now. */
  var health = [];
  var d = ctx.diagnostics ? ctx.diagnostics() : null;
  if (d && d.ready) {
    Object.keys(d.channels || {}).forEach(function (type) {
      var c = d.channels[type];
      var label = (LOG_TYPES.filter(function (t) { return t[0] === type; })[0] || [type, type])[1];
      if (!c.exists) health.push(label + ": <#" + c.id + "> no longer exists, so nothing is logged there.");
      else if (c.canSend === false) health.push(label + ": the bot cannot post in <#" + c.id + ">. Give it View Channel, Send Messages and Embed Links there.");
    });
    Object.keys(d.roles || {}).forEach(function (slot) {
      var r = d.roles[slot];
      var label = (ROLE_SLOTS.filter(function (t) { return t[0] === slot; })[0] || [slot, slot])[1];
      if (!r.exists) health.push(label + " role: the saved role no longer exists. Pick it again in /setup run.");
    });
    if (d.linked && d.linked.exists) {
      if (!d.linked.canManage) health.push("Linked role: the bot needs the Manage Roles permission to give it.");
      else if (d.linked.above === false) health.push("Linked role: it sits above the bot's own highest role, so Discord will not let the bot give it. Drag the bot's role above it in Server Settings > Roles.");
      else if (d.linked.managed) health.push("Linked role: it belongs to an integration, so no bot can give it. Pick an ordinary role.");
    }
  }
  var built = embed(next.length ? 0xfaa81a : 0x3ba55d, "Setup status",
    next.length ? "What is saved right now is below, then what is still missing, in the order worth doing it." : "Everything the bot can check is in place.");
  built.fields = checks.map(function (c) { return field(c[0], c[1], true); });
  if (next.length) built.fields.push(field("What is missing", fitLines(next.map(function (n) { return "- " + n; }), 1000), false));
  if (health.length) built.fields.push(field("Problems found just now", fitLines(health.map(function (n) { return "- " + n; }), 1000), false));
  else if (d && d.ready) built.fields.push(field("Live checks", "Every saved log channel can be posted in, every saved role still exists" + (d.linked ? ", and the bot can give the linked role" : "") + ".", false));
  if (health.length && !next.length) built.color = 0xfaa81a;
  built.footer = { text: "Read-only: nothing on this panel changes your settings" };
  return { embeds: [built], components: [row([button("setup:roles", "Roles", 1), button("setup:channels", "Log channels", 1), button("setup:server", "Rust server", 1), button("setup:home", "Setup panel", 2)])], flags: EPH };
}

/* /kits cooldowns ---------------------------------------------------------- */
export function cooldownsPanel(ctx, rows) {
  var list = rows || [];
  var built = embed(0xff7200, "Manual kit-give cooldowns",
    list.length
      ? "These timers apply to successful /kits give actions, per gamertag and kit. They are held in this bot process and reset if Railway restarts it."
      : "No manual kit giveaways are cooling down. Emote-bind and respawn cooldowns still need a Rust game-event connector; these records do not track in-game plugin events.");
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
  var saved = STAFF_SLOTS.map(function (s) { return s[0]; }).filter(function (key) { return roles[key]; });
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
    field("Step 2 - Logging channels", LOG_TYPES.filter(function (t) { return (ctx.settings.logChannels || {})[t[0]]; }).length + " of " + LOG_TYPES.length + " set", true),
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
  return STAFF_SLOTS.map(function (s) { return { slot: s[0], label: s[1], id: roles[s[0]] || null }; }).filter(function (r) { return r.id; });
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
  var built = embed(0x1abc9c, "Player links",
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
    row([button("user:roster", "Roster", 2), button("user:panel", "Post the link panel", 1),
      button("user:pending", held.pending.length ? "Waiting list (" + held.pending.length + ")" : "Waiting list", held.pending.length ? 1 : 2)]),
  ], flags: EPH };
}

/* The panel staff post in a channel. Its buttons work for everyone in the server, because
   linking is a member action, not a staff one. */
export function linkPanelPayload() {
  var built = embed(0x1abc9c, "Link your Rust Console account",
    "Press **Link account**, type your Rust Console gamertag exactly as it appears in game, and the bot will check it against the links already on record.");
  built.fields = [
    field("Already linked?", "Press **Unlink** and go through the confirmation. Staff can always do it for you.", false),
    field("What happens next", "Your request waits for staff. Once they approve it you get the linked role, and the bot sends you a direct message either way - so keep DMs from this server open if you want to hear back.", false),
  ];
  built.footer = { text: "One gamertag can only be linked to one Discord account" };
  return { embeds: [built], components: [
    row([button("link:start", "Link account", 1), button("link:unlink", "Unlink", 2)]),
  ] };
}

export function linkModal() {
  return { title: "Link your account", custom_id: "modal:link:self", components: [
    row([input("link_gamertag", "Your Rust Console gamertag", "", true)]),
  ] };
}

export function forcelinkPicker() {
  return { embeds: [embed(0x1abc9c, "Force link: who?", "Choose the Discord account, then type the gamertag on the next screen.")],
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

function moreThan25(links, option) {
  return links.length > 25 ? "\n\nThe menu shows the first 25 of " + links.length + ". For anyone else, use " + option + " and pick from the suggestions." : "";
}
export function unlinkPicker(ctx) {
  var links = ctx.links() || [];
  if (!links.length) return { embeds: [embed(0xfaa81a, "Nothing to unlink", "No links are on record yet.")], components: [row([button("user:panel", "Post the link panel", 1)])], flags: EPH };
  return { embeds: [embed(0x1abc9c, "Force unlink: which link?", "Choose the player, then confirm. Nothing is removed until you confirm." + moreThan25(links, "/user forceunlink gamertag:"))],
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
  return { embeds: [embed(0x1abc9c, "Transfer: which link?", "Pick the link to move. Then you can change the Discord account, the gamertag, or both at once." + moreThan25(links, "/user transfer gamertag:"))],
    components: [row([{ type: 3, custom_id: "user:transfer:pick", placeholder: "Linked players",
      options: links.slice(0, 25).map(function (l) { return { label: l.gamertag.slice(0, 90), value: l.gamertag, description: ("Discord " + l.userId).slice(0, 90) }; }) }])], flags: EPH };
}

export function transferModal(gamertag) {
  return { title: "Transfer " + gamertag.slice(0, 30), custom_id: "modal:transfer:" + gamertag, components: [
    row([input("move_user", "New Discord user id (blank keeps it)", "", false)]),
    row([input("move_gamertag", "New gamertag (blank keeps it)", "", false)]),
  ] };
}

var ROSTER_PAGE = 30;
/* Every link, 30 to a page, numbered, newest last. The old single field cut the list off at
   about 14 players without saying so. */
export function rosterPanel(ctx, page, search) {
  var held = linkRecords(ctx);
  var query = String(search || "").trim().slice(0, 40);
  if (query) {
    var q = query.toLowerCase(), digits = query.replace(/[^0-9]/g, "");
    held = { links: held.links.filter(function (l) {
      return l.gamertag.toLowerCase().indexOf(q) > -1 || (digits.length >= 5 && l.userId === digits);
    }), pending: held.pending };
  }
  var pages = Math.max(1, Math.ceil(held.links.length / ROSTER_PAGE));
  var p = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  var from = (p - 1) * ROSTER_PAGE;
  var lines = held.links.slice(from, from + ROSTER_PAGE).map(function (l, i) {
    var since = ago(l.at);
    return (from + i + 1) + ". <@" + l.userId + "> -> " + code(l.gamertag) + (since ? " " + since : "") + (l.by && l.by !== l.userId ? " (by <@" + l.by + ">)" : "");
  });
  var built = embed(0x3ba55d, (query ? "Links matching " + code(query) : "Linked players") + (held.links.length ? " (" + held.links.length + ")" : ""), held.links.length
    ? lines.join("\n")
    : query ? "No linked gamertag contains that, and no link belongs to that Discord id." : "No links on record yet. Post the link panel so players can link themselves, or use **Force link**.");
  if (pages > 1) built.footer = { text: "Page " + p + " of " + pages };
  var nav = [];
  if (pages > 1) {
    /* the search rides along in the button id, so paging keeps the filter */
    var tail = query ? ":" + query.replace(/:/g, "") : "";
    nav.push({ type: 2, custom_id: "user:roster:" + (p - 1) + tail, label: "Previous", style: 2, disabled: p <= 1 });
    nav.push({ type: 2, custom_id: "user:roster:" + (p + 1) + tail, label: "Next", style: 2, disabled: p >= pages });
  }
  nav.push(button("user:config", "Back to links", 2));
  nav.push(button("user:panel", "Post the link panel", 1));
  return { embeds: [built], components: [row(nav)], flags: EPH };
}

/* Players who asked through the link panel. Approve confirms the gamertag they typed (and
   gives the linked role); reject drops the request. One click each, both logged. */
export function pendingPanel(ctx, note) {
  var pending = ctx.pendingLinks() || [];
  var lines = pending.slice(0, 40).map(function (p) { var since = ago(p.at); return "<@" + p.userId + "> asked for " + code(p.gamertag) + (since ? " " + since : ""); });
  var built = embed(0x1abc9c, "Waiting to be confirmed" + (pending.length ? " (" + pending.length + ")" : ""), pending.length
    ? "**Approve** confirms the gamertag the player typed; **Reject** drops the request.\n\n" + lines.join("\n") + (pending.length > 40 ? "\n...and " + (pending.length - 40) + " more" : "")
    : "Nobody is waiting: no unconfirmed link requests are on record.");
  var embeds = [built];
  if (note) embeds.unshift(note);
  var components = [];
  if (pending.length) {
    var options = pending.slice(0, 25).map(function (p) {
      return { label: String(p.gamertag).slice(0, 90), value: String(p.userId), description: ("Discord account " + p.userId).slice(0, 90) };
    });
    components.push(row([{ type: 3, custom_id: "user:pending:approve", placeholder: "Approve a request", options: options }]));
    components.push(row([{ type: 3, custom_id: "user:pending:reject", placeholder: "Reject a request", options: options }]));
  }
  components.push(row([button("user:config", "Back to links", 2), button("user:forcelink", "Link someone by hand", 2)]));
  return { embeds: embeds, components: components, flags: EPH };
}

/* /user forcelink with both options filled: link straight away, after the same checks the
   menu flow makes. ctx.linkPlayer also gives the linked role and writes the linking log. */
export async function forceLinkNow(ctx, userId, gamertag) {
  var id = String(userId || "").replace(/[^0-9]/g, "");
  var tag = String(gamertag || "").trim().slice(0, 40);
  if (!id || !tag) return forcelinkPicker();
  var advice = adviceOnGamertag(ctx, tag, id);
  if (!advice.free && advice.reason === "already-this-user") {
    return { embeds: [embed(0xfaa81a, "Already linked", "That gamertag is already linked to that same Discord account. Nothing changed.")], flags: EPH };
  }
  if (!advice.free) {
    return { embeds: [embed(0xdc4c4c, "That gamertag is taken", String(advice.detail || "").slice(0, 400))],
      components: [row([button("user:transfer", "Transfer it instead", 1), button("user:config", "Cancel", 2)])], flags: EPH };
  }
  var done = await ctx.linkPlayer(id, tag);
  return { embeds: [embed(0x3ba55d, "Linked", "<@" + id + "> is now linked to " + code(done.gamertag) + "." + (done.roleNote || ""))],
    components: [row([button("user:config", "Back to links", 2), button("user:roster", "Roster", 2)])], flags: EPH };
}

/* /user transfer with the options filled: move the link without the menus. */
export async function transferNow(ctx, gamertag, toUser, toGamertag) {
  var found = (ctx.links() || []).filter(function (l) { return l.gamertag.toLowerCase() === String(gamertag || "").trim().toLowerCase(); })[0];
  if (!found) {
    return { embeds: [embed(0xdc4c4c, "No such link", "Nobody is linked to " + code(String(gamertag || "").slice(0, 40)) + ". Start typing in the gamertag option to pick from the links on record.")],
      components: [row([button("user:transfer", "Open the list", 1)])], flags: EPH };
  }
  if (!toUser && !toGamertag) return transferPicker(ctx);
  var moved = await ctx.moveLinkFull(found.gamertag, toUser ? String(toUser).replace(/[^0-9]/g, "") : found.userId, toGamertag || "");
  return moved.ok
    ? { embeds: [embed(0x3ba55d, "Link moved", code(found.gamertag) + " now belongs to <@" + moved.userId + ">" +
        (moved.gamertag.toLowerCase() !== found.gamertag.toLowerCase() ? ", under the gamertag " + code(moved.gamertag) : "") + "." + (moved.roleNote || ""))],
      components: [row([button("user:config", "Back to links", 2)])], flags: EPH }
    : { embeds: [embed(0xdc4c4c, "Not moved", String(moved.detail || "").slice(0, 400))],
      components: [row([button("user:transfer", "Try again", 1), button("user:config", "Cancel", 2)])], flags: EPH };
}

export function channelPickerForPanel() {
  return { embeds: [embed(0x1abc9c, "Where should the panel go?", "Pick the channel. The panel is posted there for everyone, and the bot keeps its message id so it can point back to it later.")],
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

export function kitAddPanel(ctx) {
  /* A link button (style 5) must carry a url and no custom_id, or Discord refuses the whole
     reply and the user sees "This interaction failed". */
  var studio = link("Open Kit Studio", ((ctx && ctx.siteUrl) || "https://spinback-j7ao5f.camelai.app") + "/dashboard/kitbuilder.html");
  return { embeds: [embed(0x5865f2, "Preview a kit code",
    "Paste a Base64 code from Kit Studio. The bot validates the text, recognises kit names for autocomplete and saves a short preview. It does not run the code or install items on your Rust server.")],
    components: [row([button("kits:add:code", "Enter a code", 1), studio]), row([button("kits:config", "Back to Emote Kits", 2)])], flags: EPH };
}

export function kitAddModal() {
  return { title: "Preview a kit code", custom_id: "modal:kitcode", components: [
    row([input("install_code", "Base64 kit install code", "", true)]),
  ] };
}

export function kitsPanel(ctx) {
  var binds = ctx.kits().binds || [];
  var auth = ctx.kits().authSpawn || {};
  var built = embed(0xff7200, "Emote Kits",
    "Configure bind and Auth Group preferences, and give kits to linked players. Important: automatic emote-bind and respawn actions need a Rust game-event/plugin connector; this bot currently stores those preferences but does not receive those in-game events.");
  var bindLines = binds.map(function (b) {
    return code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " (" + b.cooldown + "s)" : "") + (b.roleId ? " <@&" + b.roleId + ">" : "");
  });
  built.fields = [
    field("Saved bind preferences (" + binds.length + ")", binds.length ? fitLines(bindLines, 1000) : "none yet", false),
    field("Manual kit delivery", ctx.kits().locked ? "paused by staff" : "available", true),
    field("Auth Group preferences", String(Object.keys(auth).length) + " saved (game hook required)", true),
    field("Active giveaway cooldowns", String(ctx.cooldownCount()), true),
    field("Delivery", "List command: " + (ctx.kits().listCommand ? code(ctx.kits().listCommand) : "not set") + "\nGive template: " + (ctx.kits().giveCommand ? code(ctx.kits().giveCommand) : "not set") + "\nPer player + kit cooldown: " + (Number(ctx.kits().giveCooldownSeconds) || 0) + "s", false),
  ];
  built.footer = { text: "Manual giveaways use RCON; automatic in-game events need a plugin feed" };
  return { embeds: [built], components: [
    row([button("kits:add", "Add a bind", 1), button("kits:edit", "Edit a bind", 2), button("kits:remove", "Remove a bind", 2)]),
    row([button("kits:lock", ctx.kits().locked ? "Resume kit delivery" : "Pause kit delivery", 2), button("kits:guide", "Emote guide", 2), button("kits:refresh", "Cooldowns", 2)]),
    row([button("kits:delivery", "Delivery settings", ctx.kits().giveCommand && ctx.kits().listCommand ? 2 : 1), button("kits:grab", "Read kit names", 2), button("kits:give", "Give a kit", 2)]),
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
/* As many whole lines as fit, then how many were left out - never a line cut in half. */
function fitLines(lines, max) {
  var out = [], used = 0;
  for (var i = 0; i < lines.length; i++) {
    var extra = (out.length ? 1 : 0) + lines[i].length;
    if (used + extra > max - 14) { out.push("+" + (lines.length - i) + " more"); break; }
    out.push(lines[i]);
    used += extra;
  }
  return out.join("\n");
}
/* The two commands only your server's kit plugin knows: how to list kits and how to give one.
   Settable here, so /kits grab and /kits give work without the website's Settings page. */
export function deliveryModal(kits) {
  var k = kits || {};
  return { title: "Kit delivery", custom_id: "modal:kitdelivery", components: [
    row([Object.assign(input("kit_list", "List command (lists your kits)", String(k.listCommand || ""), false), { placeholder: "for example: kit list" })]),
    row([Object.assign(input("kit_give", "Give template, with {player} and {kit}", String(k.giveCommand || ""), false), { placeholder: 'for example: kit givetoplayer {kit} "{player}"' })]),
    row([Object.assign(input("kit_give_cooldown", "Cooldown seconds for same player + kit", String(k.giveCooldownSeconds == null ? 30 : k.giveCooldownSeconds), true), { placeholder: "30; use 0 to disable" })]),
  ] };
}
export function saveDelivery(ctx, data) {
  var list = String(data.kit_list || "").replace(/[\r\n]+/g, " ").trim();
  var give = String(data.kit_give || "").replace(/[\r\n]+/g, " ").trim();
  var cooldownText = String(data.kit_give_cooldown == null ? "30" : data.kit_give_cooldown).trim();
  var cooldown = cooldownText === "" ? 30 : Number(cooldownText);
  var problems = [];
  if (list.length > 120) problems.push("The list command is longer than 120 characters.");
  if (give.length > 200) problems.push("The give template is longer than 200 characters.");
  if (give && (give.indexOf("{player}") < 0 || give.indexOf("{kit}") < 0)) problems.push("The give template needs both {player} and {kit}, so the bot knows where the gamertag and the kit name go.");
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 86400) problems.push("The giveaway cooldown must be a whole number from 0 to 86400 seconds.");
  if (problems.length) {
    return { embeds: [embed(0xdc4c4c, "Not saved", problems.join("\n"))], components: [row([button("kits:delivery", "Try again", 1), button("kits:config", "Back to Emote Kits", 2)])], flags: EPH };
  }
  var result = ctx.setDelivery({ listCommand: list, giveCommand: give, giveCooldownSeconds: cooldown });
  if (result && typeof result.then === "function") return result.then(function (wrote) { return deliverySaved(list, give, cooldown, wrote); });
  return deliverySaved(list, give, cooldown, result);
}
function deliverySaved(list, give, cooldown, wrote) {
  var example = give ? give.split("{player}").join("PlayerOne").split("{kit}").join("STARTER") : "";
  var built = embed(0x3ba55d, "Delivery saved", (list ? "List command: " + code(list) : "No list command (so /kits grab stays off).") + "\n" +
    (give ? "Give template: " + code(give) + "\nFor example, STARTER to PlayerOne sends: " + code(example) : "No give template (so /kits give stays off).") +
    "\nGive cooldown: " + cooldown + "s per gamertag + kit" +
    (wrote && wrote.ok === false ? "\n\nKept in this bot memory only: " + wrote.detail : ""));
  var nav = [button("kits:config", "Back to Emote Kits", 2)];
  if (list) nav.unshift(button("kits:grab", "Read kit names now", 1));
  return { embeds: [built], components: [row(nav)], flags: EPH };
}
export function emoteGuide(ctx) {
  var binds = ctx.kits().binds || [];
  var auth = ctx.kits().authSpawn || {};
  return { embeds: [embed(0xfaa81a, "Emote guide - saved preferences",
    "These are stored preferences only. Automatic emote binds and Auth Group respawn kits do not run until a Rust plugin or game-event connector is connected. Nothing is filled in for you, because emote names are your server's own.\n\n" +
    (binds.length ? binds.map(function (b) {
      return "- " + code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " | " + b.cooldown + "s cooldown" : "") + (b.roleId ? " | <@&" + b.roleId + "> only" : "");
    }).join("\n") : "No binds yet. Use Add a bind.") +
    "\n\nAuth Group preferences (not active without a game hook): " + (Object.keys(auth).length ? Object.keys(auth).map(function (g) { return g + " -> " + auth[g]; }).join(", ") : "none set"))],
    components: [row([button("kits:config", "Back to the panel", 2)])], flags: EPH };
}
export function grabKits(ctx) {
  if (!String(ctx.kits().listCommand || "").trim()) {
    return { embeds: [embed(0xfaa81a, "No kit list command is set",
      "Reading the real kit names means asking your server a command it understands, and this bot will not invent the name of one.\n\nSet your kit plugin's list command, and this runs it and shows exactly what comes back.")],
      components: [row([button("kits:delivery", "Set it now", 1)])], flags: EPH };
  }
  return null;
}
/* Kit names in a list command's answer: one per line or comma separated, with bullets,
   numbering and a "Kits:" label taken off. Only plain names are kept (letters, digits, _ - .),
   so a sentence in the answer is never mistaken for a kit. */
export function parseKitNames(text) {
  var out = [], seen = {};
  String(text || "").split(/[\n,;]+/).forEach(function (part) {
    var t = part.replace(/^[\s\-*>\u2022]+/, "").replace(/^\d+[.)]\s+/, "").trim();
    var colon = t.lastIndexOf(":");
    if (colon > -1 && colon < t.length - 1) t = t.slice(colon + 1).trim();
    t = t.replace(/\s+\(.*\)$/, "").trim();
    if (/^[A-Za-z0-9_.\-]{1,60}$/.test(t) && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); }
  });
  return out.slice(0, 100);
}
export async function grabKitsRun(ctx, wanted) {
  var server = findServer(ctx, wanted);
  if (!server) return noServerPayload(ctx, wanted);
  var answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: ctx.kits().listCommand });
  var lines = String((answer && answer.answer) || "").split("\n").filter(Boolean);
  var names = answer && answer.ok ? parseKitNames(answer.answer) : [];
  if (names.length && ctx.setKnownKits) ctx.setKnownKits(names);
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c,
    answer && answer.ok ? "Kits " + server.name + " reported" : "The server did not answer",
    answer && answer.ok ? (lines.length ? block(lines.slice(0, 40).join("\n").slice(0, 1500)) : "It answered with nothing.") : String((answer && answer.detail) || "no answer"));
  if (answer && answer.ok) {
    built.fields = [field("Kit names remembered", names.length
      ? names.length + " - they now autocomplete in /kits give and /kits auth-spawn"
      : "none recognised in that answer, so the suggestions are unchanged", false)];
  }
  return { embeds: [built], components: [row([button("kits:grab", "Read again", 2), button("kits:config", "Emote Kits", 2)])], flags: EPH };
}
export function kitStudioPanel(ctx) {
  return { embeds: [embed(0x5865f2, "Kit Studio",
    "Build a kit slot by slot on the website, then bring its code here to preview the decoded kit names. This bot does not yet execute the code or install items on your Rust server.")],
    /* kits:add:code opens the install-code form; kits:add is "Add a bind". */
    components: [row([link("Open Kit Studio", ctx.siteUrl + "/dashboard/kitbuilder.html"), button("kits:add:code", "Install a code", 1)])], flags: EPH };
}
export function installKit(ctx, rawCode) {
  var raw = String(rawCode || "").trim();
  if (!raw) return { embeds: [embed(0xdc4c4c, "No code given", "Paste the Base64 install code from Kit Studio.")], flags: EPH };
  var text = null;
  try { text = Buffer.from(raw, "base64").toString("utf8"); } catch (error) { text = null; }
  var ok = !!text && text.length > 2 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  if (!ok) return { embeds: [embed(0xdc4c4c, "That does not decode", "The value is not valid Base64, or it does not decode to readable text. Nothing was stored.")], flags: EPH };
  var count = ctx.installKit(raw, text);
  /* Kit Studio codes decode to kit add "NAME" lines: those names join the suggestions. */
  var names = [];
  text.replace(/^\s*kit\s+add\s+"([^"]{1,60})"/gim, function (all, name) { if (names.indexOf(name) < 0) names.push(name); return all; });
  if (names.length && ctx.setKnownKits) ctx.setKnownKits(knownKitNames(ctx).concat(names.filter(function (n) { return knownKitNames(ctx).indexOf(n) < 0; })));
  var built = embed(0xfaa81a, "Code preview saved - not installed",
    "The bot saved a hash and a short preview of this code so it can recognise it later. It does not execute the decoded commands or install items on your Rust server. A game-side installer is not connected yet.");
  built.fields = [
    field("Decoded length", text.length + " characters", true),
    field("Codes stored", String(count), true),
    field("First line", code(text.split("\n")[0].slice(0, 150)), false),
  ];
  if (names.length) built.fields.push(field("Kit names found", names.map(function (n) { return code(n); }).join(", ").slice(0, 1000) + " - now suggested in /kits give", false));
  return { embeds: [built], flags: EPH };
}
export function authSpawnNote(ctx, group, kit) {
  ctx.setAuthSpawn(group, kit);
  return { embeds: [embed(0xfaa81a, kit ? "Respawn preference saved - not active" : "Respawn preference cleared",
    kit
      ? "**" + group + "** is configured for " + code(kit) + ", but the bot has no Rust respawn-event feed connected, so it will not automatically give the kit yet."
      : "**" + group + "** no longer has a saved respawn-kit preference.")], flags: EPH };
}
export function refreshCooldowns(ctx, scope, target) {
  var cleared = ctx.clearCooldowns(scope, target);
  var what = scope === "user" ? "gamertag " + target : scope === "kit" ? "kit " + target : scope === "all-users" ? "every linked user" : "every kit";
  return { embeds: [embed(0x3ba55d, "Cooldowns cleared", "Cleared **" + cleared + "** record" + (cleared === 1 ? "" : "s") + " for " + what + ".")], flags: EPH };
}
export async function giveKit(ctx, opts) {
  var command = String(ctx.kits().giveCommand || "").trim();
  if (ctx.kits().locked) {
    return { embeds: [embed(0xfaa81a, "Kit delivery is paused",
      "A staff member paused manual kit delivery. Open **/kits config** and resume delivery before sending another kit.")],
      components: [row([button("kits:config", "Open kit settings", 1)])], flags: EPH };
  }
  if (!command) {
    return { embeds: [embed(0xfaa81a, "Delivery needs one more setting",
      "To hand a kit over in game the bot must send your server own give command over RCON, and it will not guess what that is called.\n\nSet a template using {player} and {kit}, and this command runs exactly that.")],
      components: [row([button("kits:delivery", "Set it now", 1)])], flags: EPH };
  }
  /* Typed values go into an RCON command line, so quotes, backslashes and control characters
     are dropped before they get there. */
  var kit = cleanArg(opts.kit);
  if (!kit) return { embeds: [embed(0xdc4c4c, "Which kit?", "Name the kit to give. Start typing in the kit option and the kit names the bot knows are suggested.")], flags: EPH };
  var target = cleanArg(opts.gamertag);
  var via = "";
  if (!target && opts.user) {
    /* A Discord user receives it under their linked gamertag - never under their account id. */
    var uid = String(opts.user).replace(/[^0-9]/g, "");
    var linked = (ctx.links() || []).filter(function (l) { return l.userId === uid; })[0];
    if (!linked) {
      return { embeds: [embed(0xdc4c4c, "Not linked", "<@" + uid + "> has no linked gamertag, so there is nobody in game to give it to. Link them with /user forcelink first.")],
        components: [row([button("user:forcelink", "Link someone", 1)])], flags: EPH };
    }
    target = cleanArg(linked.gamertag);
    via = " (linked to <@" + uid + ">)";
  }
  if (!target) return { embeds: [embed(0xdc4c4c, "Who should get it?", "Name a gamertag, or a Discord user whose gamertag is linked.")], flags: EPH };
  var server = findServer(ctx, opts.server);
  if (!server) return noServerPayload(ctx, opts.server);
  var final = command.split("{player}").join(target).split("{kit}").join(kit);
  var reservation = ctx.reserveKitGive
    ? ctx.reserveKitGive(target, kit, Number(ctx.kits().giveCooldownSeconds == null ? 30 : ctx.kits().giveCooldownSeconds))
    : { ok: true, key: null };
  if (!reservation.ok) {
    return { embeds: [embed(0xfaa81a, reservation.inProgress ? "That giveaway is already running" : "Giveaway cooldown",
      reservation.inProgress
        ? "A giveaway for " + code(target) + " and " + code(kit) + " is already being sent. Wait for its result before trying again."
        : "Wait **" + reservation.remainingSeconds + " seconds** before giving " + code(kit) + " to " + code(target) + " again.")],
      components: [row([button("kits:give", "Back to kit giving", 1)])], flags: EPH };
  }
  var answer;
  try {
    answer = await ctx.rconRun({ host: server.host, port: server.port, password: server.password, command: final });
  } finally {
    if (ctx.finishKitGive) ctx.finishKitGive(reservation, !!(answer && answer.ok));
  }
  var built = embed(answer && answer.ok ? 0x3ba55d : 0xdc4c4c, answer && answer.ok ? "Sent" : "The server refused it",
    code(kit) + " to " + code(target) + via + " on **" + server.name + "**.\nCommand: " + code(final));
  built.fields = [field("Server answer", answer && answer.answer
    ? block(String(answer.answer).slice(0, 900))
    : String((answer && (answer.detail || answer.reason)) || "no answer").slice(0, 900), false)];
  return { embeds: [built], components: [row([button("kits:give", "Give another", 2)])], flags: EPH };
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
/* The values typed into a form, keyed by input id. discord.js hands a submitted form over as
   interaction.fields (a collection keyed by customId) and interaction.components (camelCase
   customId), never as the raw API body - reading only interaction.data.components, as this
   used to, made every form arrive empty. The raw shape is still read for the HTTP endpoint. */
export function modalFields(interaction) {
  var out = {};
  function take(c) {
    if (!c) return;
    if (c.component) take(c.component);
    var id = c.customId || c.custom_id;
    if (id && c.value !== undefined && !(id in out)) out[id] = c.value;
    (c.components || []).forEach(take);
  }
  var fields = interaction && interaction.fields;
  if (fields && fields.fields && typeof fields.fields.forEach === "function") {
    fields.fields.forEach(function (c, key) {
      var id = (c && (c.customId || c.custom_id)) || key;
      if (id && c && c.value !== undefined) out[id] = c.value;
    });
  }
  ((interaction && interaction.components) || []).forEach(take);
  (((interaction && interaction.data) || {}).components || []).forEach(take);
  return out;
}
export function kitGivePanel(ctx) {
  var links = (ctx.links() || []).slice(0, 25);
  var known = knownKitNames(ctx);
  var components = [row([button("kits:give", "Type a kit and a gamertag", 1)])];
  if (links.length) {
    components.push(row([{ type: 3, custom_id: "kits:give:pick", placeholder: "Or pick a linked player",
      options: links.map(function (l) { return { label: l.gamertag.slice(0, 90), value: l.gamertag }; }) }]));
  } else {
    components.push(row([button("user:config", "Nobody is linked yet - open links", 2)]));
  }
  var built = embed(0xff7200, "Give a kit",
    "Two ways in: type the kit and a gamertag, or pick a player who is already linked. The kit goes out with the give template you saved, and the server answer is shown back to you as it comes.\n\nQuicker: " + code("/kits give kit: gamertag:") + " suggests kit names and linked players as you type.");
  if (known.length) built.fields = [field("Kit names the bot knows", fitLines(known.map(function (k) { return code(k); }), 1000), false)];
  return { embeds: [built], components: components, flags: EPH };
}

export function dispatchCommand(ctx, name, sub, options) {
  options = options || {};
  if (name === "ping") return pingReply(ctx);
  if (name === "help") return helpHome(ctx);
  /* /setup is how you get out of the gate, so it is the only command that runs before setup
     is finished. Everything else answers with the checklist instead of doing nothing. */
  if (name !== "setup") {
    var gate = setupState(ctx);
    if (gate.complete !== true) return gatePayload(ctx, "/" + name + (sub ? " " + sub : ""));
  }
  if (name === "setup") {
    if (sub === "refresh") return testServers(ctx, options.server);
    if (sub === "status") return setupStatus(ctx);
    if (sub === "edit") return serverPicker(ctx, "edit");
    return setupPanel(ctx);
  }
  if (name === "kits") {
    if (sub === "grab") { var quick = grabKits(ctx); return quick || grabKitsRun(ctx, options.server); }
    if (sub === "config") return kitsPanel(ctx);
    if (sub === "give") {
      if (!options.kit && !options.gamertag && !options.user) return kitGivePanel(ctx);
      return giveKit(ctx, { kit: options.kit, gamertag: options.gamertag, user: options.user, server: options.server });
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
      if (!options.code) return kitAddPanel(ctx);
      return installKit(ctx, options.code);
    }
  }
  if (name === "user") {
    if (sub === "forcelink") return options.user && options.gamertag ? forceLinkNow(ctx, options.user, options.gamertag) : forcelinkPicker();
    if (sub === "forceunlink") {
      if (!options.gamertag) return unlinkPicker(ctx);
      var gone = (ctx.links() || []).filter(function (l) { return l.gamertag.toLowerCase() === String(options.gamertag).trim().toLowerCase(); })[0];
      return gone ? unlinkConfirm(gone.gamertag, gone.userId)
        : { embeds: [embed(0xdc4c4c, "No such link", "Nobody is linked to " + code(String(options.gamertag).slice(0, 40)) + ".")], components: [row([button("user:unlink", "Open the list", 1)])], flags: EPH };
    }
    if (sub === "transfer") return options.gamertag ? transferNow(ctx, options.gamertag, options.to_user, options.to_gamertag) : transferPicker(ctx);
    if (sub === "linkpanel") return options.channel ? { postPanelTo: options.channel } : channelPickerForPanel();
    if (sub === "roster") return rosterPanel(ctx, 1, options.search);
    return userPanel(ctx);
  }
  return { content: "That command is not wired up here yet.", flags: EPH };
}
