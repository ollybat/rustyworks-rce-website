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
