/* Loaded with `node --import ./scripts/sim/register.mjs bot/server.mjs`: swaps discord.js for
   the stand-in in discord-stub.mjs, so the real bot runs with no Discord and no npm install. */
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
