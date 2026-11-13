export async function resolve(specifier, context, next) {
  if (specifier === "discord.js") return { url: new URL("./discord-stub.mjs", import.meta.url).href, shortCircuit: true };
  /* The simulation's pretend Rust server sits at 203.0.113.10, a documentation address that
     never answers, so the slow-RCON paths really run. The real guard refuses documentation
     ranges, so in the simulation only, that one range is let through. */
  if (specifier === "./network-guard.mjs" && context.parentURL && /\/bot\/server\.mjs$/.test(context.parentURL)) {
    return { url: new URL("./network-guard-sim.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier === "node:net" && context.parentURL && /\/bot\/server\.mjs$/.test(context.parentURL)) {
    return { url: new URL("./net-sim.mjs", import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
