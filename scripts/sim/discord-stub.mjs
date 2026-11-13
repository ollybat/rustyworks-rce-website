/* A stand-in for the parts of discord.js the bot uses, shaped the way the real library hands
   things over - not the raw API. A submitted form arrives as `fields` (a collection keyed by
   customId) and `components` (camelCase customId), with no raw `data`; a member's roles are a
   cache; permissions have has(). The interactions enforce Discord's rules: one first answer,
   editReply only after a reply or deferral, update/deferUpdate only on components, and every
   first answer is timed so anything later than three seconds is caught.

   SIM_SCENARIO names a module whose run() is called once the bot is ready. */
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

export const GatewayIntentBits = { Guilds: 1 };
export const Partials = { Channel: 1 };
export const PermissionFlagsBits = { Administrator: 8n, ManageGuild: 32n, ManageRoles: 268435456n };
export const Events = {
  ClientReady: "ready", InteractionCreate: "interactionCreate", Error: "error", Debug: "debug",
  ShardDisconnect: "shardDisconnect", ShardReconnecting: "shardReconnecting",
};
export const MessageFlags = { Ephemeral: 64 };

/* discord.js's Collection: a Map with array-style helpers. */
export class Collection extends Map {
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  filter(fn) { const out = new Collection(); for (const [k, v] of this) if (fn(v, k)) out.set(k, v); return out; }
  map(fn) { return [...this.values()].map(fn); }
  first() { return this.values().next().value; }
  sort(fn) { const sorted = [...this.entries()].sort((a, b) => fn(a[1], b[1])); this.clear(); for (const [k, v] of sorted) this.set(k, v); return this; }
}

/* What the pretend Discord saw: messages posted in channels, roles given and taken. */
export const world = { sent: [], roleChanges: [], registered: [], dms: [], deleted: [], guildId: process.env.DISCORD_GUILD_ID || "1" };
/* a member who keeps direct messages from server members closed */
const DMS_CLOSED = "100000000000000209";
/* the one log channel the bot may see but not post in */
const NO_SEND = "100000000000000404";

function makeGuild() {
  const roles = [["100", "@everyone", 0], ["100000000000000301", "Owner", 9], ["100000000000000302", "Linked", 2], ["100000000000000303", "VIP", 3]]
    .map(([id, name, position]) => [id, { id, name, position }]);
  return {
    id: world.guildId, name: "Sim Guild", ownerId: process.env.SIM_OWNER_ID || "100000000000000999", memberCount: 42, icon: null,
    roles: { cache: new Collection(roles) },
    channels: {
      cache: new Collection(["401", "402", "403", "404", "405", "406"].map((n, i) => {
        const id = "1000000000000" + n.padStart(5, "0");
        return [id, { id, name: "log-" + n, type: 0, rawPosition: i, parent: { name: "Logs" },
          permissionsFor: () => ({ has: (perm) => (id === NO_SEND ? perm !== "SendMessages" : ["ViewChannel", "SendMessages", "EmbedLinks"].includes(perm)) }) }];
      })),
    },
    commands: {
      async set(list) {
        world.registered = list;
        const out = new Collection();
        list.forEach((cmd, i) => out.set("90000000000000000" + i, Object.assign({}, cmd, { id: "90000000000000000" + i })));
        return out;
      },
    },
    members: {
      /* the bot itself: Manage Roles, and a highest role above Linked (2) and VIP (3) */
      me: { permissions: perms(268435456n), roles: { highest: { position: 5 } } },
      async fetch(id) {
        if (String(id).startsWith("0")) throw new Error("Unknown Member");
        const change = (action) => async (roleId) => { world.roleChanges.push({ userId: String(id), roleId: String(roleId), action }); };
        return { id: String(id), roles: { add: change("add"), remove: change("remove") } };
      },
    },
  };
}

export class Client extends EventEmitter {
  constructor() {
    super();
    this.user = { tag: "Spinback#0001", setPresence(p) { world.presence = p; } };
    this.ws = { ping: 42 };
    this.guild = makeGuild();
    this.guilds = { cache: new Collection([[this.guild.id, this.guild]]), fetch: async () => this.guild };
    this.channels = {
      cache: new Collection(),
      fetch: async (id) => ({
        id: String(id),
        send: async (payload) => { world.sent.push({ channelId: String(id), payload }); return { id: "m" + world.sent.length }; },
        messages: { fetch: async (messageId) => ({ id: String(messageId), delete: async () => { world.deleted.push(String(messageId)); } }) },
      }),
    };
    this.users = {
      fetch: async (id) => ({
        id: String(id),
        send: async (payload) => {
          if (String(id) === DMS_CLOSED) throw new Error("Cannot send messages to this user");
          world.dms.push({ userId: String(id), payload });
          return { id: "dm" + world.dms.length };
        },
      }),
    };
  }
  async login() {
    setTimeout(async () => {
      /* once() listeners are called and dropped, like the real ready event */
      const ready = this.listeners(Events.ClientReady);
      this.removeAllListeners(Events.ClientReady);
      await Promise.all(ready.map((f) => Promise.resolve(f(this))));
      this.emit(Events.Debug, "[WS => Shard 0] Heartbeat acknowledged, latency of 42ms.");
      if (process.env.SIM_SCENARIO) {
        const scenario = await import(pathToFileURL(resolvePath(process.env.SIM_SCENARIO)).href);
        await scenario.run({ client: this, world, make, interact: (it) => this.interact(it) });
      }
    }, 20);
    return "ok";
  }
  /* Deliver an interaction and wait until the bot's handler has finished with it. */
  async interact(interaction) {
    const handlers = this.listeners(Events.InteractionCreate);
    await Promise.all(handlers.map((f) => Promise.resolve(f(interaction))));
    return interaction;
  }
  destroy() {}
}

let seq = 0;
function perms(bits) {
  const b = BigInt(bits || 0);
  /* like discord.js: Administrator implies every permission */
  return { bitfield: b, has: (flag) => (b & 8n) === 8n || (b & BigInt(flag)) === BigInt(flag) };
}
function base(kind, who, extra) {
  const created = Date.now();
  const component = ["button", "string", "role", "channel", "user"].includes(kind);
  const it = Object.assign({
    id: String(++seq), kind, guildId: who.guildId || world.guildId,
    user: { id: who.id, tag: "user" + who.id, username: "user" + who.id },
    member: { roles: { cache: new Collection((who.roles || []).map((r) => [String(r), { id: String(r) }])) }, permissions: perms(who.perms) },
    memberPermissions: perms(who.perms),
    guild: { ownerId: process.env.SIM_OWNER_ID || "100000000000000999" },
    deferred: false, replied: false, ephemeral: null,
    calls: [], firstAckAt: null, errors: [],
    isAutocomplete: () => kind === "autocomplete",
    isChatInputCommand: () => kind === "command",
    isModalSubmit: () => kind === "modal",
    isButton: () => kind === "button",
    isStringSelectMenu: () => kind === "string",
    isRoleSelectMenu: () => kind === "role",
    isChannelSelectMenu: () => kind === "channel",
    isUserSelectMenu: () => kind === "user",
    isRepliable: () => kind !== "autocomplete",
  }, extra);
  const at = () => Date.now() - created;
  const record = (method, body) => { it.calls.push({ method, at: at(), body }); };
  const ack = (method, body) => { record(method, body); if (it.firstAckAt === null) it.firstAckAt = at(); };
  const fail = (message) => { it.errors.push(message); throw new Error(message); };
  const once = (name) => { if (it.deferred || it.replied) fail("InteractionAlreadyReplied: " + name); };
  it.reply = async (body) => { if (kind === "autocomplete") fail("reply() on autocomplete"); once("reply"); it.replied = true; it.ephemeral = !!(body && (Number(body.flags) & 64)); ack("reply", body); return {}; };
  it.deferReply = async (opts) => { if (kind === "autocomplete") fail("deferReply() on autocomplete"); once("deferReply"); it.deferred = true; it.ephemeral = !!(opts && (Number(opts.flags) & 64)); ack("deferReply", opts); };
  it.editReply = async (body) => { if (!it.deferred && !it.replied) fail("InteractionNotReplied: editReply"); record("editReply", body); return {}; };
  it.followUp = async (body) => { if (!it.deferred && !it.replied) fail("InteractionNotReplied: followUp"); record("followUp", body); return {}; };
  it.update = async (body) => { if (!component) fail("update() on a " + kind); once("update"); it.replied = true; ack("update", body); };
  it.deferUpdate = async () => { if (!component) fail("deferUpdate() on a " + kind); once("deferUpdate"); it.deferred = true; ack("deferUpdate"); };
  it.showModal = async (modal) => { if (kind === "modal" || kind === "autocomplete") fail("showModal() from a " + kind); once("showModal"); it.replied = true; ack("showModal", modal); };
  it.respond = async (choices) => { if (kind !== "autocomplete") fail("respond() outside autocomplete"); if (it.replied) fail("respond() twice"); it.replied = true; ack("respond", choices); };
  return it;
}

/* Interactions the way discord.js builds them. */
export const make = {
  command(who, name, sub, options = {}, focusedName) {
    const opts = Object.entries(options).map(([k, v]) => {
      const typed = v && typeof v === "object";
      return { name: k, type: typed ? v.type : 3, value: typed ? v.value : v, focused: k === focusedName ? true : undefined };
    });
    const data = sub ? [{ name: sub, type: 1, options: opts }] : opts;
    return base(focusedName ? "autocomplete" : "command", who, {
      commandName: name,
      options: { data, getFocused(full) { const f = opts.find((o) => o.focused); return full ? f : f && f.value; } },
    });
  },
  button(who, customId) { return base("button", who, { customId }); },
  select(who, kind, customId, values) { return base(kind, who, { customId, values }); },
  modal(who, customId, values) {
    const entries = Object.entries(values);
    const fields = new Collection(entries.map(([k, v]) => [k, { type: 4, customId: k, value: v }]));
    return base("modal", who, {
      customId,
      components: entries.map(([k, v]) => ({ type: 1, components: [{ type: 4, customId: k, value: v }] })),
      fields: {
        fields,
        getTextInputValue(id) { const f = fields.get(id); if (!f) throw new Error("Field " + id + " not found"); return f.value; },
      },
    });
  },
};
