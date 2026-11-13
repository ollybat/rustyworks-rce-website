export async function resolve(specifier, context, next) {
  if (specifier === "discord.js") return { url: new URL("./discord-stub.mjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
