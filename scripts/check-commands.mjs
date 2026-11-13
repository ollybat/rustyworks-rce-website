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
function checkComponents(where, rows, inModal) {
  if (!rows) return;
  if (!Array.isArray(rows) || rows.length > 5) problems.push(where + ": more than 5 component rows");
  for (const r of rows || []) {
    if (r.type !== 1) { problems.push(where + ": a top-level component is not an action row"); continue; }
    const items = r.components || [];
    if (!items.length) problems.push(where + ": an empty action row");
    const selects = items.filter((c) => [3, 5, 6, 7, 8].includes(c.type));
    const inputs = items.filter((c) => c.type === 4);
    if (selects.length && items.length > 1) problems.push(where + ": a select menu must be alone in its row");
    if (inputs.length && items.length > 1) problems.push(where + ": a text input must be alone in its row");
    if (items.length > 5) problems.push(where + ": more than 5 buttons in a row");
    for (const c of items) {
      checked += 1;
      if (c.custom_id !== undefined && (typeof c.custom_id !== "string" || !c.custom_id || c.custom_id.length > 100)) problems.push(where + ": custom_id must be 1-100 characters (" + c.custom_id + ")");
      if (c.type === 2) {
        if (c.style === 5) { if (!c.url) problems.push(where + ": link button without a url"); if (c.custom_id) problems.push(where + ": link button with a custom_id"); }
        else if (!c.custom_id) problems.push(where + ": button without a custom_id");
        if (!c.label && !c.emoji) problems.push(where + ": button without a label");
        if (c.label && c.label.length > 80) problems.push(where + ": button label over 80 characters");
      }
      if (c.type === 3) {
        const o = c.options || [];
        if (!o.length || o.length > 25) problems.push(where + ": a select menu needs 1-25 options (has " + o.length + ")");
        for (const opt of o) {
          if (!opt.label || opt.label.length > 100) problems.push(where + ": select option label must be 1-100 characters");
          if (!opt.value || String(opt.value).length > 100) problems.push(where + ": select option value must be 1-100 characters");
          if (opt.description && opt.description.length > 100) problems.push(where + ": select option description over 100 characters");
        }
        const values = new Set(o.map((x) => x.value));
        if (values.size !== o.length) problems.push(where + ": two select options share a value");
      }
      if (c.placeholder && c.placeholder.length > 150) problems.push(where + ": placeholder over 150 characters");
      if (c.type === 4) {
        if (!inModal) problems.push(where + ": a text input outside a modal");
        if (!c.label || c.label.length > 45) problems.push(where + ": text input label must be 1-45 characters (" + c.label + ")");
        if (c.value && c.max_length && c.value.length > c.max_length) problems.push(where + ": prefilled value longer than max_length");
        if (c.max_length && c.max_length > 4000) problems.push(where + ": max_length over 4000");
      }
    }
  }
}
function checkPayload(where, payload) {
  checked += 1;
  if (!payload || typeof payload !== "object") { problems.push(where + ": no reply was built"); return; }
  if (payload.postPanelTo) return;
  if (payload.custom_id && payload.title !== undefined && Array.isArray(payload.components)) {
    if (!payload.title || payload.title.length > 45) problems.push(where + ": modal title must be 1-45 characters (" + payload.title + ")");
    if (payload.custom_id.length > 100) problems.push(where + ": modal custom_id over 100 characters");
    checkComponents(where + " (modal)", payload.components, true);
    return;
  }
  if (payload.content !== undefined && String(payload.content).length > 2000) problems.push(where + ": message over 2000 characters");
  const embeds = payload.embeds || [];
  if (embeds.length > 10) problems.push(where + ": more than 10 embeds");
  let total = 0;
  embeds.forEach((e, i) => {
    const w = where + " embed " + (i + 1);
    if (e.title && e.title.length > 256) problems.push(w + ": title over 256 characters");
    if (e.description && e.description.length > 4096) problems.push(w + ": description over 4096 characters");
    if (e.fields && e.fields.length > 25) problems.push(w + ": more than 25 fields");
    for (const f of e.fields || []) {
      if (!f.name || f.name.length > 256) problems.push(w + ": field name must be 1-256 characters (" + f.name + ")");
      if (f.value === undefined || f.value === null || String(f.value).trim() === "" || String(f.value).length > 1024) problems.push(w + ": field \"" + f.name + "\" value must be 1-1024 characters (is " + String(f.value ?? "").length + ")");
      total += (f.name || "").length + String(f.value || "").length;
    }
    if (e.footer && e.footer.text && e.footer.text.length > 2048) problems.push(w + ": footer over 2048 characters");
    total += (e.title || "").length + (e.description || "").length + ((e.footer && e.footer.text) || "").length;
  });
  if (total > 6000) problems.push(where + ": embeds over 6000 characters in total");
  if (!embeds.length && !payload.content && !(payload.components && payload.components.length)) problems.push(where + ": an empty reply");
  checkComponents(where, payload.components, false);
}

function makeCtx(configured, big) {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const settings = {
    staffRoles: configured ? { owner: "111111111111111111", admin: "222222222222222222" } : {},
    logChannels: configured ? { server: "333333333333333333", killfeed: "333333333333333334" } : {},
    servers: configured ? many(big ? 3 : 1, (i) => ({ id: "srv" + i, name: "Server " + i, host: "203.0.113." + (5 + i), port: 28016, password: "x" })) : [],
    kits: {
      binds: configured ? many(big ? 30 : 2, (i) => ({ emote: "emote_" + i, kits: ["KIT_" + i, "STARTER"], cooldown: 300, roleId: i % 2 ? "222222222222222222" : null })) : [],
      locked: false, authSpawn: configured ? { VIP: "VIP_KIT" } : {}, giveCommand: "", listCommand: "",
    },
    installs: {},
    links: configured ? many(big ? 40 : 2, (i) => ({ userId: String(400000000000000000 + i), gamertag: "Player" + i, by: "111111111111111111", at: Date.now() })) : [],
    pending: configured ? many(big ? 30 : 1, (i) => ({ userId: String(500000000000000000 + i), gamertag: "Waiting" + i, at: Date.now() })) : [],
    linkPanel: null,
  };
  return {
    siteUrl: "http://127.0.0.1:9", settings,
    guildInfo: { id: "1", name: "Test guild", ownerId: "111111111111111111", memberCount: 120, icon: null,
      roles: many(big ? 60 : 3, (i) => ({ id: String(600000000000000000 + i), name: "Role " + i, position: i })) },
    gateway: "online", ping: () => 42, uptime: () => 93784, commandCount: () => COMMANDS.length, storeTokenSet: () => true,
    servers: () => settings.servers, kits: () => settings.kits, links: () => settings.links,
    pendingLinks: () => settings.pending, linkPanel: () => settings.linkPanel,
    saveServer: async () => ({ ok: true, detail: "" }), installKit: () => 1,
    addLink: () => ({ ok: true, userId: "400000000000000000", gamertag: "Player0" }), removeLink: () => ({ ok: true }),
    moveLink: () => ({ ok: true, userId: "400000000000000001", gamertag: "Player0" }), requestLink: () => ({ ok: true }),
    setAuthSpawn: () => {}, clearCooldowns: () => 2, cooldownCount: () => (big ? 50 : 1),
    cooldownList: () => many(big ? 50 : 1, (i) => "Player" + i + " -> KIT_" + i + " (120s left)"),
    rconTest: async () => ({ ok: true, authenticated: true, command: "serverinfo", answer: "hostname: Test\nplayers: 3", ms: 40 }),
    rconRun: async () => ({ ok: true, authenticated: true, command: "kit list", answer: big ? many(80, (i) => "KIT_" + i).join("\n") : "STARTER\nPVP", ms: 40 }),
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

console.log(COMMANDS.length + " commands, " + runs.length + " command runs x 3 setups, " + checked + " checks.");
if (problems.length) {
  const unique = [...new Set(problems)];
  console.log(unique.length + " problem(s) Discord would refuse:");
  for (const p of unique) console.log("  - " + p);
  process.exit(1);
}
console.log("Every command definition and every reply fits Discord's rules.");
