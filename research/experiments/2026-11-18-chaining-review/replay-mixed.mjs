// The Launch Map card asks whether the 3 mixed claims of the golden replay
// (training side, saved run 2026-10-05T1019-earliest-on-tie) came from chains.
// This rebuilds them from the saved replay tables: for each v0 claim that holds
// more than one of the maintainer's ruled claims, the readings in the order they
// joined, which ruled claim each belongs to, the confidence and shortlist
// similarity stored with each join, and the nearest earlier member by the stored
// vectors. Writes the git-ignored data/replay-mixed.json (it holds headlines) and
// results/replay-mixed.json (ids and numbers only).
//
// Usage: node research/experiments/2026-11-18-chaining-review/replay-mixed.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT_DATA } from "./load-judged.mjs";
import { cosine, firstForeignSummary } from "./trace-claims.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SHARED = process.env.SHARED_CHECKOUT ?? "/Users/anton/Projects/fighter-bot";
const REPLAY = join(SHARED, "golden", "replays", "2026-10-05T1019-earliest-on-tie");
const GOLDEN = join(SHARED, "golden");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * Reads a table of the saved replay.
 *
 * @param name  The table's file name without extension.
 * @returns The rows.
 */
function table(name) {
  return read(join(REPLAY, `${name}.json`));
}

/**
 * Joins the saved tables into one record per replayed reading, in the order the readings were grouped.
 *
 * @returns Records with the golden article id, side, ruled claim, v0 claim, headline, date, vector, shortlist and pick.
 */
function replayedReadings() {
  const sideOf = read(join(GOLDEN, "split.json")).articles;
  const ruledClaimOf = {};
  for (const claim of read(join(GOLDEN, "claims.json")).claims) for (const article of claim.articles) ruledClaimOf[article] = claim.key;
  const articleOf = new Map(table("articles").map((row) => [String(row.id), row]));
  const readingOf = new Map(table("readings").map((row) => [String(row.id), row]));
  const extractOf = new Map(table("extracts").map((row) => [String(row.id), row]));
  const records = [];
  for (const grouping of table("groupings")) {
    const reading = readingOf.get(String(grouping.reading_id));
    const article = articleOf.get(String(reading.article_id));
    if (reading.found_by !== "production") continue;
    const goldenId = String(article.production_item_id);
    const vector = typeof grouping.embedding === "string" ? JSON.parse(grouping.embedding) : grouping.embedding;
    records.push({
      grouping_id: Number(grouping.id), reading_id: String(grouping.reading_id), golden_article: goldenId, side: sideOf[goldenId], ruled_claim: ruledClaimOf[goldenId],
      v0_claim: String(grouping.claim_id), published_at: article.published_at, headline: article.headline, outlet: article.outlet,
      claim_sentence: extractOf.get(String(grouping.extract_id))?.answers?.claim ?? null,
      shortlist: grouping.shortlist, pick: grouping.pick, vector,
    });
  }
  return records.sort((first, second) => first.grouping_id - second.grouping_id);
}

/**
 * The v0 claims of one side that hold readings of more than one ruled claim, with each join traced.
 *
 * @param records  Every replayed reading, in grouping order.
 * @param side  "tune" (the training side) or "check" (validation).
 * @returns The mixed claims, each with its readings in join order and the numbers stored with each join.
 */
export function mixedClaims(records, side) {
  const onSide = records.filter((record) => record.side === side);
  const byClaim = Object.groupBy(onSide, (record) => record.v0_claim);
  const mixed = [];
  for (const [claimId, members] of Object.entries(byClaim)) {
    const ruled = new Set(members.map((member) => member.ruled_claim));
    if (ruled.size < 2) continue;

    // The ruled claim most members belong to is the core; the others entered a claim that was not theirs.
    const sizes = Object.entries(Object.groupBy(members, (member) => member.ruled_claim)).map(([key, list]) => [key, list.length]).sort((first, second) => second[1] - first[1]);
    const core = sizes[0][0];
    const readings = members.map((member, position) => {
      const earlier = members.slice(0, position);
      const nearest = earlier.map((other, index) => ({ position: index, similarity: cosine(member.vector, other.vector) })).sort((first, second) => second.similarity - first.similarity)[0] ?? null;
      const toFirst = position > 0 ? cosine(member.vector, members[0].vector) : null;
      const candidate = member.shortlist.find((entry) => String(entry.claimId) === claimId);
      return {
        position, reading_id: member.reading_id, golden_article: member.golden_article, ruled_claim: member.ruled_claim, is_core: member.ruled_claim === core,
        published_at: member.published_at, headline: member.headline, claim_sentence: member.claim_sentence,
        confidence: member.pick.confidence, label_shown: candidate?.label ?? null, nearest, similarity_to_first: toFirst,
        shortlist_rank: candidate ? member.shortlist.indexOf(candidate) + 1 : null,
      };
    });

    // The crossing is the first reading of a ruled claim other than the first reading's; the join numbers come from the same test as the live claims.
    const crossing = members.findIndex((member) => member.ruled_claim !== members[0].ruled_claim);
    const entries = members.map((member, position) => ({
      position, reading_id: member.reading_id, published_at: member.published_at, headline: member.headline, claim_sentence: member.claim_sentence,
      vector: member.vector, foreign: member.ruled_claim !== members[0].ruled_claim, confidence: member.pick.confidence,
      none_probability: member.pick.raw?.answers?.story?.probabilities?.none_of_these ?? null,
      label_shown: readings[position].label_shown, closest_earlier: readings[position].nearest,
      shortlist_rank: readings[position].shortlist_rank, shortlist_size: member.shortlist.length, belongs_in: [], shortlist_ids: member.shortlist.map((entry) => String(entry.claimId)),
    }));
    const features = firstForeignSummary(entries, crossing);
    mixed.push({ v0_claim: claimId, ruled_claims: sizes, core, crossing, features, readings });
  }
  return mixed;
}

/**
 * Runs the rebuild for the training side and writes both files.
 *
 * @returns Nothing.
 */
function main() {
  const records = replayedReadings();
  const training = mixedClaims(records, "tune");
  const validation = mixedClaims(records, "check");
  mkdirSync(OUT_DATA, { recursive: true });
  mkdirSync(join(here, "results"), { recursive: true });
  writeFileSync(join(OUT_DATA, "replay-mixed.json"), JSON.stringify({ training, validation }, null, 1));
  const numbers = (list) => list.map((claim) => ({
    v0_claim: claim.v0_claim, ruled_claims: claim.ruled_claims, readings: claim.readings.length, crossing: claim.crossing,
    crossing_features: Object.fromEntries(Object.entries(claim.features).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(3)) : value])),
    joins: claim.readings.map((reading) => ({ position: reading.position, ruled_claim: reading.ruled_claim, is_core: reading.is_core, confidence: reading.confidence, shortlist_rank: reading.shortlist_rank, nearest_position: reading.nearest?.position ?? null, nearest_similarity: reading.nearest ? Number(reading.nearest.similarity.toFixed(3)) : null, similarity_to_first: reading.similarity_to_first === null ? null : Number(reading.similarity_to_first.toFixed(3)) })),
  }));
  writeFileSync(join(here, "results", "replay-mixed.json"), JSON.stringify({ run: "2026-10-05T1019-earliest-on-tie", training: numbers(training), validation: numbers(validation) }, null, 1) + "\n");
  console.log(`training: ${training.length} mixed claims; validation: ${validation.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
