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
/* The roles /setup run can create, in the order they rank. The colour is cosmetic; the id
   saved against each slot afterwards is what the bot checks when it decides who may run
   staff commands. The bot grants these roles no Discord permissions of their own. */
export const STAFF_ROLE_RECIPES = [
  ["owner", "Owner", 0xcf6a2e, "whoever runs the server"],
  ["coOwner", "Co-Owner", 0xd97732, "second in charge"],
  ["headAdmin", "Head Admin", 0xe8843f, "runs the admin team"],
  ["admin", "Admin", 0xfaa81a, "full staff powers"],
  ["moderator", "Moderator", 0x3ba55d, "day to day moderation"],
];
export const ROLE_SLOTS = [
  ["owner", "Owner"], ["coOwner", "Co-Owner"], ["headAdmin", "Head Admin"],
  ["admin", "Admin"], ["moderator", "Moderator"], ["linked", "Linked"],
];
export const AUTH_GROUPS = ["User", "VIP", "Moderator", "Admin", "Owner"];
const EPH = 64;
const BT = String.fromCharCode(96);

/* No command takes a typed option: every one opens a panel, a picker or a form, so nothing has
   to be remembered or typed exactly, and nothing typed can be half right. */
export const COMMANDS = [
  { name: "ping", description: "Bot and website health, measured right now", dm_permission: false },
  { name: "help", description: "Every command, what it needs first, and a button into each one", dm_permission: false },
  { name: "setup", description: "Configure Spinback RCE for this server", dm_permission: false,
    options: [
      { type: 1, name: "run", description: "Guided setup: the bot can make the roles and log channels, then your Rust server" },
      { type: 1, name: "roles", description: "Pick your staff roles from Discord's role menus: no ids to copy" },
      { type: 1, name: "channels", description: "Logging channels: pick them, or let the bot create them private to your staff roles" },
      { type: 1, name: "server", description: "Add or change a Rust server, tested before it is saved" },
      { type: 1, name: "suggest", description: "Read the role and channel names here and propose a full setup" },
      { type: 1, name: "doctor", description: "Health check: measure every saved setting and list what to fix" },
      { type: 1, name: "import", description: "Paste your server.cfg RCON lines and let the bot read them" },
      { type: 1, name: "export", description: "Your saved settings as copyable text, with no passwords in it" },
      { type: 1, name: "reset", description: "Clear the saved settings again, after typing a confirmation" },
      { type: 1, name: "status", description: "Checklist of what is saved and what is still missing" },
      { type: 1, name: "edit", description: "Change a saved server IP, RCON port or password" },
      { type: 1, name: "refresh", description: "Open a fresh RCON connection to every saved server and report" },
    ] },
  { name: "kits", description: "Kits: giving over RCON, delivery settings, cooldowns and Kit Studio codes", dm_permission: false,
    options: [
      { type: 1, name: "grab", description: "Read the real kit names from your Rust server" },
      { type: 1, name: "config", description: "The kits panel: binds, delivery settings, pause switch, emote guide" },
      { type: 1, name: "commands", description: "Set your kit plugin's list command, give template and cooldown" },
      { type: 1, name: "doctor", description: "Check the kit settings and see exactly what is still missing" },
      { type: 1, name: "give", description: "Give a kit: pick the player, then a box for the kit" },
      { type: 1, name: "refresh", description: "Clear give cooldowns: one player, one kit, everyone or every kit" },
      { type: 1, name: "auth-spawn", description: "Save an Auth Group respawn kit (runs once a game hook is connected)" },
      { type: 1, name: "cooldowns", description: "See the kit-give cooldowns running right now" },
      { type: 1, name: "build", description: "Kit Studio: build a kit on the website, then store its code here" },
      { type: 1, name: "add", description: "Preview a Kit Studio code and learn its kit names" },
    ] },
  { name: "user", description: "Player links: who is who in your clan", dm_permission: false,
    options: [
      { type: 1, name: "whois", description: "Look up which Discord account is behind a gamertag" },
      { type: 1, name: "forcelink", description: "Link a Discord user to a gamertag yourself" },
      { type: 1, name: "forceunlink", description: "Remove a player link" },
      { type: 1, name: "transfer", description: "Move a link to a new Discord account or a new gamertag" },
      { type: 1, name: "pending", description: "Link requests waiting for confirmation, with approve and reject" },
      { type: 1, name: "linkpanel", description: "Post the member-facing link panel: the channel is picked next" },
      { type: 1, name: "roster", description: "Every linked player, page by page, with a search button" },
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
    "Everything set up here - roles, servers, log channels, binds and player links - is lost the next time the bot redeploys.\n\n" +
    "**Easiest fix:** on Railway, open the bot's service and attach a **volume** (any mount path). The bot finds it by itself and keeps its settings in a file there.\n" +
    "**Or:** set the same long random value as BOT_SETTINGS_TOKEN on the bot's service and on the website, so settings are kept by the website.");
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
  return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F"'\\;]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
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
    wanted ? "Saved servers: " + (names || "none") + "." : "Link one first with /setup run.")], flags: EPH };
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
    field((ctx.storeTokenSet() ? "\ud83d\udfe2" : "\ud83d\udd34") + " Settings store", !ctx.storeTokenSet() ? "not kept: no BOT_SETTINGS_TOKEN and no volume, so a redeploy forgets everything" : (ctx.storeKind && ctx.storeKind() === "file") ? "kept in a file on the attached volume" : "the website accepts saves from this bot", true),
    field("Rust servers (" + ctx.servers().length + ")", ctx.servers().length
      ? fitLines(ctx.servers().map(function (s) { return checkDot(ctx, s) + " **" + s.name + "**: " + lastCheckLine(ctx, s); }), 1000)
      : "none linked yet", false),
    field("How the check works", "Gateway, uptime and memory come from this bot process; the website line is a live request made just now. Rust servers show their last RCON check - run **/setup refresh** for a fresh one.", false),
  ];
  built.footer = { text: "Site: " + ctx.siteUrl + " | checked at " + when() };
  return { embeds: [built], components: [row([button("ping:again", "Check again", 1), link("Status page", ctx.siteUrl + "/status.html")])] };
}

/* /setup run ---------------------------------------------------------------- */
/* One panel that does the whole thing, in any order, with the Rust server last. Each press
   either creates something or explains exactly why it could not, and nothing in the guild is
   touched until one of the Create buttons is pressed. */
export function runSetupPanel(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var madeRoles = STAFF_ROLE_RECIPES.filter(function (r) { return roles[r[0]]; });
  var channels = ctx.settings.logChannels || {};
  var setChannels = LOG_TYPES.filter(function (t) { return channels[t[0]]; });
  var servers = ctx.servers() || [];
  var done = (madeRoles.length ? 1 : 0) + (setChannels.length ? 1 : 0) + (servers.length ? 1 : 0);
  var built = embed(done === 3 ? 0x3ba55d : 0xff7200, "Guided setup",
    "**Progress** " + progressBar(done, 3) + (done === 3 ? " - all set" : "") + "\n\nEvery step is optional and every step is one press, so you can do them in any order and come back later. Nothing in this server is created or changed until you press a button that says so, and the Rust server is the last step because it is the only one that has to answer a real check.");
  built.fields = [
    field("1 - Staff roles", madeRoles.length ? madeRoles.length + " of " + STAFF_ROLE_RECIPES.length + " saved: " + madeRoles.map(function (r) { return r[1]; }).join(", ") : "not saved yet - the bot can make them all for you", false),
    field("2 - Log channels", setChannels.length ? setChannels.length + " of " + LOG_TYPES.length + " log types have a channel" : "not set yet - the bot can make them too", false),
    field("3 - Rust server", servers.length ? servers.map(function (s) { return code(s.name + " " + s.host + ":" + s.port); }).join(", ") : "not linked yet - add it last", false),
    field("What the bot creates", "**Roles:** " + STAFF_ROLE_RECIPES.map(function (r) { return r[1]; }).join(", ") + ". They are markers of rank: the bot grants them no Discord permissions, and their ids are saved as the staff roles, so they - and only they, plus Administrator and the server owner - can run the staff commands."
      + "\n**Channels:** one text channel per log type you tick, inside a **Spinback** category, and **@everyone is denied View Channel on every one of them**, so only the staff roles above and the bot can read them. A channel of the same name that already exists is reused and relocked instead of being duplicated.", false),
    field("If a step will not run", "Making roles needs **Manage Roles**, making channels needs **Manage Channels**. Without them the bot names the missing permission item by item instead of failing quietly, and you can always pick roles and channels you already have with the buttons below.", false),
  ];
  built.footer = { text: "Admin or Manage Server. Panels are ephemeral, and no password is ever shown back to you" };
  return { embeds: [built], components: [
    row([button("setup:run:roles", "Create the roles for me", 3), button("setup:run:channels", "Create the log channels", 3)]),
    row([button("setup:roles", "Pick roles I already have", 2), button("setup:server", "3. Add the Rust server", 1)]),
    row([button("setup:doctor", "Health check", 2), button("setup:status", "Status", 2), button("setup:suggest", "Find them by name", 2), button("setup:home", "Step by step", 2)]),
  ], flags: EPH };
}

export function roleBuildPanel(ctx) {
  var roles = ctx.settings.staffRoles || {};
  var known = (ctx.guildInfo && ctx.guildInfo.roles) || [];
  var lines = STAFF_ROLE_RECIPES.map(function (r) {
    var there = known.filter(function (x) { return String(x.name).toLowerCase() === r[1].toLowerCase(); })[0];
    var saved = roles[r[0]] ? "saved" : "not saved yet";
    return "- **" + r[1] + "** (" + r[3] + ") - " + (there ? "a role called " + r[1] + " already exists, so it is used as it is" : "will be created here") + ", " + saved;
  });
  var built = embed(0xfaa81a, "Create the staff roles?",
    "This is the list, exactly as the bot would make it:\n\n" + lines.join("\n"));
  built.fields = [
    field("What they are for", "The ids are saved as your staff roles, so these are the roles allowed to run staff commands. The bot grants them no Discord permissions and it never assigns them to anybody: hand them out to your staff in Discord yourself, whenever you want.", false),
    field("Reused, not duplicated", "A role with one of these names that already exists is used instead of making a second one, and its id is saved. Nothing is renamed, re-coloured or deleted.", false),
    field("One permission needed", "Creating a role needs **Manage Roles**. If the bot does not have it, each one it cannot make is reported with that reason and the rest still go ahead.", false),
  ];
  built.footer = { text: "Nothing is created until Create the roles is pressed" };
  return { embeds: [built], components: [
    row([button("setup:run:roles:go", "Create the roles", 3), button("setup:roles", "Choose roles instead", 2)]),
    row([button("setup:run", "Back to guided setup", 2), button("setup:doctor", "Health check", 2)]),
  ], flags: EPH };
}

export function roleBuildResult(ctx, made) {
  var created = (made && made.created) || [];
  var reused = (made && made.reused) || [];
  var failed = (made && made.failed) || [];
  var wrote = (made && made.wrote) || null;
  var built = embed(failed.length ? 0xfaa81a : 0x3ba55d, failed.length ? "Roles: some could not be made" : "The staff roles are ready",
    created.length + " role(s) created, " + reused.length + " already here and used" + (failed.length ? ", " + failed.length + " could not be made" : "") + "."
    + (wrote && wrote.ok ? " Saved to the website as well." : " The website refused the settings save, so this holds until the service restarts: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  var fields = [];
  if (created.length) fields.push(field("Created", created.slice(0, 10).join("\n").slice(0, 1000), false));
  if (reused.length) fields.push(field("Already here, now saved", reused.slice(0, 10).join("\n").slice(0, 1000), false));
  if (failed.length) fields.push(field("Could not be made", failed.slice(0, 6).join("\n").slice(0, 1000), false));
  fields.push(field("Who can run staff commands now", "The roles saved above, plus Administrator and the server owner. Nobody else.", false));
  fields.push(field("Next", "**Create the log channels** locks one channel per log type to these same roles, so only they can read the logs. Then add the Rust server last: it is the only step that has to pass a live check.", false));
  built.fields = fields;
  return { embeds: [built], components: [
    row([button("setup:run:channels", "Create the log channels", 1), button("setup:run:roles", "Create more roles", 2)]),
    row([button("setup:server", "3. Add the Rust server", 1), button("setup:run", "Back to guided setup", 2)]),
  ], flags: EPH };
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
    row([button("setup:run", "Guided setup: the bot makes the roles and channels", 3)]),
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
  var nav = [button("setup:channels:pick", "Back to log types", 2)];
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
  var typedHost = String(data.srv_host || "").trim();
  var portText = String(data.srv_port || "").trim();
  /* The address is read the way people actually write it - with the port on the end, in
     brackets, with a scheme in front - so a good address is never refused for its shape.
     Anything that genuinely cannot be used says which part of it is the problem. */
  if (typedHost && ctx.target) {
    var target = ctx.target(typedHost, portText || (/:\d{1,5}$/.test(typedHost) ? "" : (before ? String(before.port) : "")));
    if (!target.ok) {
      var advice = {
        "no-port": "The **RCON port** box arrived empty. It is " + code("rcon.port") + " in server.cfg, and it is not the game port or the query port.",
        "refused-port": "That is not a port number. " + code("rcon.port") + " is normally five digits.",
        "refused-private": "That address exists only inside a private network, so a cloud host cannot reach it. Use the public IP or the hostname from server.cfg.",
        "refused-local": "That address is the machine the bot runs on, not your server.",
        "bad-host": "That did not read as an address. Copy the value from server.cfg exactly as it is written there.",
      }[target.reason] || "";
      return { embeds: [embed(0xdc4c4c, "Nothing was saved - the address needs fixing",
        "**" + typedHost + (portText ? " : " + portText : "") + "** was not used, so nothing was written.\n\n" + String(target.detail || "").slice(0, 300) + (advice ? "\n\n" + advice : ""))],
        components: [row([button(existingId ? "setup:edit" : "setup:server", "Enter it again", 1), button("setup:import", "Paste server.cfg", 2), button("setup:home", "Back to setup", 2)])], flags: EPH };
    }
    typedHost = target.host;
    portText = String(target.port);
  }
  var host = typedHost || (before ? String(before.host || "") : "");
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
    /* Each failure names its usual cause, so the next try changes the right thing. */
    var why = {
      "connect-failed": "Nothing is listening on that port, or the host blocks this cloud address. Check that RCON is on, that the port is open in the host firewall, and that the address is the one players connect to.",
      "timeout": "The address and port look right but nothing answered in time. RCON is usually switched off, or " + code("rcon.web") + " is set to 1.",
      "bad-password": "The server answered and refused the password, so the address and port are right. Compare " + code("rcon.password") + " in server.cfg with what you typed, character for character.",
      "closed-before-auth": "The server closed the connection before it accepted the password. That is normally " + code("rcon.web") + " being set to 1, or an RCON ban on this address.",
      "refused-host": "The bot only connects to public internet addresses, and this one is not (or did not resolve safely). Use the public IP or the hostname from server.cfg.",
    }[(answer && answer.reason) || ""] || "";
    return { embeds: [embed(0xdc4c4c, "Not saved - the connection failed",
      "**" + host + ":" + port + "** did not answer the check, so nothing was written.\n\nReason: " +
      code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 400) + (why ? "\n\n" + why : ""))],
      components: [row([button(existingId ? "setup:edit" : "setup:server", "Try again", 1), button("setup:import", "Paste server.cfg", 2), button("setup:home", "Back to setup", 2)])], flags: EPH };
  }
  var saved = await ctx.saveServer({ id: existingId, name: name, host: host, port: port, password: password });
  var lines = String(answer.answer || "").split("\n").slice(0, 6).join("\n");
  var built = embed(0x3ba55d, existingId ? "Server updated" : "Server linked and tested",
    "**" + name + "** answered " + code(answer.command || "serverinfo") + " in " + ms(answer.ms) + ".\n" +
    (saved.ok ? (saved.where === "file" ? "Saved to the data file on the volume." : "Saved to the website.") : "Kept in this bot memory only: " + saved.detail));
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

/* /server ------------------------------------------------------------------ */
/* Read-only questions, answered by your Rust server itself. The bot only ever sends the
   commands on its fixed allowed list (serverinfo, playerlist, gettime, status), so nothing here
   can change a game. Whatever comes back is printed as it arrived, with the round trip next to
   it: if a host answers with something unexpected, you see that rather than a tidy summary. */
const SERVER_QUESTIONS = [
  ["info", "serverinfo", "What the server says about itself"],
  ["players", "playerlist", "Everyone online, with ping"],
  ["time", "gettime", "The in-game clock"],
  ["status", "status", "The server's own status answer"],
  ["check", "serverinfo", "A fresh connection, timed"],
];
function serverQuestion(which) {
  var wanted = String(which || "info").toLowerCase();
  for (var i = 0; i < SERVER_QUESTIONS.length; i++) if (SERVER_QUESTIONS[i][0] === wanted) return SERVER_QUESTIONS[i];
  return SERVER_QUESTIONS[0];
}
export async function serverSnapshot(ctx, which, serverWanted) {
  var question = serverQuestion(which);
  var servers = ctx.servers() || [];
  if (!servers.length) {
    return {
      embeds: [embed(0xdc4c4c, "No Rust server linked yet",
        "Link one with **/setup run**: the address, the RCON port and the password are tested before anything is saved.")],
      components: [row([button("setup:server", "Add a server", 1), link("Commands reference", ctx.siteUrl + "/commands.html#server")])],
      flags: EPH,
    };
  }
  if (!serverWanted && servers.length > 1) {
    return serverChoice(ctx, "server:pick:" + question[0], "/server " + question[0] + " - which server?",
      servers.length + " servers are saved. Pick the one to ask " + code(question[1]) + "; nothing is changed on it.");
  }
  var server = findServer(ctx, serverWanted);
  if (!server) return noServerPayload(ctx, serverWanted);
  var answer = await ctx.rconTest({ host: server.host, port: server.port, password: server.password, command: question[1] });
  if (ctx.recordCheck) ctx.recordCheck(server.id, answer);
  var ok = answer && answer.ok === true;
  var built = embed(ok ? 0x5865f2 : 0xdc4c4c,
    "/server " + question[0] + (ok ? "" : " - no answer"),
    (ok ? "🟢 " : "🔴 ") + "**" + server.name + "** (" + server.host + ":" + server.port + ")\nAsked " + code(question[1]) +
    (ok ? " and it answered in " + ms(answer.ms) + "." : " and it did not answer."));
  built.fields = [];
  if (ok && answer.answer) {
    var text = String(answer.answer).replace(new RegExp(BT, "g"), "'").trim();
    built.fields.push(field("What the server answered",
      block(text.slice(0, 900) + (text.length > 900 ? "\n... and " + (text.length - 900) + " more characters" : "")), false));
  } else if (ok) {
    built.fields.push(field("What the server answered", "an empty answer", false));
  }
  if (!ok) {
    built.fields.push(field("Reason", code((answer && answer.reason) || "unknown") + "\n" + String((answer && answer.detail) || "").slice(0, 400), false));
    built.fields.push(field("What usually causes this", [
      "- The RCON port is not the game or query port",
      "- rcon.web is set to 1 on the server (this speaks the other kind)",
      "- The host refuses connections from the wider internet, or an IP allowlist is on",
    ].join("\n"), false));
  }
  built.footer = { text: question[2] + " | read-only" };
  /* the server id rides along in the button, so "Ask again" asks the same server */
  var sid = String(server.id).slice(0, 40);
  return {
    embeds: [built],
    components: [row([button("server:" + question[0] + ":" + sid, "Ask again", 1), button("server:players:" + sid, "Who is online", 2), button("server:time:" + sid, "Game time", 2)])],
    flags: EPH,
  };
}

/* /user whois -------------------------------------------------------------- */
/* Reads the saved link list. It never guesses and never pings: the account is shown as a
   mention inside an ephemeral reply, which notifies nobody. */
export function whoisReply(ctx, gamertag) {
  var wanted = String(gamertag || "").trim().slice(0, 60);
  var links = ctx.links() || [];
  var pending = ctx.pendingLinks() || [];
  if (!wanted) {
    return {
      embeds: [embed(0x1abc9c, "/user whois",
        "Press **Look someone up** and type a gamertag, or part of one, to see which Discord account is behind it.\n\n" +
        links.length + " link(s) on record, " + pending.length + " request(s) waiting.")],
      components: [row([button("user:whois:go", "Look someone up", 1), button("user:roster", "See the whole roster", 2), button("user:pending", "Waiting list", 2)])],
      flags: EPH,
    };
  }
  var lower = wanted.toLowerCase();
  var exact = links.filter(function (l) { return String(l.gamertag).toLowerCase() === lower; });
  var found = exact.length ? exact : links.filter(function (l) { return String(l.gamertag).toLowerCase().indexOf(lower) > -1 || String(l.userId) === wanted; });
  var waiting = pending.filter(function (p) { return String(p.gamertag).toLowerCase().indexOf(lower) > -1; });
  if (!found.length) {
    var missing = embed(0xfaa81a, "No link for " + wanted,
      "Nobody on record is linked to a gamertag like that."
      + (waiting.length
        ? "\n\n" + (waiting.length === 1 ? "One request is waiting" : waiting.length + " requests are waiting") + " with a matching name. A request is a claim, not proof: approve it from the **Waiting list** only if it is genuine."
        : "\n\nA player can ask to be linked from the panel posted by " + code("/user linkpanel") + "."));
    return { embeds: [missing], components: [row([button(waiting.length ? "user:pending" : "user:roster", waiting.length ? "Open the waiting list" : "See the whole roster", 2)])], flags: EPH };
  }
  var lines = found.slice(0, 12).map(function (l) {
    return "**" + l.gamertag + "** - <@" + l.userId + "> " + code(String(l.userId)) + "\nlinked " + (ago(l.at) || "at an unknown time") + (l.by ? " by <@" + String(l.by).slice(0, 20) + ">" : "");
  });
  var built = embed(0x1abc9c, found.length === 1 ? "1 link found" : found.length + " links found", lines.join("\n\n"));
  if (found.length > 12) built.footer = { text: "Showing the first 12 of " + found.length };
  if (waiting.length) {
    built.fields = [field("Also waiting on staff", waiting.slice(0, 8).map(function (p) {
      return "**" + p.gamertag + "** - <@" + p.userId + ">";
    }).join("\n").slice(0, 900), false)];
  }
  var nav = [button("user:roster", "See the whole roster", 2)];
  if (found.length === 1) nav.unshift(button("user:unlink:ask:" + String(found[0].gamertag).slice(0, 60), "Remove this link", 4));
  return { embeds: [built], components: [row(nav)], flags: EPH };
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

/* Step 1 (roles) is rolesPanel above: Discord's own role menus, one per slot. */

/* ------------------------------------------------ step 2: log channels ------ */
export function channelSetupPanel(ctx) {
  var channels = ctx.settings.logChannels || {};
  var setCount = LOG_TYPES.filter(function (t) { return channels[t[0]]; }).length;
  var built = embed(0xff7200, "Step 2 - Logging channels",
    "Every log type is optional: a type with no channel is simply switched off, and " + setCount + " of " + LOG_TYPES.length + " have one.");
  built.fields = [
    field("Two ways", "**Pick them one by one** - choose a log type, then the channel for it.\n**Create them for me** - the bot makes a Spinback category and one channel per type you tick, shows you the exact list first, and reports each channel back as it is made.", false),
    field("Private to your staff", "Each channel it makes is locked to your staff roles: `@everyone` loses View Channel, every saved staff role keeps it, and the bot keeps what it needs to post. A channel with that name that is already here is reused and relocked instead of being duplicated. With no staff role saved there is nobody to lock it to, so make the roles first (guided setup).", false),
    field("Why the bot asks", "It only saves a channel it can actually post in, and it says so when it cannot. A log target the bot cannot write to would be worse than none.", false),
  ];
  return { embeds: [built], components: [
    row([button("setup:channels:pick", "Pick a type, then a channel", 1), button("setup:channels:build", "Create channels for me", 2)]),
    row([button("setup:roles", "Back to roles", 2), button("setup:server", "Next: the Rust server", 1)]),
  ], flags: EPH };
}

export function logChannelBuilder() {
  return { embeds: [embed(0x3ba55d, "Which logs should get a channel?",
    "Tick the log types you want. The bot makes one text channel per ticked type inside a **Spinback** category, then saves each channel as that log target."
    + "\n\nEvery channel it makes is **private to your staff roles**: `@everyone` is denied View Channel and only the saved staff roles (and the bot) keep it. A channel of that name that is already here is reused and relocked rather than duplicated, and nothing else in the server is touched. You see the list before anything is made.")],
    components: [
      row([stringSelect("setup:channels:build:pick", "Log types to create channels for",
        LOG_TYPES.slice(0, 25).map(function (p) { return { label: p[1], value: p[0] }; }), 1, 10)]),
      row([button("setup:channels", "Back", 2), button("setup:run", "Guided setup", 2)]),
    ], flags: EPH };
}

export function logChannelPlan(keys, ctx) {
  var list = (keys || []).map(function (key) {
    var found = LOG_TYPES.filter(function (t) { return t[0] === key; })[0];
    return "- **#spinback-" + String(key).toLowerCase() + "** for " + (found ? found[1] : key);
  });
  var roles = (ctx && ctx.settings && ctx.settings.staffRoles) || {};
  var staff = STAFF_ROLE_RECIPES.filter(function (r) { return roles[r[0]]; });
  var built = embed(0xfaa81a, "Create these channels?",
    "A category named **Spinback**, then " + (keys || []).length + " text channel(s) in this server:\n\n" + (list.join("\n") || "nothing selected"));
  built.fields = [
    field("Who will be able to read them", staff.length
      ? "`@everyone` is denied View Channel on each one, and these saved staff roles keep it: " + staff.map(function (r) { return r[1]; }).join(", ") + ". The bot keeps what it needs to post, and nothing else in the server changes."
      : "**No staff role is saved yet**, so there is nobody to lock these to and `@everyone` would keep reading them. Make the roles first (guided setup), then come back here.", false),
    field("Afterwards", "Each channel is saved as that log type target, so logs start going there. A channel the bot cannot create is reported with the reason and simply skipped.", false),
  ];
  built.footer = { text: "This is the only step that creates channels, and it does it only when you press Create" };
  return { embeds: [built], components: [
    row([button("setup:channels:build:go", "Create them", 3), button("setup:channels:build:cancel", "Cancel", 2)]),
    row([button("setup:run:roles", "Make the staff roles first", 2)]),
  ], flags: EPH };
}

export function logChannelBuilt(created, failed, wrote, reused, staffIds) {
  var okList = created || [];
  var again = reused || [];
  var badList = failed || [];
  var locked = staffIds || [];
  var built = embed(badList.length ? 0xfaa81a : 0x3ba55d, "Log channels",
    okList.length + " channel(s) created" + (again.length ? ", " + again.length + " already there and relocked" : "") + (badList.length ? ", " + badList.length + " skipped" : "") + "."
    + (wrote && wrote.ok ? " Saved to the website." : " The website refused the settings save, so these ids live in this bot memory only: " + String((wrote && wrote.detail) || "").slice(0, 160)));
  var fields = [];
  if (okList.length) fields.push(field("Created", okList.slice(0, 12).join("\n").slice(0, 1000), false));
  if (again.length) fields.push(field("Already there, now relocked", again.slice(0, 12).join("\n").slice(0, 1000), false));
  if (badList.length) fields.push(field("Skipped", badList.slice(0, 8).join("\n").slice(0, 1000), false));
  fields.push(field("Who can read them", locked.length
    ? locked.length + " staff role(s) plus the bot, and `@everyone` is denied View Channel on each channel. If you add or change a staff role later, run this once more: an existing channel is relocked rather than duplicated."
    : "No staff role is saved, so these channels are visible to everyone. Make the roles, then run this again to lock them.", false));
  built.fields = fields;
  return { embeds: [built], components: [
    row([button("setup:channels", "Back to log channels", 2), button("setup:doctor", "Health check", 2), button("setup:server", "3. Add the Rust server", 1)]),
  ], flags: EPH };
}

/* ------------------------------------------------- step 3: the Rust server -- */
export function serverStepPanel(ctx) {
  var servers = ctx.servers();
  var built = embed(0xff7200, "Step 3 - Your Rust server",
    "The address, the RCON port and the password come from your server.cfg. Nothing is saved until the server answers a real RCON command, so a wrong port or password cannot land in your settings."
    + (servers.length ? "\n\nAlready saved: " + servers.map(function (s) { return code(s.name + " " + s.host + ":" + s.port); }).join(", ") : ""));
  built.fields = [
    field("What you can type", "The address on its own, or with the port on the end - " + code("51.38.1.2") + ", " + code("51.38.1.2:28015") + ", " + code("[2606:4700::1]:28015") + " and " + code("eu01.example.net") + " are all read correctly. A private address (192.168.x.x, 10.x.x.x, 127.0.0.1) cannot be reached from a cloud host, and the panel says so in those words.", false),
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
  var built = embed(0xff7200, "What the names suggest",
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
  var giveIssues = [];
  if (give && give.indexOf("{player}") === -1) giveIssues.push("no {player}");
  if (give && give.indexOf("{kit}") === -1) giveIssues.push("no {kit}");
  fields.push(field("Kit settings",
    (list ? "list command set" : "no list command") + "\n"
    + (give ? "give template set" : "no give template") + (giveIssues.length ? " (" + giveIssues.join(", ") + ")" : "")
    + "\ncooldown per player + kit: " + (kits.giveCooldownSeconds == null ? 30 : kits.giveCooldownSeconds) + " s"
    + "\n" + (kits.binds || []).length + " bind(s), " + Object.keys(kits.authSpawn || {}).length + " respawn kit(s), delivery " + (kits.locked ? "paused" : "on"), false));
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
      "cooldown = " + (kits.giveCooldownSeconds == null ? 30 : kits.giveCooldownSeconds) + " s",
      "binds = " + (kits.binds || []).length,
      "respawn kits = " + Object.keys(kits.authSpawn || {}).length,
      "delivery paused = " + (kits.locked ? "yes" : "no"),
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
    field("What goes", [roles + " role slot(s)", channels + " log channel(s)", servers + " server(s)", (kits.binds || []).length + " bind(s)", Object.keys(kits.authSpawn || {}).length + " respawn kit(s)", "the kit commands", "the stored kit-code preview records"].join("\n"), false),
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
  var built = embed(0xff7200, "Your kit plugin's commands",
    "This bot will not invent the name of a command inside your kit plugin. Give it yours, exactly as you would type them in the game console, and it uses them as given.");
  built.fields = [
    field("List kits", list ? code(list) : "not set - /kits grab cannot read your real kit names without it", false),
    field("Give a kit", give ? code(give) : "not set - /kits give has nothing to send", false),
    field("Cooldown per player + kit", (kits.giveCooldownSeconds == null ? 30 : kits.giveCooldownSeconds) + " s - only gives the server accepts start one", false),
    field("Placeholders", "The give template is filled in with " + code("{player}") + " and " + code("{kit}") + ". Any wording around them is kept exactly as you write it.", false),
  ];
  built.footer = { text: "Leave a field blank when saving to clear that one command" };
  return { embeds: [built], components: [
    row([button("kits:delivery", "Enter the commands", 1), button("kits:grab", "Read my kits now", 2)]),
    row([button("kits:doctor", "Check the kit setup", 2), button("kits:config", "Back to Emote Kits", 2)]),
  ], flags: EPH };
}

export function kitsDoctor(ctx) {
  var kits = ctx.kits();
  var binds = kits.binds || [];
  var auth = kits.authSpawn || {};
  var give = String(kits.giveCommand || "").trim();
  var list = String(kits.listCommand || "").trim();
  var todo = [];
  var broken = binds.filter(function (b) { return !b.emote || !(b.kits || []).length; });
  if (!list) todo.push("Set your kit plugin **list command** with /kits commands: without it, /kits grab cannot read your real kit names, and this bot will not invent them.");
  if (!give) todo.push("Set a **give template** with /kits commands, using {player} and {kit}: until then /kits give has nothing to send.");
  else if (give.indexOf("{player}") === -1 || give.indexOf("{kit}") === -1) todo.push("The give template needs both {player} and {kit} in it.");
  if (!binds.length) todo.push("Add at least one bind with /kits config: a bind is what ties an emote to its kits.");
  if (broken.length) todo.push(broken.length + " bind(s) are incomplete and should be edited or removed.");
  if (binds.length || Object.keys(auth).length) todo.push("Binds and respawn kits are saved, but run in game only once a Rust plugin sends emote and respawn events to the bot (not connected yet). /kits give works today.");
  var built = embed(todo.length ? 0xfaa81a : 0x3ba55d, "Kit setup check",
    "Read from what is saved at " + when() + ". Nothing was sent to your server by this panel, so a kit name is only ever checked against what the plugin itself reports.");
  built.fields = [
    field("Commands", "list: " + (list ? code(list) : "not set") + "\ngive: " + (give ? code(give) : "not set") + "\ncooldown per player + kit: " + (kits.giveCooldownSeconds == null ? 30 : kits.giveCooldownSeconds) + " s", false),
    field("Binds", binds.length ? binds.slice(0, 10).map(function (b) {
      return code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " | " + b.cooldown + "s" : "") + (b.roleId ? " | <@&" + b.roleId + ">" : "");
    }).join("\n").slice(0, 1000) : "none yet", false),
    field("Respawn kits", Object.keys(auth).length ? Object.keys(auth).map(function (g) { return g + " -> " + code(auth[g]); }).join("\n") : "none set", false),
    field("Kit delivery", kits.locked ? "paused: /kits give refuses until it is resumed" : "on", true),
    field("Kit-code previews stored", String(Object.keys(ctx.settings.installs || {}).length), true),
  ];
  if (todo.length) built.fields.push(field("Do this next", todo.slice(0, 5).map(function (t) { return "- " + t; }).join("\n").slice(0, 1000), false));
  built.footer = { text: "Read-only: this panel changed nothing" };
  return { embeds: [built], components: [
    row([button("kits:commands", "Kit commands", 1), button("kits:grab", "Read my kits now", 2), button("kits:config", "Emote Kits", 2)]),
  ], flags: EPH };
}

/* /help -------------------------------------------------------------------- */
var STAFF_RULE = "Staff: the roles saved in step 1 of /setup, plus Administrator, Manage Server and the server owner. Before any staff role is saved, only those last three.";
function helpButtons(current) {
  return row(["ping", "setup", "kits", "user", "server"].map(function (n) { return button("help:cmd:" + n, "/" + n, n === current ? 1 : 2); }));
}
export function helpHome(ctx) {
  var site = (ctx && ctx.siteUrl) || "https://spinback-j7ao5f.camelai.app";
  var built = embed(0x5865f2, "Spinback RCE commands",
    "Pick a command to see every subcommand, who may run it and what it needs set up first.\n\n" +
    "**/ping** - live bot and website health\n**/setup** - roles, logging channels and your Rust server\n" +
    "**/kits** - emote kits, giving kits, cooldowns and installs\n**/user** - player links: whois, confirm, move, remove, roster\n" +
    "**/server** - read-only questions to your Rust server: info, players, time, status\n" +
    "**/help** - this page");
  built.footer = { text: "No command needs typing: each one opens a panel, a picker or a form" };
  return {
    embeds: [built],
    components: [helpButtons(""), row([link("Status page", site + "/status.html"), link("Commands reference", site + "/commands.html")])],
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
      "Kits end to end: the real kit names from your server, giving kits over RCON with a cooldown per player + kit, and Kit Studio codes. Emote binds and respawn kits are saved settings: they run in game only once a Rust plugin sends emote and respawn events to the bot, which is not connected yet."),
    help: embed(0x5865f2, "Help: /help",
      "This page. Run it bare for every command, or name one with the command option to jump straight to its page. Anyone in the server can use it."),
    server: embed(0x5865f2, "Help: /server",
      "Read-only questions put to your Rust server over RCON: info, players, time and status, plus a fresh-connection check. Whatever the server answers is shown as it arrived."),
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
        "**run** - guided: the bot makes the staff roles and private log channels, then your server",
        "**roles** - staff roles and the Linked role, from Discord's role menus",
        "**channels** - pick a channel per log type, or let the bot create them for you",
        "**server** - add a Rust server (typed in, or pasted from server.cfg with **import**)",
        "**suggest** - read the role and channel names here and propose a full setup; Apply saves it",
        "**doctor** - a full health check of every saved setting, with what to fix",
        "**export** - your settings as copyable text, never with a password",
        "**reset** - clear the settings after typing RESET (player links are kept)",
        "**status** - a checklist of what is saved, plus live checks: can the bot post in each log channel, do the roles still exist, can it give the linked role",
        "**edit** - pick a saved server and change its address, port or password",
        "**refresh** `server` - a fresh RCON check of one server, or of every server (the result also shows in /ping)",
      ].join("\n"), false),
      field("Saving", "Settings are kept on the website (with BOT_SETTINGS_TOKEN), or in a file on a Railway volume attached to the bot. With neither, /setup says so in red: changes then last only until the next redeploy.", false),
      field("Permissions", STAFF_RULE + " Panels are only visible to you.", false),
      field("Needs first", "The RCON port and password from server.cfg, with rcon.web set to 0.", false),
    ],
    kits: [
      field("Subcommands", [
        "**grab** - read the real kit names from your server (asks which server when several are saved)",
        "**config** - binds, delivery settings, pause switch, emote guide",
        "**commands** - your kit plugin's list command, give template and cooldown",
        "**doctor** - what the kit setup still needs, read-only",
        "**give** `kit` `gamertag` or `user` `server` - give a kit now, over RCON",
        "**refresh** `scope` `target` - clear give cooldowns for a player, a kit, or everything",
        "**cooldowns** - give cooldowns running now (held in memory; a restart clears them)",
        "**auth-spawn** `group` `kit` - save a respawn kit for a group (needs the game hook to run)",
        "**build** - Kit Studio on the website",
        "**add** `code` - preview a Kit Studio code; only a hash and short excerpt are retained, never the full code",
      ].join("\n"), false),
      field("Delivery settings", "In **/kits config**, press **Delivery settings** to set the list command, the give template ({player} and {kit}) and the cooldown per player + kit. Only gives the server accepts start a cooldown. **Pause kit delivery** stops all gives until resumed.", false),
      field("Permissions", STAFF_RULE, false),
      field("Needs first", "Setup finished (a staff role and a tested server), then your kit plugin's list command and a give template using {player} and {kit}. The bot will not guess either.", false),
    ],
    user: [
      field("Subcommands", [
        "**forcelink** `user` `gamertag` - link someone yourself (or pick them from a menu)",
        "**forceunlink** `gamertag` - remove a link, after a confirmation",
        "**transfer** `gamertag` `to_user` `to_gamertag` - move a link to a new account or gamertag",
        "**linkpanel** `channel` - post the Link account / Unlink panel for players",
        "**roster** `search` - every linked player, page by page, or only those matching a gamertag or Discord id",
        "**whois** `gamertag` - which Discord account is behind a gamertag (and any waiting requests)",
        "**pending** - the waiting list: approve or reject link requests in one click",
      ].join("\n"), false),
      field("Waiting list", "Players who asked through the panel wait on the **Waiting list** in /user until staff approve or reject them, in one click each. The player is told by direct message either way (unless their DMs are closed; the reply says which). Posting a new link panel offers to remove the old one.", false),
      field("Permissions", STAFF_RULE + " The link panel's own buttons work for everyone.", false),
      field("Needs first", "Setup finished. Set a Linked role in /setup to have it given and taken away automatically (the bot needs Manage Roles, above that role).", false),
    ],
    help: [
      field("Options", "**command** - open one command's page straight away", false),
      field("Permissions", "Anyone in this server.", false),
    ],
    server: [
      field("Subcommands", [
        "**info** `server` - what the server says about itself",
        "**players** `server` - the live player list with ping",
        "**time** `server` - the in-game clock",
        "**status** `server` - the server's own status answer",
        "**check** `server` - a fresh connection, timed",
      ].join("\n"), false),
      field("Read-only", "Only the commands on the bot's allowed list are ever sent: serverinfo, playerlist, gettime and status. Nothing can be changed from here.", false),
      field("Permissions", STAFF_RULE, false),
      field("Needs first", "One tested Rust server from /setup. With several saved, the bot asks which one first.", false),
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
  if (!ctx.storeTokenSet()) next.push("**Settings are not being saved.** Attach a volume to the bot's service on Railway (simplest), or set BOT_SETTINGS_TOKEN to the same value on the bot and the website. Until then a redeploy forgets everything.");
  if (!servers.length) next.push("Run **/setup run** and add your Rust server, so the RCON connection can be tested.");
  if (!STAFF_SLOTS.some(function (s) { return roles[s[0]]; })) next.push("Step 1: **/setup run** can create the staff roles for you, or pick roles you already have.");
  if (!LOG_TYPES.some(function (t) { return channels[t[0]]; })) next.push("Step 2: **/setup run** can create one log channel per log type, locked to those staff roles.");
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
  var built = embed(0xff7200, "Kit cooldowns",
    list.length
      ? "The cooldown records this bot is holding right now."
      : "No kit is cooling down. Each **/kits give** that the server accepts starts one for that player + kit (set the length in Delivery settings). They live in the bot's memory, so a restart clears them.");
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
  var tools = [button("user:roster:search", query ? "Search again" : "Search", 1)];
  if (query) tools.push(button("user:roster", "Show everyone", 2));
  tools.push(button("user:whois:go", "Look someone up", 2), button("user:config", "Back to links", 2));
  var rows = nav.length ? [row(nav), row(tools)] : [row(tools)];
  return { embeds: [built], components: rows, flags: EPH };
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
/* The give form: the kit, the gamertag (filled in when a linked player was picked first) and,
   with more than one server saved, which one - filled in with the first. */
export function kitGiveModal(ctx, gamertag) {
  var servers = (ctx && ctx.servers && ctx.servers()) || [];
  var known = ctx ? knownKitNames(ctx) : [];
  var kitBox = input("give_kit", "Kit name", "", true);
  if (known.length) kitBox.placeholder = ("for example: " + known.slice(0, 4).join(", ")).slice(0, 100);
  var rows = [row([kitBox]), row([input("give_target", "Gamertag", String(gamertag || "").slice(0, 40), true)])];
  if (servers.length > 1) {
    var serverBox = input("give_server", "Server (" + servers.length + " saved)", servers[0].name, false);
    serverBox.placeholder = servers.slice(0, 5).map(function (x) { return x.name; }).join(", ").slice(0, 100);
    rows.push(row([serverBox]));
  }
  return { title: "Give a kit", custom_id: "modal:kitgive", components: rows };
}

/* With more than one server saved, questions that go to one server ask which first. */
export function serverChoice(ctx, customIdPrefix, title, text) {
  var servers = ctx.servers() || [];
  return { embeds: [embed(0x5865f2, title, text)],
    components: [row([stringSelect(customIdPrefix, "Saved servers",
      servers.slice(0, 25).map(function (x) { return { label: String(x.name).slice(0, 90), value: String(x.id).slice(0, 90), description: (x.host + ":" + x.port).slice(0, 90) }; }))])],
    flags: EPH };
}

/* /user whois and roster search ask for the name in a form. */
export function whoisModal() {
  return { title: "Look up a gamertag", custom_id: "modal:whois", components: [
    row([input("whois_tag", "Gamertag, or part of one, or a Discord id", "", true)]),
  ] };
}
export function rosterSearchModal() {
  return { title: "Search the roster", custom_id: "modal:rostersearch", components: [
    row([input("roster_search", "Gamertag, or part of one, or a Discord id", "", true)]),
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
    "Paste a Base64 code from Kit Studio. The bot validates it and learns recognised kit names for autocomplete. For privacy and safety, it retains only a hash, the decoded length and up to 400 characters of preview text; the original Base64 code is not saved or sent to your server.")],
    components: [row([button("kits:add:code", "Enter a code", 1), studio]), row([button("kits:config", "Back to Emote Kits", 2)])], flags: EPH };
}

export function kitAddModal() {
  return { title: "Preview a kit code", custom_id: "modal:kitcode", components: [
    row([input("install_code", "Base64 kit code from Kit Studio", "", true)]),
  ] };
}

export function kitsPanel(ctx) {
  var binds = ctx.kits().binds || [];
  var auth = ctx.kits().authSpawn || {};
  var built = embed(0xff7200, "Emote Kits",
    "A bind ties an emote to up to three kits, with a cooldown and an optional role. **Binds and respawn kits are saved settings:** they run in game only once a Rust plugin feeds emote and respawn events to the bot, which is not connected yet. **/kits give** works today, over RCON.");
  var bindLines = binds.map(function (b) {
    return code(b.emote) + " -> " + (b.kits || []).join(", ") + (b.cooldown ? " (" + b.cooldown + "s)" : "") + (b.roleId ? " <@&" + b.roleId + ">" : "");
  });
  built.fields = [
    field("Binds (" + binds.length + ")", binds.length ? fitLines(bindLines, 1000) : "none yet", false),
    field("Kit delivery", ctx.kits().locked ? "\u23f8\ufe0f paused" : "\ud83d\udfe2 on", true),
    field("Auth groups with a kit", String(Object.keys(auth).length), true),
    field("Cooldowns on record", String(ctx.cooldownCount()), true),
    field("Delivery", "List command: " + (ctx.kits().listCommand ? code(ctx.kits().listCommand) : "not set") + "\nGive template: " + (ctx.kits().giveCommand ? code(ctx.kits().giveCommand) : "not set") +
      "\nCooldown per player + kit: " + (ctx.kits().giveCooldownSeconds == null ? 30 : ctx.kits().giveCooldownSeconds) + " s", false),
  ];
  built.footer = { text: "Emote and kit names come from your own server" };
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
    row([Object.assign(input("kit_give_cooldown", "Cooldown per player + kit, seconds (0 = none)", String(k.giveCooldownSeconds == null ? 30 : k.giveCooldownSeconds), false), { max_length: 5 })]),
  ] };
}
export function saveDelivery(ctx, data) {
  var list = String(data.kit_list || "").replace(/[\r\n]+/g, " ").trim();
  var give = String(data.kit_give || "").replace(/[\r\n]+/g, " ").trim();
  var problems = [];
  if (list.length > 120) problems.push("The list command is longer than 120 characters.");
  if (give.length > 200) problems.push("The give template is longer than 200 characters.");
  if (give && (give.indexOf("{player}") < 0 || give.indexOf("{kit}") < 0)) problems.push("The give template needs both {player} and {kit}, so the bot knows where the gamertag and the kit name go.");
  var coolText = String(data.kit_give_cooldown == null ? "" : data.kit_give_cooldown).trim();
  var cooldown = coolText === "" ? 30 : Number(coolText);
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 86400) problems.push("The cooldown must be a whole number of seconds from 0 to 86400.");
  if (problems.length) {
    return { embeds: [embed(0xdc4c4c, "Not saved", problems.join("\n"))], components: [row([button("kits:delivery", "Try again", 1), button("kits:config", "Back to Emote Kits", 2)])], flags: EPH };
  }
  var result = ctx.setDelivery({ listCommand: list, giveCommand: give, giveCooldownSeconds: Number.isInteger(cooldown) ? cooldown : 30 });
  if (result && typeof result.then === "function") return result.then(function (wrote) { return deliverySaved(list, give, wrote); });
  return deliverySaved(list, give, result);
}
function deliverySaved(list, give, wrote) {
  var example = give ? give.split("{player}").join("PlayerOne").split("{kit}").join("STARTER") : "";
  var built = embed(0x3ba55d, "Delivery saved", (list ? "List command: " + code(list) : "No list command (so /kits grab stays off).") + "\n" +
    (give ? "Give template: " + code(give) + "\nFor example, STARTER to PlayerOne sends: " + code(example) : "No give template (so /kits give stays off).") +
    (wrote && wrote.ok === false ? "\n\nKept in this bot memory only: " + wrote.detail : ""));
  var nav = [button("kits:config", "Back to Emote Kits", 2)];
  if (list) nav.unshift(button("kits:grab", "Read kit names now", 1));
  return { embeds: [built], components: [row(nav)], flags: EPH };
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
      ? names.length + " - the give form now shows them"
      : "none recognised in that answer, so the suggestions are unchanged", false)];
  }
  return { embeds: [built], components: [row([button("kits:grab", "Read again", 2), button("kits:config", "Emote Kits", 2)])], flags: EPH };
}
export function kitStudioPanel(ctx) {
  return { embeds: [embed(0x5865f2, "Kit Studio",
    "Build a kit slot by slot on the website, then bring its code back here so the bot learns the kit names. The site and this bot share the same 299-item catalogue, so a kit made there is the same kit here.")],
    /* kits:add:code opens the install-code form; kits:add is "Add a bind". */
    components: [row([link("Open Kit Studio", ctx.siteUrl + "/dashboard/kitbuilder.html"), button("kits:add:code", "Store a code", 1)])], flags: EPH };
}
export function installKit(ctx, rawCode) {
  var raw = String(rawCode || "").trim();
  if (!raw) return { embeds: [embed(0xdc4c4c, "No code given", "Paste the Base64 code from Kit Studio.")], flags: EPH };
  if (raw.length > 16000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 === 1) {
    return { embeds: [embed(0xdc4c4c, "That code is not valid", "Paste a Base64 text code no longer than 16,000 characters. Nothing was stored.")], flags: EPH };
  }
  var text = null;
  try { text = Buffer.from(raw, "base64").toString("utf8"); } catch (error) { text = null; }
  var canonical = !!text && Buffer.from(text, "utf8").toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "");
  var ok = canonical && text.length > 2 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  if (!ok) return { embeds: [embed(0xdc4c4c, "That does not decode", "The value must be canonical Base64 that decodes to readable text. Nothing was stored.")], flags: EPH };
  var count = ctx.installKit(raw, text);
  /* Kit Studio codes decode to kit add "NAME" lines: those names join the suggestions. */
  var names = [];
  text.replace(/^\s*kit\s+add\s+"([^"]{1,60})"/gim, function (all, name) { if (names.indexOf(name) < 0) names.push(name); return all; });
  if (names.length && ctx.setKnownKits) ctx.setKnownKits(knownKitNames(ctx).concat(names.filter(function (n) { return knownKitNames(ctx).indexOf(n) < 0; })));
  var built = embed(0x3ba55d, "Code preview saved - not installed",
    "The bot retained a SHA-256 fingerprint and a short excerpt of the decoded text (up to 400 characters). The original Base64 code is not retained, executed or sent over RCON. Create the kit with your server plugin, then use **/kits give**.");
  built.fields = [
    field("Decoded length", text.length + " characters", true),
    field("Previews kept", String(count), true),
    field("Preview excerpt", code(text.slice(0, 150)), false),
  ];
  if (names.length) built.fields.push(field("Kit names found", names.map(function (n) { return code(n); }).join(", ").slice(0, 1000) + " - the give form now shows them", false));
  return { embeds: [built], flags: EPH };
}
export function authSpawnNote(ctx, group, kit) {
  ctx.setAuthSpawn(group, kit);
  return { embeds: [embed(kit ? 0x3ba55d : 0xfaa81a, kit ? "Respawn kit saved" : "Respawn kit cleared",
    kit ? "**" + group + "** is set to " + code(kit) + " on respawn. This runs in game only once a Rust plugin sends respawn events to the bot, which is not connected yet." : "**" + group + "** no longer has a respawn kit saved.")], flags: EPH };
}
export function refreshCooldowns(ctx, scope, target) {
  var cleared = ctx.clearCooldowns(scope, target);
  var what = scope === "user" ? "gamertag " + target : scope === "kit" ? "kit " + target : scope === "all-users" ? "every linked user" : "every kit";
  return { embeds: [embed(0x3ba55d, "Cooldowns cleared", "Cleared **" + cleared + "** record" + (cleared === 1 ? "" : "s") + " for " + what + ".")], flags: EPH };
}
export async function giveKit(ctx, opts) {
  var command = String(ctx.kits().giveCommand || "").trim();
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
  if (ctx.kits().locked) {
    return { embeds: [embed(0xfaa81a, "Kit delivery is paused",
      "Staff paused kit delivery in **/kits config**. Resume it there before sending another kit.")],
      components: [row([button("kits:config", "Open Emote Kits", 1)])], flags: EPH };
  }
  var final = command.split("{player}").join(target).split("{kit}").join(kit);
  /* One give per player + kit per cooldown (Delivery settings; 30 s unless changed), and
     never two at once: a double press or two staff at the same moment send it once. */
  var seconds = ctx.kits().giveCooldownSeconds == null ? 30 : Number(ctx.kits().giveCooldownSeconds);
  var reservation = ctx.reserveKitGive ? ctx.reserveKitGive(target, kit, seconds) : null;
  if (reservation && !reservation.ok) {
    return { embeds: [embed(0xfaa81a, reservation.inProgress ? "Already being sent" : "On cooldown",
      reservation.inProgress
        ? code(kit) + " to " + code(target) + " is being sent right now."
        : code(kit) + " was given to " + code(target) + " moments ago. It can go again in " + reservation.remainingSeconds + " s.")],
      components: [row([button("kits:refresh", "Cooldowns", 2)])], flags: EPH };
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
    "Pick a linked player (their gamertag is filled in for you), or type a kit and a gamertag. The kit goes out with the give template you saved, and the server answer is shown back to you as it comes.");
  if (known.length) built.fields = [field("Kit names the bot knows", fitLines(known.map(function (k) { return code(k); }), 1000), false)];
  return { embeds: [built], components: components, flags: EPH };
}

export function dispatchCommand(ctx, name, sub, options) {
  options = options || {};
  if (name === "ping") return pingReply(ctx);
  if (name === "help") return options.command ? helpDetail(String(options.command), ctx) : helpHome(ctx);
  /* /setup is how you get out of the gate, so it is the only command that runs before setup
     is finished. Everything else answers with the checklist instead of doing nothing. */
  if (name !== "setup") {
    var gate = setupState(ctx);
    if (gate.complete !== true) return gatePayload(ctx, "/" + name + (sub ? " " + sub : ""));
  }
  if (name === "setup") {
    if (sub === "run") return runSetupPanel(ctx);
    if (sub === "refresh") return testServers(ctx, options.server);
    if (sub === "status") return setupStatus(ctx);
    if (sub === "edit") return serverPicker(ctx, "edit");
    if (sub === "roles") return rolesPanel(ctx, 1);
    if (sub === "channels") return channelSetupPanel(ctx);
    if (sub === "server") return serverStepPanel(ctx);
    if (sub === "suggest") return setupSuggest(ctx);
    if (sub === "doctor") return setupDoctor(ctx);
    if (sub === "import") return setupImportPanel();
    if (sub === "export") return setupExport(ctx);
    if (sub === "reset") return setupResetPanel(ctx);
    return setupPanel(ctx);
  }
  if (name === "kits") {
    if (sub === "grab") {
      var quick = grabKits(ctx);
      if (quick) return quick;
      if (!options.server && (ctx.servers() || []).length > 1) return serverChoice(ctx, "kits:grab:pick", "Read kit names - which server?", "Pick the server to ask with your list command.");
      return grabKitsRun(ctx, options.server);
    }
    if (sub === "config") return kitsPanel(ctx);
    if (sub === "commands") return kitCommandsPanel(ctx);
    if (sub === "doctor") return kitsDoctor(ctx);
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
    if (sub === "whois") return whoisReply(ctx, options.gamertag);
    if (sub === "pending") return pendingPanel(ctx);
    return userPanel(ctx);
  }
  if (name === "server") return serverSnapshot(ctx, sub || "info", options.server);
  return { content: "That command is not wired up here yet.", flags: EPH };
}
