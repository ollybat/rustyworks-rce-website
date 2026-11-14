import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* Raster artwork - the app icons and the social card - is committed as base64
   text beside the real file, because the publishing path for this repository can
   only send text. Large images are split into .b64.partN pieces to stay inside
   the size limit of a single commit. Decode it all before the site is copied, so
   a fresh clone builds and deploys with the artwork actually in place. */
const MEDIA = join("public", "media");
/* Any file sent as .b64 (or .b64.partN) is decoded back to its real name: images, and
   also larger scripts or stylesheets that would otherwise be cut in half by text transfer. */
const RASTER = /^(.*\.(?:png|jpe?g|webp|gif|js|css|json|txt))\.b64(?:\.part(\d+))?$/;
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

/* ---------------------------------------------------------------------------
   Shipping copies
   ---------------------------------------------------------------------------
   public/ keeps the readable original of every page, script and stylesheet.
   What a visitor downloads is built from it here, so the site that goes out
   carries no commentary and no spacing to read between the lines. Behaviour is
   untouched: comments and layout go, nothing else - identifiers keep their
   names, so anything a page reaches by name (an onclick attribute, a shared
   global, a CSS custom property) still resolves.

   If a file cannot be processed it is copied through exactly as it was: one
   surprise in one file can never take the site down with it.
   ------------------------------------------------------------------------- */
const MINIFY_JS = new Set([".js", ".mjs"]);
const MINIFY_CSS = new Set([".css"]);
const MINIFY_HTML = new Set([".html"]);

let esbuild = null;
try {
  esbuild = await import("esbuild");
} catch (error) {
  console.warn("[build] esbuild is not installed - shipping the readable files unchanged");
}

function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(path));
    else found.push(path);
  }
  return found;
}

/* Markup comments, and only outside script, style, pre and textarea, where a
   comment-looking sequence can be real content. */
function stripHtmlComments(source) {
  const keep = /<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi;
  const parts = [];
  let last = 0;
  let match;
  while ((match = keep.exec(source)) !== null) {
    parts.push(stripPlainComments(source.slice(last, match.index)), match[0]);
    last = match.index + match[0].length;
  }
  parts.push(stripPlainComments(source.slice(last)));
  return parts.join("");
}

function stripPlainComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

const clientDir = join("build", "client");
let shipped = 0;
let unchanged = 0;
let before = 0;
let after = 0;

for (const file of walkFiles(clientDir)) {
  const dot = file.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.slice(dot).toLowerCase();
  const isJs = MINIFY_JS.has(ext);
  const isCss = MINIFY_CSS.has(ext);
  const isHtml = MINIFY_HTML.has(ext);
  if (!isJs && !isCss && !isHtml) continue;
  const original = readFileSync(file, "utf8");
  before += Buffer.byteLength(original);
  let stripped = original;
  try {
    if (isHtml) {
      stripped = stripHtmlComments(original);
    } else if (esbuild) {
      /* Whitespace and comments only - no syntax simplification and no renamed
         identifiers, so every name a page reaches from markup keeps working. */
      const result = esbuild.transform(original, {
        loader: isCss ? "css" : "js",
        minifyWhitespace: true,
        minifySyntax: false,
        minifyIdentifiers: false,
        legalComments: "none",
        target: isCss ? undefined : "es2020",
      });
      stripped = (await result).code;
    }
  } catch (error) {
    stripped = original;
    unchanged += 1;
    console.warn("[build] left " + file + " as it was: " + error.message);
  }
  writeFileSync(file, stripped);
  after += Buffer.byteLength(stripped);
  shipped += 1;
}

console.log("[build] shipping copies: " + shipped + " files, " + before + " -> " + after + " bytes"
  + (unchanged ? ", " + unchanged + " left readable" : ""));

const rawConfig = readFileSync("wrangler.jsonc", "utf8");
const config = JSON.parse(rawConfig.replace(/\/\/[^\n]*/g, "").replace(/,(\s*[}\]])/g, "$1"));
const manifest = {
  main: "worker.js",
  no_bundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
  compatibility_date: config.compatibility_date,
  compatibility_flags: config.compatibility_flags ?? [],
  /* run_worker_first is passed through when wrangler.jsonc sets it: without it Cloudflare
     serves an existing asset without waking the Worker, so the dashboard gate would never run. */
  assets: {
    directory: "../client",
    binding: "ASSETS",
    ...(config.assets && config.assets.run_worker_first ? { run_worker_first: config.assets.run_worker_first } : {}),
  },
  ...(config.vars ? { vars: config.vars } : {}),
  ...(config.durable_objects ? { durable_objects: config.durable_objects } : {}),
  ...(config.migrations ? { migrations: config.migrations } : {}),
  ...(config.kv_namespaces ? { kv_namespaces: config.kv_namespaces } : {}),
  ...(config.r2_buckets ? { r2_buckets: config.r2_buckets } : {}),
  ...(config.bindings ? { bindings: config.bindings } : {}),
};
writeFileSync("build/server/wrangler.json", JSON.stringify(manifest, null, 2) + "\n");
