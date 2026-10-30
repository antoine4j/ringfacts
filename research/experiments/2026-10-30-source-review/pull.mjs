// Step 1: production's articles of the 90 days to 30 October, read once. For each
// article: its outlet (the host of the address it resolved to, or the
// outlet name Google gave when it never resolved), how production's reader
// fared, and whether the stored text passes v0's readable bar (at least 400
// characters from a reading rung, naming the article's fighter). Mshale, a
// spam site production holds, is left out. Read-only, through the v0_feed
// role (it can only read production's items).
//
//   node --env-file=../../../.env.v0 pull.mjs
//
// Writes data/items.json (git-ignored: it holds headlines and addresses).
// The article text itself is not saved; only its length and the name check.

import { writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

const WINDOW_DAYS = 90;
// The window's end, fixed so a re-run reads the same articles: the last one
// production had stored when this experiment first pulled (30 Oct 2026, UTC).
export const WINDOW_END = "2026-10-30T04:17:29Z";
const MIN_READABLE_CHARS = 400;
// The reader's rungs that mean "text was read"; everything else is a failure kind.
const READING_RUNGS = new Set(["feed-content", "json-ld", "article-tag", "paragraphs"]);

/**
 * The outlet an article belongs to: the host of its real address without
 * "www.", or Google's outlet name when the address never resolved.
 *
 * @param {{url: string, resolved_url: string|null, source: string|null}} row
 * @returns {string}
 */
export function outletOf(row) {
  const address = row.resolved_url ?? row.url;
  const isWrapped = !address || address.includes("news.google.com");
  if (isWrapped) return `(name) ${(row.source ?? "unknown").trim()}`;
  return new URL(address).host.replace(/^www\./, "");
}

/**
 * Whether production's stored text passes v0's readable bar for the article's fighter.
 *
 * @param {{body: string|null, body_via: string|null, subject: string}} row
 * @returns {boolean}
 */
function isReadable(row) {
  const fromReadingRung = READING_RUNGS.has(row.body_via);
  const longEnough = (row.body ?? "").length >= MIN_READABLE_CHARS;
  const matchNames = SUBJECTS.find((subject) => subject.name === row.subject).matchNames;
  return fromReadingRung && longEnough && mentionsName(row.body, matchNames);
}

/**
 * Reads the window's articles and writes the per-article facts the other steps count.
 */
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.V0_FEED_DATABASE_URL });
  const result = await pool.query(
    `SELECT id, url, resolved_url, subject, title, source, published_at, seen_at,
            body, body_via, found_via, held_reason, story_id
     FROM items
     WHERE source NOT ILIKE '%mshale%'
       AND seen_at > $2::timestamptz - make_interval(days => $1)
       AND seen_at <= $2::timestamptz
     ORDER BY id`,
    [WINDOW_DAYS, WINDOW_END],
  );
  await pool.end();

  // One record per article, the text replaced by its length and the readable verdict.
  const items = result.rows.map((row) => ({
    id: Number(row.id),
    subject: row.subject,
    outlet: outletOf(row),
    address: row.resolved_url ?? row.url,
    feed_url: row.url,
    title: row.title,
    source: row.source,
    published_at: row.published_at,
    seen_at: row.seen_at,
    body_via: row.body_via ?? "none",
    body_chars: (row.body ?? "").length,
    readable: isReadable(row),
    found_via: row.found_via,
    held_reason: row.held_reason ? row.held_reason.split(":")[0] : null,
    story_id: row.story_id === null ? null : Number(row.story_id),
  }));

  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./data/items.json", import.meta.url), JSON.stringify(items, null, 1));
  console.log(`${items.length} articles, seen ${items[0].seen_at.toISOString()} to ${items.at(-1).seen_at.toISOString()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
