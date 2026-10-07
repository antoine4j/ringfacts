// Refuses a commit that would put other outlets' article text into git.
//
//   node scripts/article-text-guard.js --staged   # the files about to be committed (the pre-commit hook)
//   node scripts/article-text-guard.js --all      # every tracked file (slower; run by hand)
//
// The bodies it compares against live only on this machine, in the git-ignored
// files listed in BODY_SOURCES. On a fresh clone there are none, so there is
// nothing to protect and the check passes. History: docs/decisions.md#article-text-out-of-git

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Local, git-ignored files that hold article bodies.
const BODY_SOURCES = [
  "golden/articles.json",
  "research/corpus/graded-2026-09.json",
  "research/corpus/holdout.json",
  "research/corpus/tune.json",
];

// Keys under which a body can sit in those files.
const BODY_KEYS = new Set(["body", "excerpt", "text", "article_text"]);

export const GRAM_LENGTH = 50;
export const GRAM_STRIDE = 25;

// The longest continuous passage of one article a tracked file may hold: a
// quoted sentence passes, a paragraph does not.
export const MAX_COPIED_CHARACTERS = 199;

/**
 * Collapses whitespace and JSON escapes, so text matches however it was stored.
 *
 * @param text
 * @returns {string}
 */
export function normalise(text) {
  const unescaped = text.replace(/\\n|\\r|\\t/g, " ").replace(/\\"/g, '"');
  return unescaped.split(/\s+/).join(" ");
}

/**
 * Cuts each body into fixed pieces, every GRAM_STRIDE characters, and
 * remembers where each piece sits: which body, which step along it.
 *
 * @param {string[]} bodies
 * @returns {Map<string, string>}  piece → "body:step"
 */
export function indexBodies(bodies) {
  const pieces = new Map();
  for (const [bodyIndex, body] of bodies.entries()) {
    const flat = normalise(body);
    for (let start = 0; start + GRAM_LENGTH <= flat.length; start += GRAM_STRIDE) {
      const piece = flat.slice(start, start + GRAM_LENGTH);
      if (!pieces.has(piece)) pieces.set(piece, `${bodyIndex}:${start / GRAM_STRIDE}`);
    }
  }
  return pieces;
}

/**
 * The longest continuous passage of any one article that a file holds, in
 * characters: found pieces that follow each other in the same body make a
 * passage of GRAM_LENGTH + (pieces − 1) × GRAM_STRIDE characters or more.
 *
 * @param {string} text  The file's content.
 * @param {Map<string, string>} pieces  From indexBodies.
 * @returns {number}  0 when no piece of any article is found.
 */
export function longestCopiedPassage(text, pieces) {
  const flat = normalise(text);
  const found = new Set();

  // Slide over every position and note where each found piece sits in its body.
  for (let start = 0; start + GRAM_LENGTH <= flat.length; start += 1) {
    const place = pieces.get(flat.slice(start, start + GRAM_LENGTH));
    if (place !== undefined) found.add(place);
  }

  // Count the longest chain of neighbouring pieces of one body.
  let longestChain = 0;
  for (const place of found) {
    const [body, step] = place.split(":").map(Number);
    if (found.has(`${body}:${step - 1}`)) continue;
    let chain = 1;
    while (found.has(`${body}:${step + chain}`)) chain += 1;
    longestChain = Math.max(longestChain, chain);
  }
  return longestChain === 0 ? 0 : GRAM_LENGTH + (longestChain - 1) * GRAM_STRIDE;
}

/**
 * Every body under a body-like key, anywhere in a parsed JSON value.
 *
 * @param {unknown} value
 * @param {string[]} out  Collects the bodies.
 * @returns {string[]}
 */
function collectBodies(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectBodies(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      const isBody = BODY_KEYS.has(key) && typeof inner === "string" && inner.length >= 300;
      if (isBody) out.push(inner);
      else collectBodies(inner, out);
    }
  }
  return out;
}

/**
 * The bodies kept on this machine: the fixed sources and every experiment's data folder.
 *
 * @returns {string[]}
 */
function localBodies() {
  const experiments = path.join(REPO, "research", "experiments");
  const dataFiles = [];

  // Each experiment's git-ignored data/ folder.
  for (const name of existsSync(experiments) ? readdirSync(experiments) : []) {
    const dataDir = path.join("research", "experiments", name, "data");
    if (!existsSync(path.join(REPO, dataDir))) continue;
    for (const file of readdirSync(path.join(REPO, dataDir))) {
      if (file.endsWith(".json")) dataFiles.push(path.join(dataDir, file));
    }
  }

  // Read whatever exists; a missing source is simply not on this machine.
  const bodies = [];
  for (const source of [...BODY_SOURCES, ...dataFiles]) {
    const full = path.join(REPO, source);
    if (!existsSync(full)) continue;
    collectBodies(JSON.parse(readFileSync(full, "utf8")), bodies);
  }
  return bodies;
}

/**
 * The files to check and how to read each: staged content, or the working tree.
 *
 * @param {boolean} staged
 * @returns {{ file: string, read: () => string }[]}
 */
function filesToCheck(staged) {
  const listArgs = staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"] : ["ls-files"];
  const names = execFileSync("git", listArgs, { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  return names.map((file) => ({
    file,
    read: () => staged
      ? execFileSync("git", ["show", `:${file}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      : readFileSync(path.join(REPO, file), "utf8"),
  }));
}

/**
 * Checks the staged or tracked files and exits non-zero if any copies an article.
 */
function main() {
  const staged = !process.argv.includes("--all");
  const bodies = localBodies();
  if (bodies.length === 0) {
    console.log("article-text-guard: no local article bodies on this machine; nothing to check.");
    return;
  }

  // Check each file; skip what cannot be read as text.
  const pieces = indexBodies(bodies);
  const offenders = [];
  for (const { file, read } of filesToCheck(staged)) {
    if (!existsSync(path.join(REPO, file)) && !staged) continue;
    let text;
    try { text = read(); } catch { continue; }
    const copied = longestCopiedPassage(text, pieces);
    if (copied > MAX_COPIED_CHARACTERS) offenders.push(`${file} (a passage of ${copied}+ characters of one article)`);
  }

  // Report and refuse.
  if (offenders.length === 0) return;
  console.error("article-text-guard: these files would put article text into git:");
  for (const line of offenders) console.error(`  ${line}`);
  console.error("Keep article bodies in git-ignored files; quote at most a sentence. See docs/decisions.md#article-text-out-of-git.");
  process.exit(1);
}

// Run only when executed directly, so the test can import the functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
