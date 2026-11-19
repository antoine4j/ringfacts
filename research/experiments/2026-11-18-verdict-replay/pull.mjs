// Step 1: production's whole record of articles, read once, reduced to what the
// replay counts: for each article its fighter, the day production found it, and
// whether its stored text passes v0's readable bar. Same definition of "counted"
// and "readable" as ../2026-10-30-source-review/pull.mjs and load.mjs (checked
// below against that experiment's own file). Read-only: the v0_feed role, and a
// session that refuses writes.
//
//   node --env-file=../../../.env.v0 pull.mjs
//
// Writes data/articles.json into the MAIN checkout's copy of this experiment's
// folder (git-ignored there: ids and dates only, no headline, no article text).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

// The record's end, fixed so a re-run reads the same articles: the start of the
// first day after the last full day (18 Nov 2026, UTC) the record covers.
export const RECORD_END = "2026-11-19T00:00:00Z";
const MIN_READABLE_CHARS = 400;
// The reader's rungs that mean "text was read"; everything else is a failure kind.
const READING_RUNGS = new Set(["feed-content", "json-ld", "article-tag", "paragraphs"]);
// Holds that mean "not an article about the fighter" or "the same address twice".
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
  const mainCheckout = dirname(commonGit);
  const folder = join(mainCheckout, "research/experiments/2026-11-18-verdict-replay/data");
  mkdirSync(folder, { recursive: true });
  return folder;
}

/**
 * Whether production's stored text passes v0's readable bar for the article's fighter.
 *
 * @param {{body: string|null, body_via: string|null, subject: string}} row
 * @returns {boolean}
 */
export function isReadable(row) {
  const fromReadingRung = READING_RUNGS.has(row.body_via);
  const longEnough = (row.body ?? "").length >= MIN_READABLE_CHARS;
  const matchNames = SUBJECTS.find((subject) => subject.name === row.subject).matchNames;
  return fromReadingRung && longEnough && mentionsName(row.body, matchNames);
}

/**
 * Checks the readable verdicts against the source review's file for the articles
 * both hold, so a change of definition shows up here and not in the table.
 *
 * @param {{id: number, readable: boolean}[]} articles
 * @returns {{compared: number, disagreements: number}}
 */
function checkAgainstSourceReview(articles) {
  const reviewFile = new URL("../../2026-10-30-source-review/data/items.json", import.meta.url);
  const mainReviewFile = join(dirname(dataDirectory()), "../2026-10-30-source-review/data/items.json");
  const path = existsSync(reviewFile) ? reviewFile : mainReviewFile;
  const review = JSON.parse(readFileSync(path, "utf8"));
  const mine = new Map(articles.map((article) => [article.id, article.readable]));
  let compared = 0;
  let disagreements = 0;
  for (const item of review) {
    if (!mine.has(item.id)) continue;
    compared += 1;
    if (mine.get(item.id) !== item.readable) disagreements += 1;
  }
  return { compared, disagreements };
}

/**
 * Reads the record and writes the per-article facts the replay counts.
 */
async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.V0_FEED_DATABASE_URL,
    options: "-c default_transaction_read_only=on",
  });
  const result = await pool.query(
    `SELECT id, subject, seen_at, published_at, body, body_via, held_reason
     FROM items
     WHERE source NOT ILIKE '%mshale%' AND seen_at < $1::timestamptz
     ORDER BY id`,
    [RECORD_END],
  );
  await pool.end();

  // Keep the counted articles; the text is replaced by the readable verdict.
  const counted = result.rows.filter((row) => !NOT_COUNTED.has(row.held_reason?.split(":")[0]));
  const articles = counted.map((row) => ({
    id: Number(row.id),
    subject: row.subject,
    seen_day: row.seen_at.toISOString().slice(0, 10),
    published_day: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
    readable: isReadable(row),
  }));

  writeFileSync(join(dataDirectory(), "articles.json"), JSON.stringify(articles));
  const check = checkAgainstSourceReview(articles);
  console.log(`${result.rows.length} rows read, ${articles.length} counted; first ${articles[0].seen_day}, last ${articles.at(-1).seen_day}`);
  console.log(`checked against the source review's file: ${check.compared} articles in both, ${check.disagreements} readable verdicts differ`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
