/* Checks the bot's slash commands without Discord or the network.

     node scripts/check-commands.mjs

   1. Every command definition in bot/commands.mjs is checked against Discord's rules (names,
      lengths, option order, choices). One invalid definition makes Discord refuse the whole
      list, and then the bot has no commands at all.
   2. Every command and subcommand is run with a pretend bot - once before setup and once with
      setup finished - and every reply, panel and modal it builds is checked against Discord's
      size limits. A reply over a limit is refused by Discord and the user sees "interaction
      failed". Nothing is sent anywhere; RCON and the website are answered by stand-ins.

   Exits non-zero if anything would be refused. */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createChecker } from "./lib/discord-limits.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(join(repo, "bot", "commands.mjs")).href);
const { COMMANDS, dispatchCommand } = mod;

const problems = [];
let checked = 0;
const NAME = /^[-_\p{L}\p{N}]{1,32}$/u;

/* ---- 1. command definitions ---- */
function checkOptions(path, options, depth) {
  if (!options) return;
  if (!Array.isArray(options)) { problems.push(path + ": options is not a list"); return; }
  if (options.length > 25) problems.push(path + ": more than 25 options");
  const subs = options.filter((o) => o.type === 1 || o.type === 2);
  if (subs.length && subs.length !== options.length) problems.push(path + ": subcommands mixed with plain options");
  let seenOptional = false;
  const names = new Set();
  for (const o of options) {
    const p = path + " " + o.name;
    checked += 1;
    if (!NAME.test(o.name || "") || o.name !== o.name.toLowerCase()) problems.push(p + ": option name must be 1-32 lowercase letters, numbers, - or _");
    if (names.has(o.name)) problems.push(p + ": duplicate option name");
    names.add(o.name);
    if (!o.description || o.description.length > 100) problems.push(p + ": description must be 1-100 characters (is " + (o.description || "").length + ")");
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(o.type)) problems.push(p + ": unknown option type " + o.type);
    if (o.type === 1 || o.type === 2) {
      if (depth >= 2 && o.type === 2) problems.push(p + ": groups cannot nest");
      checkOptions(p, o.options, depth + 1);
      continue;
    }
    if (o.required) { if (seenOptional) problems.push(p + ": required option after an optional one"); }
    else seenOptional = true;
    if (o.autocomplete) {
      if (o.choices) problems.push(p + ": an option cannot have both choices and autocomplete");
      if (![3, 4, 10].includes(o.type)) problems.push(p + ": autocomplete only works on string and number options");
    }
    if (o.choices) {
      if (o.choices.length > 25) problems.push(p + ": more than 25 choices");
      for (const c of o.choices) {
        if (!c.name || c.name.length > 100) problems.push(p + ": choice name must be 1-100 characters");
        if (typeof c.value === "string" && c.value.length > 100) problems.push(p + ": choice value over 100 characters");
      }
    }
  }
}
if (!Array.isArray(COMMANDS) || !COMMANDS.length) problems.push("COMMANDS is empty");
if (COMMANDS.length > 100) problems.push("more than 100 guild commands");
const topNames = new Set();
for (const cmd of COMMANDS) {
  checked += 1;
  const p = "/" + cmd.name;
  if (!NAME.test(cmd.name || "") || cmd.name !== cmd.name.toLowerCase()) problems.push(p + ": command name must be 1-32 lowercase characters");
  if (topNames.has(cmd.name)) problems.push(p + ": registered twice");
  topNames.add(cmd.name);
  if (!cmd.description || cmd.description.length > 100) problems.push(p + ": description must be 1-100 characters (is " + (cmd.description || "").length + ")");
  checkOptions(p, cmd.options, 1);
}

/* ---- 2. replies, panels and modals ---- */
const limits = createChecker();
function checkPayload(where, payload) {
  limits.checkPayload(where, payload);
  /* and again the way it really leaves the bot: dressed with the brand, marks and icons */
  if (payload && !payload.custom_id && !Array.isArray(payload)) limits.checkPayload(where + " (dressed)", mod.dress(payload, { siteUrl: "https://example.com" }));
}
function makeCtx(configured, big) {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const fakeCooldowns = new Map();
  const activeGives = new Set();
  const rconCalls = [];
  const settings = {
    staffRoles: configured ? { owner: "111111111111111111", admin: "222222222222222222" } : {},
    logChannels: configured ? { server: "333333333333333333", killfeed: "333333333333333334" } : {},
    servers: configured ? many(big ? 3 : 1, (i) => ({ id: "srv" + i, name: "Server " + i, host: "203.0.113." + (5 + i), port: 28016, password: "x" })) : [],
    kits: {
      binds: configured ? many(big ? 30 : 2, (i) => ({ emote: "emote_" + i, kits: ["KIT_" + i, "STARTER"], cooldown: 300, roleId: i % 2 ? "222222222222222222" : null })) : [],
      locked: false, authSpawn: configured ? { VIP: "VIP_KIT" } : {},
      giveCommand: configured ? 'kit givetoplayer {kit} "{player}"' : "", listCommand: "",
      giveCooldownSeconds: 30, installCodes: {}, known: configured ? ["STARTER", "PVP", "KIT_1"] : [],
    },
    installs: {},
    links: configured ? many(big ? 40 : 2, (i) => ({ userId: "4000000000000000" + String(i).padStart(2, "0"), gamertag: "Player" + i, by: "111111111111111111", at: Date.now() })) : [],
    pending: configured ? many(big ? 30 : 1, (i) => ({ userId: "5000000000000000" + String(i).padStart(2, "0"), gamertag: "Waiting" + i, at: Date.now() })) : [],
    linkPanel: null,
  };
  return {
    siteUrl: "http://127.0.0.1:9", settings,
    guildInfo: { id: "1", name: "Test guild", ownerId: "111111111111111111", memberCount: 120, icon: null,
      roles: many(big ? 60 : 3, (i) => ({ id: "6000000000000000" + String(i).padStart(2, "0"), name: "Role " + i, position: i })) },
    gateway: "online", ping: () => 42, uptime: () => 93784, commandCount: () => COMMANDS.length, storeTokenSet: () => true,
    servers: () => settings.servers, kits: () => settings.kits, links: () => settings.links,
    pendingLinks: () => settings.pending, linkPanel: () => settings.linkPanel,
    saveServer: async () => ({ ok: true, detail: "" }), installKit: () => 1,
    addLink: () => ({ ok: true, userId: "400000000000000000", gamertag: "Player0" }), removeLink: () => ({ ok: true }),
    moveLink: () => ({ ok: true, userId: "400000000000000001", gamertag: "Player0" }), requestLink: () => ({ ok: true }),
    setAuthSpawn: () => {},
    setDelivery: async (delivery) => { Object.assign(settings.kits, delivery); return { ok: true }; },
    setKnownKits: (names) => { settings.kits.known = names; return names.length; },
    clearCooldowns: () => 2, cooldownCount: () => (big ? 50 : 1),
    cooldownList: () => many(big ? 50 : 1, (i) => "Player" + i + " -> KIT_" + i + " (120s left)"),
    reserveKitGive: (player, kit, seconds) => {
      const key = String(player).trim().toLowerCase() + "\u0000" + String(kit).trim().toLowerCase();
      const now = Date.now();
      const until = Number(fakeCooldowns.get(key) || 0);
      if (until > now) return { ok: false, key, remainingSeconds: Math.ceil((until - now) / 1000), inProgress: false };
      if (activeGives.has(key)) return { ok: false, key, remainingSeconds: 1, inProgress: true };
      activeGives.add(key);
      return { ok: true, key, cooldownSeconds: Number(seconds) || 0 };
    },
    finishKitGive: (reservation, succeeded) => {
      if (!reservation || !reservation.key) return;
      activeGives.delete(reservation.key);
      if (succeeded && reservation.cooldownSeconds > 0) fakeCooldowns.set(reservation.key, Date.now() + reservation.cooldownSeconds * 1000);
    },
    rconTest: async () => ({ ok: true, authenticated: true, command: "serverinfo", answer: "hostname: Test\\nplayers: 3", ms: 40 }),
    rconRun: async (options) => {
      rconCalls.push(options);
      return { ok: true, authenticated: true, command: options.command, answer: "Command accepted", ms: 40 };
    },
    actor: { id: "111111111111111111", tag: "staff#0001" },
    rconCalls,
    setKnownKits: (names) => { settings.kits.known = names; },
    linkPlayer: async (userId, gamertag) => ({ ok: true, userId, gamertag, roleNote: " The linked role was given." }),
    moveLinkFull: async (gamertag, toUser, toTag) => ({ ok: true, userId: toUser || "400000000000000000", gamertag: toTag || gamertag, roleNote: "" }),
  };
}

const samples = { kit: "STARTER", gamertag: "Player0", user: "400000000000000000", scope: "user", target: "Player0", group: "VIP", code: Buffer.from('kit add "STARTER" rifle.ak 1 1 main').toString("base64"), channel: "333333333333333333", server: "Server 0" };
const runs = [];
for (const cmd of COMMANDS) {
  const subs = (cmd.options || []).filter((o) => o.type === 1);
  if (!subs.length) { runs.push([cmd.name, undefined, {}]); continue; }
  for (const sub of subs) {
    runs.push([cmd.name, sub.name, {}]);
    const filled = {};
    for (const o of sub.options || []) filled[o.name] = o.choices ? o.choices[0].value : samples[o.name] || "x";
    if (Object.keys(filled).length) runs.push([cmd.name, sub.name, filled]);
  }
}
for (const [label, configured, big] of [["before setup", false, false], ["after setup", true, false], ["after setup, lots of data", true, true]]) {
  for (const [name, sub, opts] of runs) {
    const where = "/" + name + (sub ? " " + sub : "") + (Object.keys(opts).length ? " (with options)" : "") + " [" + label + "]";
    try {
      const payload = await Promise.resolve(dispatchCommand(makeCtx(configured, big), name, sub, Object.assign({ __sub: sub }, opts)));
      checkPayload(where, payload);
    } catch (error) {
      problems.push(where + ": threw " + String((error && error.stack) || error).split("\n").slice(0, 2).join(" | "));
    }
  }
}

/* every exported builder that takes only the bot context (panels, pickers, modals) */
for (const [name, fn] of Object.entries(mod)) {
  if (typeof fn !== "function" || name === "dispatchCommand" || /^(format|option|custom|modalFields|setupState|staffRole|linkRecords)/.test(name)) continue;
  /* only builders whose one parameter is the bot context; the rest take a gamertag or an id */
  const params = (/^[^(]*\(([^)]*)\)/.exec(fn.toString()) || [])[1] || "";
  if (params.trim() !== "ctx") continue;
  for (const [label, configured, big] of [["after setup", true, false], ["lots of data", true, true]]) {
    try {
      const out = await Promise.resolve(fn(makeCtx(configured, big)));
      if (out && typeof out === "object" && (out.embeds || out.components || out.content || out.custom_id)) checkPayload(name + "() [" + label + "]", out);
    } catch (error) {
      problems.push(name + "() [" + label + "]: threw " + String((error && error.message) || error));
    }
  }
}

/* builders that take more than the bot context */
for (const [label, configured, big] of [["after setup", true, false], ["lots of data", true, true]]) {
  const ctx = makeCtx(configured, big);
  const extra = [
    ["helpHome(ctx)", () => mod.helpHome(ctx)],
    ...["ping", "setup", "kits", "user", "nope"].map((n) => ["helpDetail(" + n + ")", () => mod.helpDetail(n, ctx)]),
    ["rolesPanel(1)", () => mod.rolesPanel(ctx, 1)], ["rolesPanel(2)", () => mod.rolesPanel(ctx, 2)],
    ["rosterPanel(1)", () => mod.rosterPanel(ctx, 1)], ["rosterPanel(2)", () => mod.rosterPanel(ctx, 2)], ["rosterPanel(99)", () => mod.rosterPanel(ctx, 99)],
    ["pendingPanel(note)", () => mod.pendingPanel(ctx, { title: "Approved", description: "ok", color: 1 })],
    ["serverPicker(test)", () => mod.serverPicker(ctx, "test")], ["serverPicker(edit)", () => mod.serverPicker(ctx, "edit")],
    ["testServers(all)", () => mod.testServers(ctx, "")], ["testServers(one)", () => mod.testServers(ctx, "srv0")], ["testServers(typo)", () => mod.testServers(ctx, "nope")],
    ["forceLinkNow", () => mod.forceLinkNow(ctx, "999999999999999999", "NewPlayer")], ["forceLinkNow(taken)", () => mod.forceLinkNow(ctx, "999999999999999999", "Player0")],
    ["transferNow", () => mod.transferNow(ctx, "Player0", "999999999999999999", "")], ["transferNow(missing)", () => mod.transferNow(ctx, "Nobody", "", "")],
    ["giveKit(user)", async () => {
      const result = await mod.giveKit(ctx, { kit: "STARTER", user: "400000000000000000" });
      if (!ctx.rconCalls.length || !String(ctx.rconCalls[ctx.rconCalls.length - 1].command).includes('"Player0"')
        || String(ctx.rconCalls[ctx.rconCalls.length - 1].command).includes("400000000000000000")) {
        problems.push("giveKit(user): a linked Discord user must resolve to Player0's gamertag, never the Discord id");
      }
      checkPayload("giveKit(user)", result);
      const blocked = await mod.giveKit(ctx, { kit: "STARTER", user: "400000000000000000" });
      if (!blocked || !blocked.embeds || blocked.embeds[0].title !== "Giveaway cooldown") problems.push("giveKit(user): second successful giveaway was not blocked by cooldown");
      checkPayload("giveKit(cooldown)", blocked);
      const otherKit = await mod.giveKit(ctx, { kit: "PVP", gamertag: "Player0" });
      if (!otherKit || !otherKit.embeds || otherKit.embeds[0].title !== "Sent") problems.push("giveKit: cooldown should be per kit, not per player");
      checkPayload("giveKit(other kit)", otherKit);
      ctx.settings.kits.locked = true;
      const paused = await mod.giveKit(ctx, { kit: "OTHER", gamertag: "Player0" });
      if (!paused || !paused.embeds || paused.embeds[0].title !== "Kit delivery is paused") problems.push("giveKit: staff kit pause did not block manual delivery");
      checkPayload("giveKit(paused)", paused);
      ctx.settings.kits.locked = false;
      const beforeUnsafe = ctx.rconCalls.length;
      const unsafe = await mod.giveKit(ctx, { kit: "STARTER", gamertag: 'Player0";status' });
      if (!unsafe || !unsafe.embeds || unsafe.embeds[0].title !== "That name cannot be sent safely"
        || ctx.rconCalls.length !== beforeUnsafe) problems.push("giveKit: command separators in a gamertag must be refused before RCON");
      const available = ctx.servers();
      if (available.length > 1) {
        await mod.giveKit(ctx, { kit: "PVP", gamertag: "DifferentPlayer", server: available[1].name });
        const lastCall = ctx.rconCalls[ctx.rconCalls.length - 1];
        if (!lastCall || lastCall.host !== available[1].host) problems.push("giveKit: selected server autocomplete value did not select that server");
      }
    }],
    ["giveKit(unlinked user)", async () => {
      const before = ctx.rconCalls.length;
      const result = await mod.giveKit(ctx, { kit: "STARTER", user: "123456789012345678" });
      if (ctx.rconCalls.length !== before) problems.push("giveKit(unlinked user): must not send RCON for an unlinked Discord account");
      return result;
    }],
    ["giveKit(no kit)", () => mod.giveKit(ctx, { gamertag: "Player0" })],
    ["testAndSaveServer(edit, blank password)", () => mod.testAndSaveServer(ctx, { srv_name: "", srv_host: "", srv_port: "", srv_pass: "" }, "srv0")],
    ["testAndSaveServer(bad port)", () => mod.testAndSaveServer(ctx, { srv_host: "203.0.113.9", srv_port: "abc" }, null)],
    ...mod.LOG_TYPES.map((t) => ["channelMenu(" + t[0] + ")", () => mod.channelMenu(t[0], ctx)]),
    ["logTypeMenu", () => mod.logTypeMenu(ctx)],
    ["kitGivePanel", () => mod.kitGivePanel(ctx)],
    ["deliveryModal", () => mod.deliveryModal(ctx.settings.kits)],
    ["saveDelivery(valid)", () => mod.saveDelivery(ctx, {
      kit_list: "kit list",
      kit_give: 'kit givetoplayer {kit} "{player}"',
      kit_give_cooldown: "45",
    })],
    ["saveDelivery(missing placeholders)", () => mod.saveDelivery(ctx, {
      kit_list: "kit list",
      kit_give: "kit give",
      kit_give_cooldown: "30",
    })],
    ["saveDelivery(invalid cooldown)", () => mod.saveDelivery(ctx, {
      kit_list: "kit list",
      kit_give: 'kit givetoplayer {kit} "{player}"',
      kit_give_cooldown: "86401",
    })],
    ["setupPanel(not saving)", () => mod.setupPanel(Object.assign({}, ctx, { storeTokenSet: () => false }))],
    ["setupStatus(problems)", () => mod.setupStatus(Object.assign({}, ctx, { storeTokenSet: () => false, diagnostics: () => ({ ready: true,
      channels: { command: { id: "1", exists: false }, rcon: { id: "2", exists: true, canSend: false } },
      roles: { owner: { id: "3", exists: false } }, linked: { id: "4", exists: true, canManage: true, above: false } }) }))],
    ["setupStatus(healthy)", () => mod.setupStatus(Object.assign({}, ctx, { diagnostics: () => ({ ready: true, channels: {}, roles: {}, linked: null }) }))],
    ["rosterPanel(search)", () => mod.rosterPanel(ctx, 1, "player1")],
    ["rosterPanel(search, nothing)", () => mod.rosterPanel(ctx, 1, "zzzz")],
    ["installKit(kit names)", () => mod.installKit(ctx, Buffer.from('kit remove "PVP"\nkit add "PVP"\nkit add "PVP" rifle.ak 1 1 main').toString("base64"))],
  ];
  for (const [name, run] of extra) {
    try { checkPayload(name + " [" + label + "]", await Promise.resolve(run())); }
    catch (error) { problems.push(name + " [" + label + "]: threw " + String((error && error.message) || error)); }
  }
  /* every autocomplete option answers with at most 25 valid choices */
  for (const cmd of COMMANDS) {
    for (const sub of (cmd.options || []).filter((o) => o.type === 1)) {
      for (const o of (sub.options || []).filter((x) => x.autocomplete)) {
        for (const typed of ["", "p", "kit_1", "zzzz"]) {
          const where = "autocomplete /" + cmd.name + " " + sub.name + " " + o.name + "='" + typed + "' [" + label + "]";
          checked += 1;
          try {
            const choices = mod.autocompleteChoices(ctx, cmd.name, sub.name, { name: o.name, value: typed }, { scope: "kit" });
            if (!Array.isArray(choices) || choices.length > 25) problems.push(where + ": more than 25 choices");
            if (cmd.name === "kits" && sub.name === "give" && o.name === "kit" && typed === "st"
              && !choices.some((choice) => choice.value === "STARTER")) problems.push(where + ": saved kit names are not suggested");
            for (const c of choices) if (!c.name || c.name.length > 100 || !String(c.value).length || String(c.value).length > 100) problems.push(where + ": a choice outside 1-100 characters");
          } catch (error) { problems.push(where + ": threw " + String((error && error.message) || error)); }
        }
      }
    }
  }
}

problems.push(...limits.problems);
console.log(COMMANDS.length + " commands, " + runs.length + " command runs x 3 setups, " + (checked + limits.checked) + " checks.");
if (problems.length) {
  const unique = [...new Set(problems)];
  console.log(unique.length + " problem(s) Discord would refuse:");
  for (const p of unique) console.log("  - " + p);
  process.exit(1);
}
console.log("Every command definition and every reply fits Discord's rules.");
