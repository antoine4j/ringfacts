// Step 1: picks the article addresses to try through Jina. For each of the four
// outlets that refused production's Cloud Run address but answered the laptop
// (the source review, 2026-10-30), the newest addresses production stored, the
// ones production failed to read first. Read-only: the v0_feed role, on a
// session that refuses writes.
//
//   node --env-file=../../../.env.v0 select.mjs
//
// Writes data/targets.json into the MAIN checkout's copy of this experiment's
// folder (git-ignored there: addresses and headlines).

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

// The outlets, as hosts without "www.", in the source review's order.
export const OUTLETS = ["dazn.com", "sports.ndtv.com", "eldesmarque.com", "champion.com.ua"];
export const PER_OUTLET = 12;
const MIN_READABLE_CHARS = 400;
const READING_RUNGS = new Set(["feed-content", "json-ld", "article-tag", "paragraphs"]);
const NOT_COUNTED = new Set(["wrong_subject", "url"]);

/**
 * The folder for this experiment's git-ignored data, inside the main checkout
 * (not the worktree this script runs from).
 *
 * @returns {string}  An absolute path, created if missing.
 */
export function dataDirectory() {
  const here = dirname(fileURLToPath(import.meta.url));
  const commonGit = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: here, encoding: "utf8" }).trim();
  const folder = join(dirname(commonGit), "research/experiments/2026-11-18-jina-network/data");
  mkdirSync(folder, { recursive: true });
  return folder;
}

/**
 * The host of an address without "www.", or null when it is not an address.
 *
 * @param {string|null} address
 * @returns {string|null}
 */
function hostOf(address) {
  try {
    return new URL(address).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Whether production's stored text passes the readable bar for the article's fighter.
 *
 * @param {{body: string|null, body_via: string|null, subject: string}} row
 * @returns {boolean}
 */
function productionRead(row) {
  const matchNames = SUBJECTS.find((subject) => subject.name === row.subject).matchNames;
  const fromReadingRung = READING_RUNGS.has(row.body_via);
  return fromReadingRung && (row.body ?? "").length >= MIN_READABLE_CHARS && mentionsName(row.body, matchNames);
}

/**
 * Picks up to PER_OUTLET rows for one outlet: failed ones first, newest first, then read ones.
 *
 * @param {object[]} rows  The outlet's rows, newest first.
 * @returns {object[]}
 */
function pickForOutlet(rows) {
  const failed = rows.filter((row) => !row.production_read);
  const read = rows.filter((row) => row.production_read);
  return [...failed, ...read].slice(0, PER_OUTLET);
}

/**
 * Reads production's addresses at the four outlets and writes the chosen ones.
 */
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.V0_FEED_DATABASE_URL, options: "-c default_transaction_read_only=on" });
  const result = await pool.query(
    `SELECT id, subject, title, resolved_url, seen_at, body, body_via, held_reason
     FROM items
     WHERE resolved_url IS NOT NULL AND source NOT ILIKE '%mshale%'
     ORDER BY seen_at DESC`,
  );
  await pool.end();

  // Keep counted articles whose real address is at one of the four outlets.
  const rows = [];
  for (const row of result.rows) {
    if (NOT_COUNTED.has(row.held_reason?.split(":")[0])) continue;
    const outlet = hostOf(row.resolved_url);
    if (!OUTLETS.includes(outlet)) continue;
    rows.push({ id: Number(row.id), outlet, subject: row.subject, title: row.title, address: row.resolved_url, seen_at: row.seen_at.toISOString(), body_via: row.body_via ?? "none", production_read: productionRead(row) });
  }

  // Up to PER_OUTLET per outlet, and the counts behind the choice.
  const targets = [];
  for (const outlet of OUTLETS) {
    const outletRows = rows.filter((row) => row.outlet === outlet);
    const picked = pickForOutlet(outletRows);
    targets.push(...picked);
    console.log(outlet, `${outletRows.length} stored, ${outletRows.filter((row) => !row.production_read).length} unread; picked ${picked.length} (${picked.filter((row) => !row.production_read).length} unread), newest ${picked[0]?.seen_at.slice(0, 10)}`);
  }
  writeFileSync(join(dataDirectory(), "targets.json"), JSON.stringify(targets, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
