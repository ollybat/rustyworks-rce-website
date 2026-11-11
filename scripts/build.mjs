import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* Raster artwork - the app icons and the social card - is committed as base64
   text beside the real file, because the publishing path for this repository can
   only send text. Large images are split into .b64.partN pieces to stay inside
   the size limit of a single commit. Decode it all before the site is copied, so
   a fresh clone builds and deploys with the artwork actually in place. */
const MEDIA = join("public", "media");
const RASTER = /^(.*\.(?:png|jpe?g))\.b64(?:\.part(\d+))?$/;
const rasterGroups = new Map();
for (const name of readdirSync(MEDIA)) {
  const match = RASTER.exec(name);
  if (!match) continue;
  const parts = rasterGroups.get(match[1]) ?? [];
  parts.push({ name, part: match[2] ? Number(match[2]) : 0 });
  rasterGroups.set(match[1], parts);
}
for (const [target, parts] of rasterGroups) {
  parts.sort((a, b) => a.part - b.part);
  const base64 = parts.map((entry) => readFileSync(join(MEDIA, entry.name), "utf8").trim()).join("");
  writeFileSync(join(MEDIA, target), Buffer.from(base64, "base64"));
}

rmSync("build", { recursive: true, force: true });
mkdirSync("build/client", { recursive: true });
mkdirSync("build/server", { recursive: true });
cpSync("public", "build/client", { recursive: true });
cpSync("worker.js", "build/server/worker.js");

/* The base64 companions are build inputs, not site content. */
for (const name of readdirSync(join("build", "client", "media"))) {
  if (RASTER.test(name)) rmSync(join("build", "client", "media", name));
}

const rawConfig = readFileSync("wrangler.jsonc", "utf8");
const config = JSON.parse(rawConfig.replace(/\/\/[^\n]*/g, "").replace(/,(\s*[}\]])/g, "$1"));
const manifest = {
  main: "worker.js",
  no_bundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
  compatibility_date: config.compatibility_date,
  compatibility_flags: config.compatibility_flags ?? [],
  assets: { directory: "../client", binding: "ASSETS" },
  ...(config.vars ? { vars: config.vars } : {}),
  ...(config.durable_objects ? { durable_objects: config.durable_objects } : {}),
  ...(config.migrations ? { migrations: config.migrations } : {}),
  ...(config.kv_namespaces ? { kv_namespaces: config.kv_namespaces } : {}),
  ...(config.r2_buckets ? { r2_buckets: config.r2_buckets } : {}),
  ...(config.bindings ? { bindings: config.bindings } : {}),
};
writeFileSync("build/server/wrangler.json", JSON.stringify(manifest, null, 2) + "\n");
