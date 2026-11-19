// Exports v0's whole history for the three judges, one file per Pacific week:
// every claim with a reading published that week, all its readings with the
// full saved text, the readings of that week the pipeline never read (no saved
// text), and the maintainer's marks. The pipeline's own answers (classifier,
// extractor, grouping pick, tier, posting) go to a second file per week, so a
// reader's batch can be cut without them. Read-only: the session refuses
// writes. The output holds article text, so it goes to data/ (git-ignored).
//
// Usage, from the repository root (all weeks, or one Monday):
//   DATABASE_URL=$(grep '^V0_EDITOR_DATABASE_URL=' .env.v0 | cut -d= -f2-) \
//     node research/experiments/2026-11-05-three-judges/export.mjs [2026-09-28]

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../v0/package.json"));
const pg = require("pg");

const BODY_MAX = 10000;
const FIRST_MONDAY = "2026-07-27";
const only = process.argv[2];
if (only && !/^\d{4}-\d{2}-\d{2}$/.test(only)) throw new Error("give a Monday, such as 2026-09-28, or nothing for every week");

/**
 * The Mondays from the first week of the history to this week, Pacific.
 *
 * @param client  An open connection.
 * @returns ISO dates.
 */
async function mondays(client) {
  const { rows } = await client.query(
    `SELECT DISTINCT (date_trunc('week', published_at AT TIME ZONE 'America/Los_Angeles'))::date::text AS monday
     FROM reading_now WHERE published_at >= $1::date ORDER BY 1`,
    [FIRST_MONDAY],
  );
  return rows.map((row) => row.monday);
}

/**
 * Exports one week.
 *
 * @param client  An open, read-only connection.
 * @param monday  The week's Monday.
 * @returns Counts for the log line.
 */
async function exportWeek(client, monday) {
  const rows = async (sql, values = []) => (await client.query(sql, values)).rows;
  const inWeek = `(published_at AT TIME ZONE 'America/Los_Angeles')::date >= $1::date AND (published_at AT TIME ZONE 'America/Los_Angeles')::date < $1::date + 7`;

  // The claims with a reading published in the week.
  const claims = await rows(
    `SELECT DISTINCT cn.id, cn.fighter, cn.label, cn.current_label, cn.first_published, cn.last_published
     FROM claim_now cn JOIN reading_now rn ON rn.claim_id = cn.id
     WHERE ${inWeek.replaceAll("published_at", "rn.published_at")}
     ORDER BY cn.fighter, cn.first_published`,
    [monday],
  );
  const ids = claims.map((claim) => claim.id);

  // Every reading of those claims: what a reader needs, and apart from it what the pipeline said.
  const readings = await rows(
    `SELECT rn.claim_id, rn.reading_id, rn.article_id, rn.production_item_id, rn.published_at, rn.outlet, rn.headline, rn.url,
            rn.found_by, rn.body_via, a.body,
            rn.classifier_version, rn.classification, rn.extractor_version, rn.extract, rn.grouping_version, rn.pick,
            rn.tier, rn.cell, rn.settings_version, rn.posted_at
     FROM reading_now rn JOIN articles a ON a.id = rn.article_id
     WHERE rn.claim_id = ANY($1::bigint[]) ORDER BY rn.published_at, rn.reading_id`,
    [ids],
  );

  // The week's readings the pipeline never read: no saved text, or only a line of it.
  const unread = await rows(
    `SELECT rn.reading_id, rn.article_id, rn.production_item_id, rn.fighter, rn.published_at, rn.outlet, rn.headline, rn.url, rn.body_via, rn.stage, a.body
     FROM reading_now rn JOIN articles a ON a.id = rn.article_id
     WHERE rn.claim_id IS NULL AND ${inWeek.replaceAll("published_at", "rn.published_at")}
     ORDER BY rn.fighter, rn.published_at`,
    [monday],
  );

  // The maintainer's marks on the claims: the newest per reading and claim, same-claim links, notes, tier reviews.
  const marks = await rows(
    `SELECT DISTINCT ON (claim_id, reading_id) claim_id, reading_id, verdict, belongs_in_claim_id, note, created_at
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
  const tiers = await rows(
    `SELECT DISTINCT ON (claim_id) claim_id, tier_had, verdict, should_be_tier, note FROM review_tiers WHERE claim_id = ANY($1::bigint[]) ORDER BY claim_id, id DESC`,
    [ids],
  );

  // The week for the readers and judges: claims with their readings inside, text included.
  const byClaim = Object.groupBy(readings, (reading) => reading.claim_id);
  const forReading = ({ reading_id, article_id, production_item_id, published_at, outlet, headline, url, found_by, body_via, body }) => ({
    reading_id: String(reading_id), article_id: String(article_id), production_item_id: String(production_item_id), published_at, outlet, headline, url, found_by, body_via,
    body: body ? body.slice(0, BODY_MAX) : null, body_chars: body ? body.length : 0,
  });
  const week = {
    week: monday,
    exported_at: new Date().toISOString(),
    claims: claims.map((claim) => ({ ...claim, id: String(claim.id), readings: (byClaim[claim.id] ?? []).map(forReading) })),
    unread: unread.map((reading) => ({ ...forReading(reading), fighter: reading.fighter, stage: reading.stage })),
    anton: {
      marks: marks.filter((mark) => mark.verdict !== "cleared").map((mark) => ({ ...mark, claim_id: String(mark.claim_id), reading_id: String(mark.reading_id), belongs_in_claim_id: mark.belongs_in_claim_id ? String(mark.belongs_in_claim_id) : null })),
      links: links.filter((link) => link.verdict === "same_claim").map((link) => ({ ...link, claim_id: String(link.claim_id), other_claim_id: String(link.other_claim_id) })),
      notes: notes.filter((note) => note.note).map((note) => ({ ...note, claim_id: String(note.claim_id) })),
      tiers: tiers.filter((tier) => tier.verdict !== "cleared").map((tier) => ({ ...tier, claim_id: String(tier.claim_id) })),
    },
  };

  // What the pipeline said about each reading, kept apart so no batch carries it.
  const pipeline = {
    week: monday,
    readings: readings.map((reading) => ({
      reading_id: String(reading.reading_id), claim_id: String(reading.claim_id),
      classifier_version: reading.classifier_version, classification: reading.classification,
      extractor_version: reading.extractor_version, extract: reading.extract,
      grouping_version: reading.grouping_version, pick: reading.pick,
      tier: reading.tier, cell: reading.cell, settings_version: reading.settings_version, posted_at: reading.posted_at,
    })),
  };

  const folder = join(here, "data", "history");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `week-${monday}.json`), JSON.stringify(week, null, 1));
  writeFileSync(join(folder, `pipeline-${monday}.json`), JSON.stringify(pipeline, null, 1));
  return { claims: claims.length, readings: readings.length, unread: unread.length, marks: week.anton.marks.length };
}

/**
 * Runs the export.
 *
 * @returns Nothing; writes data/history/week-<monday>.json and pipeline-<monday>.json.
 */
async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  const weeks = only ? [only] : await mondays(client);
  for (const monday of weeks) {
    const counts = await exportWeek(client, monday);
    console.log(`${monday}: ${counts.claims} claims, ${counts.readings} readings, ${counts.unread} unread, ${counts.marks} marks`);
  }
  await client.end();
}

await main();
