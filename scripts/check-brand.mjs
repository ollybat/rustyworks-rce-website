#!/usr/bin/env node
/**
 * Fails when the old product name is still sitting in the copy.
 *
 * A rename edits titles, meta tags, page text, docs and the bot reply all over the
 * tree, and it is easy to miss one. This walks the text files we publish and reports:
 *
 *   - the old brand name anywhere at all  -> exits non-zero
 *   - lowercase plumbing references       -> listed, so a human can confirm they are
 *                                            meant to stay (host, bucket, icon files)
 *
 * Usage:  npm run check:brand
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OLD = "RustyWorks";
const SKIP_DIRS = new Set(["build", "node_modules", ".git", ".wrangler", "tmp"]);
const SKIP_FILES = new Set(["bun.lock", "package.json", "wrangler.jsonc", "check-brand.mjs"]);
const TEXT = /\.(html|css|js|mjs|json|webmanifest|md|txt|xml|svg)$/;
// Plumbing, not copy: the deployed host, the bot API, the Worker and bucket names, and
// the icon filenames style.css swaps for seasonal art.
const PLUMBING = /rustyworks-rce-j7ao5f|camelai\.app|api\.rustyworksrce\.xyz|rustyworks-rce-status-log|rustyworks-icon|"rustyworks-rce"/;

const stale = [];
const plumbing = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) { walk(path); continue; }
    if (!TEXT.test(entry)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes(OLD)) stale.push(relative(".", path) + ":" + (i + 1) + "  " + line.trim());
      else if (line.includes("rustyworks") && !PLUMBING.test(line)) plumbing.push(relative(".", path) + ":" + (i + 1) + "  " + line.trim());
    });
  }
}

walk(".");

if (plumbing.length) {
  console.log("Plumbing references to the old name (expected, review only):");
  for (const line of plumbing.slice(0, 20)) console.log("  " + line);
  if (plumbing.length > 20) console.log("  ... and " + (plumbing.length - 20) + " more");
  console.log("");
}

if (stale.length) {
  console.error("Old name still in the copy (" + stale.length + "):");
  for (const line of stale) console.error("  " + line);
  process.exit(1);
}

console.log("Brand check passed: no stale copy, " + plumbing.length + " plumbing reference(s) reviewed.");