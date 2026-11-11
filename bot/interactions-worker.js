/* ==========================================================================
   Spinback RCE — Discord bot (interactions endpoint)
   --------------------------------------------------------------------------
   One command: /dashboard. It replies privately with a link to the site's
   owner-only dashboard.

   The three rules you asked for are enforced in three different places:

   1. NOBODY SEES IT BUT THE OWNER
      The command is registered guild-scoped with default_member_permissions "0"
      (see register-commands.mjs). Discord then hides it from everyone who is not
      an administrator, and the server owner always counts as one.

   2. ONLY THE OWNER CAN USE IT
      Even if someone reaches it, this handler checks interaction.member.user.id
      against DISCORD_GUILD_OWNER_ID and answers 0 (no response shown at all) for
      anyone else.

   3. ONE GUILD, ONE BOT
      Every interaction whose guild_id is not DISCORD_GUILD_ID is ignored, and the
      command is registered only inside that guild.

   Deploy as its own Worker with the secrets listed in docs/DISCORD-DASHBOARD.md.
   ========================================================================== */

const DISCORD_API = "https://discord.com/api/v10";

/* Interaction and response types we care about. */
const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const EPHEMERAL = 1 << 6; /* only the person who ran the command sees the reply */
const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const BUTTON_STYLE_LINK = 5;

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/* Discord signs every interaction; unsignatured requests are rejected outright. */
async function verify(request, body, publicKey) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body),
    );
  } catch (error) {
    return false;
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isGuildOwner(interaction, env) {
  const user = (interaction.member && interaction.member.user) || interaction.user || {};
  if (!env.DISCORD_GUILD_OWNER_ID) return false;
  return String(user.id) === String(env.DISCORD_GUILD_OWNER_ID);
}

function dashboardReply(env) {
  const url = (env.SITE_URL || "").replace(/\/+$/, "") + "/dashboard";
  const content = [
    "**Spinback RCE — dashboard**",
    "This link is private to you and only works while signed in as the owner of this server.",
    url,
  ].join("\n");

  return json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL,
      content,
      components: [{
        type: COMPONENT_ACTION_ROW,
        components: [{ type: COMPONENT_BUTTON, style: BUTTON_STYLE_LINK, label: "Open the dashboard", url }],
      }],
    },
  }, 200);
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return json({ error: "bad signature" }, 401);

    let interaction;
    try { interaction = JSON.parse(body); } catch (error) { return json({ error: "bad body" }, 400); }

    /* Discord's endpoint check. */
    if (interaction.type === PING) return json({ type: PONG }, 200);

    if (interaction.type !== APPLICATION_COMMAND) return json({ error: "unsupported interaction" }, 400);

    /* Rule 3: only the one guild this bot belongs to. Answering 0 tells Discord
       "nothing happened", so the command simply does nothing elsewhere. */
    if (String(interaction.guild_id) !== String(env.DISCORD_GUILD_ID)) return json({ type: 0 }, 200);

    /* Rule 2: the server owner and nobody else. */
    if (!isGuildOwner(interaction, env)) return json({ type: 0 }, 200);

    if (interaction.data && interaction.data.name === "dashboard") return dashboardReply(env);

    return json({ type: 0 }, 200);
  },
};
