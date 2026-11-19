// Step 2 of the review: for each claim read by hand, how it grew. Reads v0's
// tables with the session set read-only and writes, for every claim, its
// readings in the order they joined: the headline, outlet, dates, the extract's
// occasion and claim sentence, the classifier's firmness, the shortlist the
// picker was shown (with the label each claim had then), the pick and its
// confidence, and the embedding. The output holds article text, so it goes to
// the git-ignored data folder.
//
// Usage, from the repository root:
//   DATABASE_URL=$(grep '^V0_EDITOR_DATABASE_URL=' .env.v0 | cut -d= -f2-) \
//     node research/experiments/2026-11-18-chaining-review/export-claims.mjs

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT_DATA, readJson } from "./load-judged.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../v0/package.json"));
const pg = require("pg");

/**
 * Turns pgvector's text form into numbers.
 *
 * @param text  "[0.1,0.2,…]".
 * @returns The numbers.
 */
export function parseVector(text) {
  return JSON.parse(text);
}

/**
 * Reads every grouping row of one claim, newest grouping of each reading only, in the order they were written.
 *
 * @param client  An open, read-only connection.
 * @param claimId  The claim.
 * @returns The rows, with the claim's own record first.
 */
async function exportClaim(client, claimId) {
  const claim = (await client.query("SELECT id, fighter, label, first_reading_id, created_at FROM claims WHERE id = $1", [claimId])).rows[0];
  const rows = (
    await client.query(
      `SELECT DISTINCT ON (g.reading_id) g.id AS grouping_id, g.reading_id, g.version, g.created_at AS grouped_at, g.shortlist, g.pick, g.embedding::text AS embedding,
              a.headline, a.outlet, a.published_at, a.backfill, r.found_by,
              e.answers AS extract, c.answers AS classification
       FROM groupings g
       JOIN readings r ON r.id = g.reading_id
       JOIN articles a ON a.id = r.article_id
       JOIN extracts e ON e.id = g.extract_id
       LEFT JOIN LATERAL (SELECT answers FROM classifications WHERE reading_id = g.reading_id ORDER BY id DESC LIMIT 1) c ON true
       WHERE g.claim_id = $1
       ORDER BY g.reading_id, g.id DESC`,
      [claimId],
    )
  ).rows;
  const ordered = rows.sort((first, second) => Number(first.grouping_id) - Number(second.grouping_id));
  return { claim, rows: ordered.map((row) => ({ ...row, embedding: parseVector(row.embedding) })) };
}

/**
 * Exports every claim on the reading list.
 *
 * @returns Nothing; writes data/claims-raw.json.
 */
async function main() {
  const list = readJson(join(OUT_DATA, "mixed-claims.json"));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  const exported = {};
  for (const summary of list.detail) {
    exported[summary.claim_id] = await exportClaim(client, summary.claim_id);
  }
  await client.end();
  writeFileSync(join(OUT_DATA, "claims-raw.json"), JSON.stringify(exported));
  console.log(`${Object.keys(exported).length} claims, ${Object.values(exported).reduce((sum, item) => sum + item.rows.length, 0)} grouping rows`);
}

await main();
