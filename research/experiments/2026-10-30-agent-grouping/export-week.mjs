// Exports one week of v0's live claims for agents to read: every claim with a
// reading published that week, all its readings with headline, extract and
// body, and the maintainer's grouping marks on them. Read-only: the session is
// set to refuse writes. The output holds article text, so it goes to data/
// (git-ignored) and never into the repository.
//
// Usage, from the repository root:
//   DATABASE_URL=$(grep '^V0_EDITOR_DATABASE_URL=' .env.v0 | cut -d= -f2-) \
//     node research/experiments/2026-10-30-agent-grouping/export-week.mjs 2026-09-28

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../v0/package.json"));
const pg = require("pg");

const BODY_MAX = 6000;
const monday = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("give the week's Monday, such as 2026-09-28");

/**
 * Runs the export.
 *
 * @returns Nothing; writes data/week-<monday>.json.
 */
async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  const rows = async (sql, values = []) => (await client.query(sql, values)).rows;

  // The claims with a reading published in the Pacific week.
  const claims = await rows(
    `SELECT DISTINCT cn.id, cn.fighter, cn.label, cn.current_label, cn.first_published, cn.last_published
     FROM claim_now cn JOIN reading_now rn ON rn.claim_id = cn.id
     WHERE (rn.published_at AT TIME ZONE 'America/Los_Angeles')::date >= $1::date
       AND (rn.published_at AT TIME ZONE 'America/Los_Angeles')::date < $1::date + 7
     ORDER BY cn.fighter, cn.first_published`,
    [monday],
  );
  const ids = claims.map((claim) => claim.id);

  // Every reading of those claims, with its text and what the stations said.
  const readings = await rows(
    `SELECT rn.claim_id, rn.reading_id, rn.published_at, rn.outlet, rn.headline, rn.url,
            rn.extract, rn.classification->>'fact' AS fact, rn.classification->>'firmness' AS firmness,
            rn.pick->'raw'->'answers'->'story'->'probabilities' AS odds, a.body
     FROM reading_now rn JOIN articles a ON a.id = rn.article_id
     WHERE rn.claim_id = ANY($1::bigint[]) ORDER BY rn.published_at`,
    [ids],
  );

  // The maintainer's marks on them: the newest per reading and claim, and same-claim links.
  const marks = await rows(
    `SELECT DISTINCT ON (claim_id, reading_id) claim_id, reading_id, verdict, belongs_in_claim_id, note
     FROM review_readings WHERE claim_id = ANY($1::bigint[]) ORDER BY claim_id, reading_id, id DESC`,
    [ids],
  );
  const links = await rows(
    `SELECT DISTINCT ON (claim_id, other_claim_id) claim_id, other_claim_id, verdict, note
     FROM review_same_claims WHERE claim_id = ANY($1::bigint[]) OR other_claim_id = ANY($1::bigint[])
     ORDER BY claim_id, other_claim_id, id DESC`,
    [ids],
  );
  const notes = await rows(
    `SELECT DISTINCT ON (claim_id) claim_id, note FROM review_claim_notes WHERE claim_id = ANY($1::bigint[]) ORDER BY claim_id, id DESC`,
    [ids],
  );
  await client.end();

  // One file: claims with their readings inside, marks beside.
  const byClaim = Object.groupBy(readings, (reading) => reading.claim_id);
  const out = {
    week: monday,
    exported_at: new Date().toISOString(),
    claims: claims.map((claim) => ({
      ...claim,
      readings: (byClaim[claim.id] ?? []).map(({ claim_id, body, ...reading }) => ({ ...reading, body: body ? body.slice(0, BODY_MAX) : null })),
    })),
    anton: {
      marks: marks.filter((mark) => mark.verdict !== "cleared"),
      links: links.filter((link) => link.verdict === "same_claim"),
      notes: notes.filter((note) => note.note),
    },
  };
  const file = join(here, "data", `week-${monday}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`${out.claims.length} claims, ${readings.length} readings, ${out.anton.marks.length} marks, ${out.anton.links.length} links → ${file}`);
}

await main();
