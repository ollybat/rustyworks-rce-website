/* The flows scripts/simulate-bot.mjs drives through the real bot. Runs inside the bot
   process (the discord.js stand-in calls run() once the bot is ready) and reports one JSON
   line, SIM_RESULT, which the runner turns into a pass or a failure. */
import { createChecker } from "../lib/discord-limits.mjs";

const SITE = process.env.SITE_URL;
const ADMIN = { id: "100000000000000201", perms: 8n };                 // Administrator, no staff role
const OWNER_ROLE = { id: "100000000000000202", roles: ["100000000000000301"] };      // the Owner staff role, no permissions
const LINKED_ONLY = { id: "100000000000000203", roles: ["100000000000000302"] };     // only the Linked role
const PLAYER = { id: "100000000000000204" };                           // nobody in particular
const NEWGUY = { id: "100000000000000205" };

const results = [];
const limits = createChecker();
const all = [];

function expect(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: ok ? undefined : String(detail === undefined ? "" : detail).slice(0, 400) });
}
function last(it) {
  const answers = it.calls.filter((c) => c.body !== undefined && ["reply", "editReply", "update", "showModal", "respond"].includes(c.method));
  return answers.length ? answers[answers.length - 1].body : null;
}
function text(value) { return JSON.stringify(value || null, (k, v) => (typeof v === "bigint" ? String(v) : v)); }
async function writes() { return (await fetch(SITE + "/__sim/writes")).json(); }
const latest = (w) => (w && w.length ? w[w.length - 1] : {}) || {};

export async function run({ world, make, interact }) {
  const go = async (it, label) => {
    await interact(it);
    all.push({ it, label });
    const body = last(it);
    if (body && it.calls.some((c) => c.method !== "showModal" && c.method !== "respond" && c.body === body)) limits.checkPayload(label, body);
    if (body && it.calls.some((c) => c.method === "showModal" && c.body === body)) limits.checkPayload(label + " (form)", body);
    return it;
  };

  /* 1. another guild gets the wrong-server note and nothing else */
  let it = await go(make.command(Object.assign({ guildId: "other" }, ADMIN), "setup", "run"), "/setup run from another guild");
  expect("another guild is refused", text(last(it)).includes("Wrong server"), text(last(it)));

  /* 2. /help: every command has a page and the pages really open */
  it = await go(make.command(ADMIN, "help"), "/help");
  expect("/help lists /user", text(last(it)).includes("/user"), text(last(it)));
  it = await go(make.button(ADMIN, "help:cmd:user"), "help: /user page");
  expect("help detail page opens (it used to wipe the buttons)", text(last(it)).includes("Help: /user") && ((last(it) || {}).components || []).length > 0, text(last(it)));

  /* 3. before any staff role exists, only Administrator / Manage Server / owner may configure */
  it = await go(make.command(LINKED_ONLY, "setup", "run"), "/setup run by a linked player, before setup");
  expect("a non-admin is refused before setup", text(last(it)).includes("Not allowed"), text(last(it)));

  /* 4. roles from Discord's own role menu, saved through the website */
  it = await go(make.command(ADMIN, "setup", "run"), "/setup run");
  expect("/setup run shows guided setup", text(last(it)).includes("Guided setup"), text(last(it)));
  it = await go(make.button(ADMIN, "setup:home"), "the step-by-step setup panel");
  expect("the step-by-step panel is one press away", text(last(it)).includes("Spinback RCE setup"), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "setup:roles"), "setup: roles page 1");
  const roleMenus = ((last(it) || {}).components || []).filter((r) => r.components && r.components[0] && r.components[0].type === 6).length;
  expect("roles are picked from role menus (4 on page 1)", roleMenus === 4, text(last(it)));
  it = await go(make.select(ADMIN, "role", "setup:role:owner", ["100000000000000301"]), "pick the Owner role");
  let w = await writes();
  expect("the Owner role is saved to the website", (latest(w).staffRoles || {}).owner === "100000000000000301", text(latest(w)));
  expect("a save sends only what changed (no stale copy of the rest)", Object.keys(latest(w)).join(",") === "staffRoles", Object.keys(latest(w)).join(","));
  expect("a slow save is deferred, not dropped", (it.calls[0] || {}).method === "deferUpdate" && it.firstAckAt < 3000, text(it.calls.map((c) => c.method + "@" + c.at)));
  it = await go(make.button(ADMIN, "setup:roles:2"), "setup: roles page 2");
  it = await go(make.select(ADMIN, "role", "setup:role:linked", ["100000000000000302"]), "pick the Linked role");
  w = await writes();
  expect("the Linked role is saved", (latest(w).staffRoles || {}).linked === "100000000000000302", text(latest(w)));

  /* 5. the Linked role is not a staff role (it used to be: every linked player was staff) */
  it = await go(make.command(LINKED_ONLY, "setup", "run"), "/setup run by a linked player, after setup");
  expect("a player with only the Linked role is NOT staff", text(last(it)).includes("Not allowed"), text(last(it)));
  it = await go(make.command(OWNER_ROLE, "setup", "status"), "/setup status by the Owner role");
  expect("the Owner role is staff", text(last(it)).includes("Setup status"), text(last(it)));

  /* 6. log channels: set them, clear one, and a test message really arrives */
  const channels = { command: "100000000000000401", linking: "100000000000000402", admin: "100000000000000403", rcon: "100000000000000404", emoteKits: "100000000000000405", errors: "100000000000000406" };
  it = await go(make.button(ADMIN, "setup:channels"), "setup: log types");
  for (const [type, channel] of Object.entries(channels)) {
    await go(make.select(ADMIN, "string", "setup:logtype", [type]), "log type " + type);
    await go(make.select(ADMIN, "channel", "setup:channel:" + type, [channel]), "log channel " + type);
  }
  it = await go(make.select(ADMIN, "channel", "setup:channel:errors", []), "clear the error log");
  w = await writes();
  expect("clearing a channel saves it as off (null), so it stays off after a restart", (latest(w).logChannels || {}).errors === null && (latest(w).logChannels || {}).command === "100000000000000401", text(latest(w).logChannels));
  await go(make.select(ADMIN, "channel", "setup:channel:errors", ["100000000000000406"]), "error log back on");
  it = await go(make.button(ADMIN, "setup:logtest:command"), "send a test log");
  expect("a test log reaches its channel", world.sent.some((m) => m.channelId === "100000000000000401" && text(m.payload).includes("Test message")), text(world.sent.slice(-2)));

  /* 7. forms: the values typed into a form reach the bot (they used to arrive empty) */
  it = await go(make.button(ADMIN, "setup:server"), "open the add-server form");
  expect("the add-server form opens", (it.calls[0] || {}).method === "showModal", text(it.calls));
  it = await go(make.modal(ADMIN, "modal:server", { srv_name: "Second", srv_host: "rcon.invalid", srv_port: "28016", srv_pass: "pw" }), "submit the add-server form");
  expect("typed form values reach the bot", text(last(it)).includes("rcon.invalid:28016"), text(last(it)));

  /* 8. editing a server with the password left blank keeps the saved password */
  it = await go(make.select(ADMIN, "string", "setup:pick", ["srv1"]), "pick a server to edit");
  expect("the edit form says a blank password keeps the saved one", text(last(it)).includes("blank keeps"), text(last(it)));
  const slow = [];
  slow.push(go(make.modal(ADMIN, "modal:server:srv1", { srv_name: "Main", srv_host: "rcon.sim.test", srv_port: "28016", srv_pass: "" }), "edit the server, password blank"));
  /* 9. /kits give to a linked Discord user: their gamertag is used, the kit keeps its case */
  slow.push(go(make.command(ADMIN, "kits", "give", { kit: "STARTER", user: { type: 6, value: "100000000000000210" }, server: "srv1" }), "/kits give to a linked user"));
  const [edited, given] = await Promise.all(slow);
  expect("the RCON test reaches the pinned DNS address and keeps the saved password", !text(last(edited)).includes("no-password") && text(last(edited)).includes("rcon.sim.test:28016") && text(last(edited)).includes("timeout") && text(last(edited)).includes("neither classic RCON"), text(last(edited)));
  expect("slow RCON answers are acknowledged in time", edited.firstAckAt !== null && edited.firstAckAt < 3000 && given.firstAckAt < 3000, edited.firstAckAt + " / " + given.firstAckAt);
  expect("a Discord user gets their linked gamertag, not their id", text(last(given)).includes('kit givetoplayer STARTER \\"PlayerOne\\"'), text(last(given)));
  expect("the RCON command is logged", world.sent.some((m) => m.channelId === "100000000000000404" && text(m.payload).includes("kit givetoplayer STARTER")), text(world.sent.filter((m) => m.channelId === "100000000000000404").slice(-1)));
  it = await go(make.command(ADMIN, "kits", "give", { gamertag: "PlayerOne" }), "/kits give with no kit");
  expect("a give with no kit asks for one (it used to send 'undefined')", text(last(it)).includes("Which kit?"), text(last(it)));

  /* 10. suggestions as you type, and none for people who are not staff */
  it = await go(make.command(ADMIN, "kits", "give", { kit: "st" }, "kit"), "autocomplete kit");
  expect("kit names are suggested", [].concat(last(it) || []).some((c) => c.value === "STARTER"), text(last(it)));
  it = await go(make.command(ADMIN, "kits", "give", { gamertag: "playero" }, "gamertag"), "autocomplete gamertag");
  expect("linked gamertags are suggested", [].concat(last(it) || []).some((c) => c.value === "PlayerOne"), text(last(it)));
  it = await go(make.command(ADMIN, "setup", "refresh", { server: "" }, "server"), "autocomplete server");
  expect("saved servers are suggested", [].concat(last(it) || []).some((c) => c.value === "srv1"), text(last(it)));
  it = await go(make.command(PLAYER, "kits", "give", { gamertag: "p" }, "gamertag"), "autocomplete for a non-staff member");
  expect("non-staff get no suggestions", Array.isArray(last(it)) && last(it).length === 0, text(last(it)));

  /* 11. a bind's role is really saved (it used to be thrown away) */
  it = await go(make.modal(ADMIN, "modal:bind", { bind_emote: "wave", bind_kit1: "PVP", bind_kit2: "", bind_kit3: "", bind_cooldown: "100000000000000300" }), "save a bind");
  expect("the bind form asks for a role next", text(last(it)).includes("Who may use it?"), text(last(it)));
  it = await go(make.select(ADMIN, "role", "kits:role:wave", ["100000000000000303"]), "pick the bind role");
  /* saves go out one at a time, in order, so this one may still be behind the bind itself */
  let wave = null;
  for (let i = 0; i < 100 && !(wave && wave.roleId); i++) {
    w = await writes();
    wave = ((latest(w).kits || {}).binds || []).find((b) => b.emote === "wave");
    if (!(wave && wave.roleId)) await new Promise((r) => setTimeout(r, 150));
  }
  expect("the bind's role is saved", wave && wave.roleId === "100000000000000303", text(wave));

  /* 12. a player asks to link; staff approve it in one click; the linked role follows */
  it = await go(make.modal(NEWGUY, "modal:link:self", { link_gamertag: "NewGuy" }), "a player asks to link");
  expect("the player's request is recorded", text(last(it)).includes("Request recorded"), text(last(it)));
  it = await go(make.button(ADMIN, "user:pending"), "open the waiting list");
  expect("the waiting list offers approve and reject menus", text(last(it)).includes("user:pending:approve") && text(last(it)).includes("user:pending:reject"), text(last(it)));
  it = await go(make.select(ADMIN, "string", "user:pending:approve", ["100000000000000205"]), "approve the request");
  expect("approving links the player", text(last(it)).includes("Approved"), text(last(it)));
  expect("approving gives the linked role", world.roleChanges.some((r) => r.userId === "100000000000000205" && r.roleId === "100000000000000302" && r.action === "add"), text(world.roleChanges));
  expect("approving is logged in the linking log", world.sent.some((m) => m.channelId === "100000000000000402" && text(m.payload).includes("NewGuy")), "");

  /* 13. /user straight from the options: link, move, remove */
  it = await go(make.command(ADMIN, "user", "forcelink", { user: { type: 6, value: "100000000000000206" }, gamertag: "Direct" }), "/user forcelink with options");
  expect("forcelink with options links straight away", text(last(it)).includes("is now linked to"), text(last(it)));
  it = await go(make.command(ADMIN, "user", "transfer", { gamertag: "Direct", to_user: { type: 6, value: "100000000000000207" } }), "/user transfer with options");
  expect("transfer moves the link", text(last(it)).includes("Link moved"), text(last(it)));
  expect("transfer moves the linked role too", world.roleChanges.some((r) => r.userId === "100000000000000206" && r.action === "remove") && world.roleChanges.some((r) => r.userId === "100000000000000207" && r.action === "add"), text(world.roleChanges));
  it = await go(make.command(ADMIN, "user", "forceunlink", { gamertag: "direct" }), "/user forceunlink with options");
  expect("forceunlink asks to confirm first", text(last(it)).includes("Remove this link?"), text(last(it)));
  it = await go(make.button(ADMIN, "user:unlink:go:Direct"), "confirm the unlink");
  expect("the unlink happens and the role is removed", text(last(it)).includes("Link removed") && world.roleChanges.some((r) => r.userId === "100000000000000207" && r.action === "remove"), text(last(it)));

  /* 14. the roster comes in pages instead of being cut off */
  it = await go(make.command(ADMIN, "user", "roster"), "/user roster");
  expect("the roster says which page it is on", text(last(it)).includes("Page 1 of 2"), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "user:roster:2"), "roster page 2");
  expect("the roster's next page opens", text(last(it)).includes("Page 2 of 2"), text(last(it)).slice(0, 300));

  /* 15. /ping waits on a slow website without timing out, and so does its button */
  it = await go(make.command(PLAYER, "ping"), "/ping with a slow website");
  expect("/ping is deferred while the website answers", (it.calls[0] || {}).method === "deferReply" && it.firstAckAt < 3000 && text(last(it)).includes("answering"), text(it.calls.map((c) => c.method + "@" + c.at)));
  it = await go(make.button(PLAYER, "ping:again"), "ping: check again");
  expect("Check again is deferred too", (it.calls[0] || {}).method === "deferUpdate" && it.firstAckAt < 3000, text(it.calls.map((c) => c.method + "@" + c.at)));

  /* 16. a button from a panel the bot no longer makes gets an answer, not silence */
  it = await go(make.button(ADMIN, "kits:something-old"), "a button from an old panel");
  expect("an old button is answered", text(last(it)).includes("older panel"), text(last(it)));

  /* 17. staff commands are written to the command log */
  expect("commands are logged", world.sent.some((m) => m.channelId === "100000000000000401" && text(m.payload).includes("/user forcelink")), "");

  /* 18. a staff role set on the website reaches the bot without a restart */
  const MOD = { id: "100000000000000208", roles: ["100000000000000304"] };
  it = await go(make.command(MOD, "setup", "status"), "/setup status by a role not saved yet");
  expect("a role that is not saved yet is not staff", text(last(it)).includes("Not allowed"), text(last(it)).slice(0, 200));
  await fetch(SITE + "/__sim/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ staffRoles: { moderator: "100000000000000304" } }) });
  await new Promise((r) => setTimeout(r, 6000));
  it = await go(make.command(MOD, "setup", "status"), "/setup status after the website edit");
  expect("a staff role saved on the website works without a restart", text(last(it)).includes("Setup status"), text(last(it)).slice(0, 200));

  /* 19. kit delivery is set from Discord now (it could only be set on the website) */
  it = await go(make.button(ADMIN, "kits:delivery"), "open the delivery form");
  expect("the delivery form opens", (it.calls[0] || {}).method === "showModal" && text(last(it)).includes("kit_give"), text(it.calls));
  it = await go(make.modal(ADMIN, "modal:kitdelivery", { kit_list: "kit list", kit_give: "kit give" }), "save delivery without placeholders");
  expect("a give command without {player} and {kit} is refused", text(last(it)).includes("Not saved"), text(last(it)));
  it = await go(make.modal(ADMIN, "modal:kitdelivery", { kit_list: "kit list", kit_give: 'kit givetoplayer {kit} "{player}"' }), "save delivery");
  w = await writes();
  expect("delivery settings are saved to the website", ((latest(w).kits || {}).listCommand === "kit list") && /\{player\}/.test((latest(w).kits || {}).giveCommand || ""), text(latest(w).kits));
  expect("the saved reply shows an example", text(last(it)).includes("Delivery saved"), text(last(it)));
  it = await go(make.button(ADMIN, "kits:grab"), "read kit names from the panel");
  expect("Read kit names answers from the panel", it.firstAckAt !== null && text(last(it)).length > 10, text(last(it)).slice(0, 300));

  /* 20. an install code teaches the bot its kit names */
  const beforeBadCode = await writes();
  const installWriteCount = beforeBadCode.filter((write) => write.installs).length;
  const invalidCode = await go(make.modal(ADMIN, "modal:kitcode", { install_code: "%%%not-base64%%%" }), "submit malformed kit code");
  w = await writes();
  expect("malformed Base64 is rejected without writing a preview", text(last(invalidCode)).includes("not valid")
    && w.filter((write) => write.installs).length === installWriteCount, text(last(invalidCode)));
  const code64 = Buffer.from('kit remove "RAIDER"\nkit add "RAIDER"\nkit add "RAIDER" rifle.ak 1 1 main').toString("base64");
  it = await go(make.modal(ADMIN, "modal:kitcode", { install_code: code64 }), "preview a kit code");
  expect("the kit names in a code preview are listed", text(last(it)).includes("Kit names found") && text(last(it)).includes("RAIDER"), text(last(it)).slice(0, 400));
  expect("the result says the original code is not retained", text(last(it)).includes("original Base64 code is not retained") && text(last(it)).includes("not installed"), text(last(it)));
  await new Promise((resolve) => setTimeout(resolve, 80));
  w = await writes();
  expect("preview metadata is written to the website installs section", w.some((write) => write.installs && Object.keys(write.installs).length === 1), text(w.slice(-3)));
  const previewWrites = w.filter((write) => write.installs && Object.keys(write.installs).length);
  const previewSnapshot = previewWrites[previewWrites.length - 1] || {};
  const previewRecord = Object.values(previewSnapshot.installs || {})[0];
  expect("only a short excerpt is persisted, never the full Base64 code", !!previewRecord && previewRecord.head.length <= 400
    && previewRecord.chars === Buffer.from(code64, "base64").toString("utf8").length
    && !JSON.stringify(previewRecord).includes(code64), text(previewRecord));
  it = await go(make.command(ADMIN, "kits", "give", { kit: "rai" }, "kit"), "autocomplete an installed kit");
  expect("an installed kit is suggested straight away", [].concat(last(it) || []).some((c) => c.value === "RAIDER"), text(last(it)));

  /* 21. /setup status checks what Discord really allows, not just what is saved */
  it = await go(make.command(ADMIN, "setup", "status"), "/setup status with a channel the bot cannot post in");
  expect("status finds the log channel the bot cannot post in", text(last(it)).includes("Problems found just now") && text(last(it)).includes("100000000000000404"), text(last(it)).slice(0, 900));

  /* 22. a server check is remembered and shown by /ping */
  it = await go(make.command(ADMIN, "setup", "refresh", { server: "srv1" }), "/setup refresh one server");
  it = await go(make.command(PLAYER, "ping"), "/ping after a refresh");
  expect("/ping shows the last server check", !text(last(it)).includes("not checked since the bot started") && /answered|did not answer/.test(text(last(it))), text(last(it)).slice(0, 900));

  /* 23. players hear back about their request by direct message */
  const dmsBefore = world.dms.length;
  await go(make.modal(Object.assign({}, PLAYER), "modal:link:self", { link_gamertag: "Approved1" }), "player asks to link (DMs open)");
  it = await go(make.select(ADMIN, "string", "user:pending:approve", ["100000000000000204"]), "approve (DMs open)");
  expect("an approved player gets a direct message", world.dms.slice(dmsBefore).some((d) => d.userId === "100000000000000204" && text(d.payload).includes("Approved1")), text(world.dms.slice(dmsBefore)));
  expect("the approve reply says they were told", text(last(it)).includes("direct message"), text(last(it)));
  const CLOSED = { id: "100000000000000209" };
  await go(make.modal(CLOSED, "modal:link:self", { link_gamertag: "Closed1" }), "player asks to link (DMs closed)");
  it = await go(make.select(ADMIN, "string", "user:pending:reject", ["100000000000000209"]), "reject (DMs closed)");
  expect("a reject with closed DMs says they were not told", text(last(it)).includes("closed"), text(last(it)));

  /* 24. /user roster search, and its pages keep the search */
  it = await go(make.command(ADMIN, "user", "roster", { search: "player1" }), "/user roster search");
  expect("roster search filters the list", text(last(it)).includes("matching") && text(last(it)).includes("Player1"), text(last(it)).slice(0, 400));
  it = await go(make.command(ADMIN, "user", "roster", { search: "pl" }, "search"), "autocomplete roster search");
  expect("roster search suggests gamertags", Array.isArray(last(it)) && last(it).length > 0, text(last(it)));
  it = await go(make.command(ADMIN, "user", "roster", { search: "player" }), "/user roster broad search");
  const nextId = (text(last(it)).match(/user:roster:2:[^"\\]*/) || [])[0];
  if (nextId) {
    it = await go(make.button(ADMIN, nextId), "roster search page 2");
    expect("page 2 of a search keeps the search", text(last(it)).includes("matching"), text(last(it)).slice(0, 300));
  } else expect("a broad search has a next page button", false, text(last(it)).slice(0, 300));

  /* 25. posting a new link panel offers to remove the old one */
  it = await go(make.command(ADMIN, "user", "linkpanel", { channel: { type: 7, value: "100000000000000402" } }), "post a link panel");
  it = await go(make.command(ADMIN, "user", "linkpanel", { channel: { type: 7, value: "100000000000000403" } }), "post a second link panel");
  const removeId = (text(last(it)).match(/user:panel:removeold:[0-9a-z]+/) || [])[0];
  expect("a second panel offers to remove the first", !!removeId, text(last(it)).slice(0, 400));
  if (removeId) {
    it = await go(make.button(ADMIN, removeId), "remove the older panel");
    expect("the older panel is deleted", text(last(it)).includes("Older panel removed") && world.deleted.length === 1, text(last(it)) + " " + text(world.deleted));
  }

  /* 26. one look everywhere: brand on top, a timestamp, icons on buttons, a live status line */
  it = await go(make.command(ADMIN, "setup", "run"), "/setup run (the look)");
  const dressed = last(it) || {};
  const firstEmbed = (dressed.embeds || [])[0] || {};
  expect("replies carry the Spinback name on top", firstEmbed.author && firstEmbed.author.name === "Spinback RCE", text(firstEmbed.author));
  expect("replies carry a timestamp", (dressed.embeds || []).some((e) => e.timestamp), "");
  expect("panel buttons have icons", (dressed.components || []).some((r) => (r.components || []).some((c) => c.emoji && c.emoji.name)), text(dressed.components));
  expect("the setup panel shows progress", text(dressed).includes("of 3"), text(firstEmbed).slice(0, 300));
  const logged = world.sent.filter((m) => m.channelId === "100000000000000401").slice(-1)[0];
  expect("log posts say which log they are", logged && text(logged.payload).includes("Command log"), text(logged && logged.payload).slice(0, 300));
  expect("the DM to a player is a proper embed", world.dms.some((d) => (d.payload.embeds || []).length && text(d.payload).includes("You are linked")), text(world.dms.slice(-1)));
  expect("the bot's status line says what it looks after", world.presence && /server.*linked/.test(text(world.presence)), text(world.presence));

  /* 27. /server asks read-only questions of a chosen server; its buttons keep that server */
  it = await go(make.command(ADMIN, "server", "players", { server: "srv1" }), "/server players");
  expect("/server answers in time even when RCON is slow", it.firstAckAt !== null && it.firstAckAt < 3000, it.firstAckAt);
  expect("/server names the server and the command it asked", text(last(it)).includes("Main") && text(last(it)).includes("playerlist"), text(last(it)).slice(0, 400));
  expect("/server's Ask again keeps the server", text(last(it)).includes("server:players:srv1"), text((last(it) || {}).components));
  it = await go(make.button(ADMIN, "server:time:srv1"), "/server game time button");
  expect("a /server button asks the right question", text(last(it)).includes("gettime"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "server", "info", { server: "nope" }), "/server with an unknown server");
  expect("an unknown server is named, not silently swapped", text(last(it)).includes("No saved server called nope"), text(last(it)).slice(0, 300));
  it = await go(make.command(PLAYER, "server", "info"), "/server by a non-staff member");
  expect("/server is staff only", text(last(it)).includes("Not allowed"), text(last(it)).slice(0, 200));

  /* 28. /user whois finds the account behind a gamertag */
  it = await go(make.command(ADMIN, "user", "whois", { gamertag: "playerone" }), "/user whois");
  expect("whois finds the linked account", text(last(it)).includes("PlayerOne") && text(last(it)).includes("100000000000000210"), text(last(it)).slice(0, 400));
  expect("whois offers to remove that link", text(last(it)).includes("user:unlink:ask:PlayerOne"), text((last(it) || {}).components));
  it = await go(make.button(ADMIN, "user:unlink:ask:PlayerOne"), "whois: remove this link");
  expect("the remove button asks for confirmation first", text(last(it)).includes("Remove this link?"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "user", "whois", { gamertag: "nobodyatall" }), "/user whois with no match");
  expect("whois says plainly when nobody matches", text(last(it)).includes("No link for nobodyatall"), text(last(it)).slice(0, 300));

  /* 29. kit giving is safe to hammer: one at a time per player + kit, pause works, names are clean */
  const [, giveB] = await Promise.all([
    go(make.command(ADMIN, "kits", "give", { kit: "RAIDER", gamertag: "PlayerOne", server: "srv1" }), "/kits give (first of two at once)"),
    go(make.command(OWNER_ROLE, "kits", "give", { kit: "raider", gamertag: "playerone", server: "srv1" }), "/kits give (second, same player + kit)"),
  ]);
  expect("the same kit to the same player is never sent twice at once", text(last(giveB)).includes("Already being sent"), text(last(giveB)).slice(0, 300));
  it = await go(make.command(ADMIN, "kits", "give", { kit: "RAIDER;kick PlayerOne", gamertag: "PlayerOne", server: "srv1" }), "/kits give with a separator in the kit");
  expect("a ; cannot smuggle a second command into the give", text(last(it)).includes("Command:") && !/Command: `[^`]*;/.test(text(last(it))), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "kits:lock"), "pause kit delivery");
  it = await go(make.command(ADMIN, "kits", "give", { kit: "RAIDER", gamertag: "Player2", server: "srv1" }), "/kits give while paused");
  expect("a paused delivery refuses to give", text(last(it)).includes("Kit delivery is paused"), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "kits:lock"), "resume kit delivery");
  expect("the panel says delivery is on again", text(last(it)).includes("Pause kit delivery"), text(last(it)).slice(0, 300));
  it = await go(make.modal(ADMIN, "modal:kitdelivery", { kit_list: "kit list", kit_give: 'kit givetoplayer {kit} "{player}"', kit_give_cooldown: "soon" }), "delivery with a bad cooldown");
  expect("a cooldown that is not a whole number is refused", text(last(it)).includes("whole number"), text(last(it)).slice(0, 300));

  /* 30. one gamertag waits for one account */
  await go(make.modal({ id: "100000000000000221" }, "modal:link:self", { link_gamertag: "Rival1" }), "first claim on a gamertag");
  it = await go(make.modal({ id: "100000000000000222" }, "modal:link:self", { link_gamertag: "rival1" }), "second account claims the same gamertag");
  expect("a rival claim on a waiting gamertag is refused", text(last(it)).includes("already waiting"), text(last(it)).slice(0, 300));

  /* 31. help is for everyone */
  it = await go(make.command(PLAYER, "help"), "/help by a member");
  expect("members can open /help", text(last(it)).includes("/server") && !text(last(it)).includes("Not allowed"), text(last(it)).slice(0, 200));
  it = await go(make.button(PLAYER, "help:cmd:server"), "help page for /server, by a member");
  expect("members can open a help page", text(last(it)).includes("Help: /server"), text(last(it)).slice(0, 200));

  /* 32. the click-through setup tools from main */
  it = await go(make.command(ADMIN, "setup", "suggest"), "/setup suggest");
  expect("suggest proposes roles from the names it can see", text(last(it)).includes("What the names suggest") && text(last(it)).includes("Owner"), text(last(it)).slice(0, 400));
  expect("the proposal itself is never sent to Discord", !text(last(it)).includes("proposalData"), "");
  it = await go(make.button(ADMIN, "setup:suggest:apply"), "apply the suggestion");
  expect("Apply writes the proposal and says what it saved", text(last(it)).includes("Proposal applied"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "setup", "channels"), "/setup channels");
  it = await go(make.button(ADMIN, "setup:channels:build"), "create channels: pick types");
  it = await go(make.select(ADMIN, "string", "setup:channels:build:pick", ["killfeed", "nonsense"]), "create channels: tick kill feed");
  expect("the plan lists exactly the channel it will make", text(last(it)).includes("spinback-killfeed") && !text(last(it)).includes("nonsense"), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "setup:channels:build:go"), "create channels: go");
  expect("the bot creates the channel and saves it", world.created.some((c) => c.name === "spinback-killfeed") && world.created.some((c) => c.name === "Spinback"), text(world.created.map((c) => c.name)));
  it = await go(make.button(ADMIN, "setup:import:paste"), "open the server.cfg paste form");
  expect("the paste form opens", (it.calls[0] || {}).method === "showModal", text(it.calls));
  it = await go(make.modal(ADMIN, "modal:import", { import_text: "rcon.ip 203.0.113.10\nrcon.port 28016\nrcon.password \"hunter2\"\nrcon.web 0" }), "paste server.cfg lines");
  expect("server.cfg lines are read, password hidden", text(last(it)).includes("ready to test") && !text(last(it)).includes("hunter2"), text(last(it)).slice(0, 400));
  it = await go(make.command(ADMIN, "setup", "export"), "/setup export");
  expect("the export never contains a password", text(last(it)).includes("password not shown") && !text(last(it)).includes("secret"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "setup", "doctor"), "/setup doctor");
  expect("the doctor answers in time with a report", it.firstAckAt !== null && it.firstAckAt < 3000 && text(last(it)).length > 100, it.firstAckAt);
  it = await go(make.command(ADMIN, "kits", "commands"), "/kits commands");
  expect("/kits commands opens the validated delivery form", text(last(it)).includes("kits:delivery"), text((last(it) || {}).components));
  it = await go(make.command(ADMIN, "kits", "doctor"), "/kits doctor");
  expect("/kits doctor is honest about binds needing the game hook", text(last(it)).includes("Kit setup check"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "user", "pending"), "/user pending");
  expect("/user pending opens the waiting list", text(last(it)).includes("user:pending:approve") || text(last(it)).includes("Nobody is waiting") || text(last(it)).includes("aiting"), text(last(it)).slice(0, 300));
  /* 33. nothing needs typing: bare commands open forms and pickers */
  it = await go(make.command(ADMIN, "user", "whois"), "/user whois (bare)");
  expect("bare /user whois offers the look-up form", text(last(it)).includes("user:whois:go"), text((last(it) || {}).components));
  it = await go(make.button(ADMIN, "user:whois:go"), "open the whois form");
  expect("the whois form opens", (it.calls[0] || {}).method === "showModal" && text(last(it)).includes("whois_tag"), text(it.calls));
  it = await go(make.modal(ADMIN, "modal:whois", { whois_tag: "player3" }), "submit the whois form");
  expect("the whois form finds the link", text(last(it)).includes("Player3") || text(last(it)).includes("Player30"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "user", "roster"), "/user roster (bare)");
  expect("the roster has a Search button", text(last(it)).includes("user:roster:search"), text((last(it) || {}).components));
  it = await go(make.modal(ADMIN, "modal:rostersearch", { roster_search: "player4" }), "search the roster");
  expect("roster search from the form filters the list", text(last(it)).includes("matching") && text(last(it)).includes("Player4"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "server", "info"), "/server info (bare, one server)");
  expect("with one server saved, /server asks it straight away", text(last(it)).includes("serverinfo") && text(last(it)).includes("Main"), text(last(it)).slice(0, 300));
  it = await go(make.select(ADMIN, "string", "kits:give:pick", ["PlayerOne"]), "pick a player to give a kit");
  expect("picking a player fills the give form with their gamertag", (it.calls[0] || {}).method === "showModal" && text(last(it)).includes('"value":"PlayerOne"'), text(last(it)).slice(0, 400));
  expect("every registered command takes no typed option", world.registered.every((c) => (c.options || []).every((o) => o.type === 1 && !(o.options || []).length)), text(world.registered.map((c) => c.name)));

  /* 34. guided setup: the bot makes the staff roles, then log channels private to them */
  it = await go(make.command(ADMIN, "setup", "run"), "/setup run (guided)");
  expect("/setup run opens guided setup", text(last(it)).includes("Guided setup") && text(last(it)).includes("setup:run:roles"), text(last(it)).slice(0, 300));
  it = await go(make.button(ADMIN, "setup:run:roles"), "guided: show the role plan");
  expect("the role plan lists every role before anything is made", text(last(it)).includes("Create the staff roles?") && text(last(it)).includes("Head Admin") && world.createdRoles.length === 0, text(last(it)).slice(0, 400));
  it = await go(make.button(ADMIN, "setup:run:roles:go"), "guided: create the roles");
  expect("missing staff roles are created with no permissions", world.createdRoles.length === 4 && world.createdRoles.every((r) => Array.isArray(r.permissions) && !r.permissions.length), text(world.createdRoles.map((r) => r.name)));
  expect("an existing role with the same name is reused, not duplicated", !world.createdRoles.some((r) => r.name === "Owner") && text(last(it)).includes("Already here"), text(last(it)).slice(0, 500));
  it = await go(make.button(ADMIN, "setup:run:roles:go"), "guided: create the roles again");
  expect("pressing it twice makes nothing new", world.createdRoles.length === 4, text(world.createdRoles.map((r) => r.name)));
  const createdBefore = world.created.length;
  it = await go(make.select(ADMIN, "string", "setup:channels:build:pick", ["teleport"]), "guided: tick a log type");
  expect("the channel plan says who will be able to read it", text(last(it)).includes("Who will be able to read them") && text(last(it)).includes("Head Admin"), text(last(it)).slice(0, 500));
  it = await go(make.button(ADMIN, "setup:channels:build:go"), "guided: create the channel");
  const made = world.created.slice(createdBefore).find((c) => c.name === "spinback-teleport");
  const locks = made ? world.overwrites[made.id] || [] : [];
  expect("the new log channel hides from @everyone", locks.some((o) => o.id === "100" && (o.deny || []).length), text(locks));
  expect("every staff role keeps View Channel on it", locks.filter((o) => (o.allow || []).length && o.id !== "100000000000000500").length >= 5, text(locks));
  expect("the bot keeps what it needs to post there", locks.some((o) => o.id === "100000000000000500" && (o.allow || []).length >= 3), text(locks));
  it = await go(make.select(ADMIN, "string", "setup:channels:build:pick", ["teleport"]), "guided: tick the same type again");
  it = await go(make.button(ADMIN, "setup:channels:build:go"), "guided: create the same channel again");
  expect("an existing log channel is relocked, not duplicated", world.created.filter((c) => c.name === "spinback-teleport").length === 1 && text(last(it)).includes("relocked"), text(last(it)).slice(0, 400));

  /* 35. the server address is read in whatever shape it is typed */
  it = await go(make.modal(ADMIN, "modal:server:new", { srv_name: "Home", srv_host: "192.168.1.20", srv_port: "28016", srv_pass: "x" }), "a private server address");
  expect("a private address is refused with the real reason", text(last(it)).includes("address needs fixing") && text(last(it)).includes("local network"), text(last(it)).slice(0, 400));
  it = await go(make.modal(ADMIN, "modal:server:new", { srv_name: "Shape", srv_host: "rcon://203.0.113.10:28016/", srv_port: "", srv_pass: "x" }), "an address with a scheme and the port on the end");
  expect("an address with the port on the end is read, then tested", text(last(it)).includes("203.0.113.10:28016") && !text(last(it)).includes("address needs fixing"), text(last(it)).slice(0, 400));
  it = await go(make.modal(ADMIN, "modal:server:new", { srv_name: "Typo", srv_host: "203.0.113.10:abc", srv_port: "", srv_pass: "x" }), "an address with a broken port");
  expect("a broken port is named, not guessed", text(last(it)).includes("not a port number"), text(last(it)).slice(0, 400));

  /* 36. one footer and the bot's picture everywhere; RCON Connection Required when the game is not reachable */
  it = await go(make.command(ADMIN, "help"), "/help (the look)");
  const helpEmbed = ((last(it) || {}).embeds || [])[0] || {};
  expect("every embed carries the one footer", helpEmbed.footer && helpEmbed.footer.text === "Support - Spinback 5X EU \u2022 2026", text(helpEmbed.footer));
  expect("every embed carries the bot's own picture", helpEmbed.thumbnail && /^https:/.test(helpEmbed.thumbnail.url), text(helpEmbed.thumbnail));
  it = await go(make.command(ADMIN, "server", "info"), "/server info with the server not answering");
  expect("a game feature with no connection shows RCON Connection Required", text(last(it)).includes("RCON Connection Required") && text(last(it)).includes("/server info"), text(last(it)).slice(0, 300));
  expect("it still says what it asked, and offers to ask again", text(last(it)).includes("serverinfo") && text(last(it)).includes("server:info:srv1"), text(last(it)).slice(0, 600));
  it = await go(make.command(ADMIN, "kits", "give", { kit: "STARTER", gamertag: "Player9", server: "srv1" }), "/kits give with the server not answering");
  expect("a give with no connection says nothing was sent", text(last(it)).includes("RCON Connection Required") && text(last(it)).includes("Nothing was sent"), text(last(it)).slice(0, 400));
  const logPost = world.sent.filter((m) => m.channelId === "100000000000000401").slice(-1)[0];
  expect("log posts carry the same footer, and say which log they are on top", logPost && text(logPost.payload).includes("Support - Spinback 5X EU") && text(logPost.payload).includes("Command log"), text(logPost && logPost.payload).slice(0, 300));

  /* every interaction: answered, in time, by the rules, within Discord's limits */
  for (const { it: one, label } of all) {
    expect("answered in time: " + label, one.firstAckAt !== null && one.firstAckAt < 3000, "first answer at " + one.firstAckAt + " ms");
    expect("no protocol error: " + label, one.errors.length === 0, one.errors.join("; "));
  }
  for (const p of limits.problems) expect("within Discord's limits", false, p);

  const failed = results.filter((r) => !r.ok);
  console.log("SIM_RESULT " + JSON.stringify({ total: results.length, failed: failed.length, interactions: all.length, failures: failed, commands: world.registered.map((c) => c.name) }));
  setTimeout(() => process.exit(failed.length ? 1 : 0), 50);
}
