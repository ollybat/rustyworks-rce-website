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
function text(value) { return JSON.stringify(value || null); }
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
  it = await go(make.command(PLAYER, "help"), "/help by a non-staff member");
  expect("/help is available to ordinary server members", text(last(it)).includes("/kits") && text(last(it)).includes("/user"), text(last(it)));
  it = await go(make.button(PLAYER, "help:cmd:user"), "help: /user page by a non-staff member");
  expect("ordinary members can open the detailed help pages too", text(last(it)).includes("Help: /user"), text(last(it)));

  /* 3. before any staff role exists, only Administrator / Manage Server / owner may configure */
  it = await go(make.command(LINKED_ONLY, "setup", "run"), "/setup run by a linked player, before setup");
  expect("a non-admin is refused before setup", text(last(it)).includes("Not allowed"), text(last(it)));

  /* 4. roles from Discord's own role menu, saved through the website */
  it = await go(make.command(ADMIN, "setup", "run"), "/setup run");
  expect("/setup run shows the panel", text(last(it)).includes("Spinback RCE setup"), text(last(it)));
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
  slow.push(go(make.modal(ADMIN, "modal:server:srv1", { srv_name: "Main", srv_host: "203.0.113.10", srv_port: "28016", srv_pass: "" }), "edit the server, password blank"));
  /* 9. /kits give to a linked Discord user: their gamertag is used, the kit keeps its case */
  slow.push(go(make.command(ADMIN, "kits", "give", { kit: "STARTER", user: { type: 6, value: "100000000000000210" }, server: "srv1" }), "/kits give to a linked user"));
  const [edited, given] = await Promise.all(slow);
  expect("a blank password is not sent as blank", !text(last(edited)).includes("no-password") && text(last(edited)).includes("203.0.113.10:28016"), text(last(edited)));
  expect("slow RCON answers are acknowledged in time", edited.firstAckAt !== null && edited.firstAckAt < 3000 && given.firstAckAt < 3000, edited.firstAckAt + " / " + given.firstAckAt);
  expect("a Discord user gets their linked gamertag, not their id", text(last(given)).includes('kit givetoplayer STARTER \\"PlayerOne\\"'), text(last(given)));
  expect("the RCON command is logged", world.sent.some((m) => m.channelId === "100000000000000404" && text(m.payload).includes("kit givetoplayer STARTER")), text(world.sent.filter((m) => m.channelId === "100000000000000404").slice(-1)));
  const rconLogsBeforeRetry = world.sent.filter((m) => m.channelId === "100000000000000404").length;
  it = await go(make.command(ADMIN, "kits", "give", { kit: "STARTER", gamertag: "PlayerOne", server: "srv1" }), "retry after a refused RCON give");
  expect("a failed RCON command does not start a success cooldown", !text(last(it)).includes("Giveaway cooldown"), text(last(it)));
  expect("the retry reaches RCON after the previous attempt failed", world.sent.filter((m) => m.channelId === "100000000000000404").length === rconLogsBeforeRetry + 1, text(world.sent.filter((m) => m.channelId === "100000000000000404").slice(-2)));
  it = await go(make.button(ADMIN, "kits:lock"), "pause manual kit delivery");
  it = await go(make.command(ADMIN, "kits", "give", { kit: "OTHER", gamertag: "PlayerOne", server: "srv1" }), "give while delivery is paused");
  expect("the kit delivery lock is enforced", text(last(it)).includes("Kit delivery is paused"), text(last(it)));
  it = await go(make.button(ADMIN, "kits:lock"), "resume manual kit delivery");
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
  w = await writes();
  const wave = ((latest(w).kits || {}).binds || []).find((b) => b.emote === "wave");
  expect("the bind's role is saved", wave && wave.roleId === "100000000000000303", text(wave));

  /* 12. a player asks to link; staff approve it in one click; the linked role follows */
  it = await go(make.modal(NEWGUY, "modal:link:self", { link_gamertag: "NewGuy" }), "a player asks to link");
  expect("the player's request is recorded", text(last(it)).includes("Request recorded"), text(last(it)));
  it = await go(make.modal(PLAYER, "modal:link:self", { link_gamertag: "NewGuy" }), "another player requests a pending gamertag");
  expect("the same gamertag cannot be queued by two accounts", text(last(it)).includes("already waiting"), text(last(it)));
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
  it = await go(make.modal(ADMIN, "modal:kitdelivery", { kit_list: "kit list", kit_give: 'kit givetoplayer {kit} "{player}"', kit_give_cooldown: "86401" }), "refuse an excessive giveaway cooldown");
  expect("an excessive giveaway cooldown is rejected", text(last(it)).includes("Not saved") && text(last(it)).includes("86400"), text(last(it)));
  it = await go(make.modal(ADMIN, "modal:kitdelivery", { kit_list: "kit list", kit_give: 'kit givetoplayer {kit} "{player}"' }), "save delivery");
  w = await writes();
  expect("delivery settings and cooldown are saved to the website", ((latest(w).kits || {}).listCommand === "kit list") && String((latest(w).kits || {}).giveCommand || "").includes("{player}") && latest(w).kits.giveCooldownSeconds === 30, text(latest(w).kits));
  expect("the saved reply shows an example", text(last(it)).includes("Delivery saved"), text(last(it)));
  it = await go(make.button(ADMIN, "kits:grab"), "read kit names from the panel");
  expect("Read kit names answers from the panel", it.firstAckAt !== null && text(last(it)).length > 10, text(last(it)).slice(0, 300));

  /* 20. an install code teaches the bot its kit names */
  const code64 = Buffer.from('kit remove "RAIDER"\nkit add "RAIDER"\nkit add "RAIDER" rifle.ak 1 1 main').toString("base64");
  it = await go(make.modal(ADMIN, "modal:kitcode", { install_code: code64 }), "install a kit code");
  expect("the kit names in an install code are listed", text(last(it)).includes("Kit names found") && text(last(it)).includes("RAIDER"), text(last(it)).slice(0, 400));
  expect("the bot is honest that a code preview is not a server install", text(last(it)).includes("not installed"), text(last(it)).slice(0, 400));
  await new Promise((resolve) => setTimeout(resolve, 50));
  w = await writes();
  expect("kit-code metadata persists inside the kits settings", Object.keys((latest(w).kits || {}).installCodes || {}).length > 0, text(latest(w).kits));
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
