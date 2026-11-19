// Step 3 of the review: turns the reading calls in calls.json (the reviewing
// agent's own, not the maintainer's) and the numbers stored with each join into
// one class per claim, and counts them. The classes, tested in this order:
//
//   judges wrong  on reading, the entering article and the founding article
//                 report one story (same fact, docs/goals.md G3), so no foreign
//                 article entered. Needs a call, not numbers.
//   cannot tell   the stored rows do not show it. Needs a call.
//   stale leader  at the crossing, the label shown to the picker did not
//                 describe what the claim held. Needs a call (label_fits: false).
//   chain         the entering article was far from the claim's first and
//                 label-defining readings and nearest to a later member, by the
//                 numbers (trace-claims.mjs, joinFeatures).
//   wrong pick    anything else: the picker took the entering article for the
//                 claim's story.
//
// The crossing is the first article, in the order they joined, that reports a
// different story from the claim's first article. By default it is the first
// reading whose status (called out by two judges, or not) differs from the
// first reading's; calls.json may name another reading where the judges split
// on which story the first reading belongs to.
//
// Usage: node research/experiments/2026-11-18-chaining-review/classify-claims.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, OUT_DATA, loadJudged, readJson } from "./load-judged.mjs";
import { loadReaderCareerEvents } from "./readers-career.mjs";
import { firstForeignSummary, joinFeatures, traceClaim } from "./trace-claims.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLASSES = ["chain", "stale_leader", "wrong_pick", "judges_wrong", "cannot_tell"];

/**
 * The class of one claim from the reading call and the join numbers.
 *
 * @param call  The reviewing agent's call on the claim.
 * @param summary  The join features at the crossing.
 * @returns One of the five classes.
 */
export function classOf(call, summary) {
  if (call.verdict === "same_story") return "judges_wrong";
  if (call.verdict === "cannot_tell") return "cannot_tell";
  if (call.label_fits === false) return "stale_leader";
  return summary.passes_chain_test ? "chain" : "wrong_pick";
}

/**
 * The median of a list of numbers.
 *
 * @param numbers  The numbers.
 * @returns The median, or null for an empty list.
 */
export function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Counts a list by a key.
 *
 * @param rows  The rows.
 * @param keyOf  Gives each row's key.
 * @returns An object from key to count, in descending order.
 */
export function countBy(rows, keyOf) {
  const counts = {};
  for (const row of rows) counts[keyOf(row)] = (counts[keyOf(row)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((first, second) => second[1] - first[1]));
}

/**
 * Builds one classified row per claim on the reading list.
 *
 * @returns The rows (ids, numbers, the agent's call and class), without article text.
 */
function buildRows() {
  const calls = readJson(join(here, "calls.json"));
  const raw = readJson(join(OUT_DATA, "claims-raw.json"));
  const list = readJson(join(OUT_DATA, "mixed-claims.json"));
  const { joined, cores, pipeline } = loadJudged();
  const career = loadReaderCareerEvents();
  const callsByReading = new Map(joined.readings.map((entry) => [entry.reading_id, entry]));
  const rows = [];
  for (const summaryOfClaim of list.detail) {
    const claimId = summaryOfClaim.claim_id;
    const call = calls[claimId];
    if (!call) throw new Error(`no call for claim ${claimId}`);
    const claimCores = Object.fromEntries(MODELS.map((model) => [model, cores[model][claimId]]));
    const trace = traceClaim(claimId, raw[claimId], callsByReading, claimCores, { pipeline, career });

    // The crossing: the call's reading when it names one, else the first reading of the other status.
    const override = call.crossing ? trace.entries.findIndex((entry) => entry.reading_id === call.crossing) : null;
    if (call.crossing && override < 1) throw new Error(`claim ${claimId}: crossing reading ${call.crossing} not found`);
    const summary = firstForeignSummary(trace.entries, override);
    if (!summary) throw new Error(`claim ${claimId}: no crossing`);
    rows.push({
      claim_id: claimId,
      fighter: trace.fighter,
      set: summaryOfClaim.set,
      readings: trace.entries.length,
      foreign_readings: trace.entries.filter((entry) => entry.foreign).length,
      class: classOf(call, summary),
      crossing: { ...summary, crossing_chosen_by: call.crossing ? "call" : "judges' status" },
      foreign_kind: call.foreign_kind,
      rule_question: call.rule_question,
      career_event: call.career_event,
      tags: call.tags,
      note: call.note,
      claim_posted: trace.entries.some((entry) => entry.posted_at),
    });
  }
  return rows;
}

/**
 * Counts the classified rows.
 *
 * @param rows  The classified rows.
 * @returns The counts the README quotes.
 */
export function summarise(rows) {
  const mixed = rows.filter((row) => row.class !== "judges_wrong" && row.class !== "cannot_tell");
  const band = (confidence) => (confidence < 0.5 ? "below 0.5" : confidence < 0.8 ? "0.5 to 0.8" : confidence < 0.95 ? "0.8 to 0.95" : "0.95 and above");
  const loose = (row) => row.crossing.members_before >= 3 && !row.crossing.nearest_is_anchor && row.crossing.best_anchor_similarity < 0.85 && row.crossing.margin_over_anchors >= 0.03;
  const sorted = (key) => (rowsOf) => rowsOf.map((row) => row.crossing[key]).filter((value) => value !== null && value !== undefined);
  return {
    claims_read: rows.length,
    largest_claims_read: rows.filter((row) => row.set === "largest").length,
    sampled_claims_read: rows.filter((row) => row.set === "sampled").length,
    by_class: countBy(rows, (row) => row.class),
    by_class_and_fighter: countBy(rows, (row) => `${row.fighter} | ${row.class}`),
    by_fighter: countBy(rows, (row) => row.fighter),
    foreign_kind_of_mixed: countBy(mixed, (row) => row.foreign_kind),
    rule_question_of_mixed: countBy(mixed.filter((row) => row.rule_question !== 0), (row) => `question ${row.rule_question}`),
    mixed_not_resting_on_an_unruled_question: mixed.filter((row) => row.rule_question === 0).length,
    crossing_confidence_bands: countBy(mixed, (row) => band(row.crossing.confidence)),
    crossing_confidence_median: median(sorted("confidence")(mixed)),
    crossing_none_probability_median: median(sorted("none_probability")(mixed)),
    crossing_anchor_similarity_median: median(sorted("best_anchor_similarity")(mixed)),
    crossing_nearest_similarity_median: median(sorted("nearest_similarity")(mixed)),
    crossing_nearest_is_anchor: mixed.filter((row) => row.crossing.nearest_is_anchor).length,
    crossing_passing_chain_test: mixed.filter((row) => row.crossing.passes_chain_test).length,
    crossing_passing_looser_chain_test: mixed.filter(loose).length,
    crossing_with_fewer_than_three_members_before: mixed.filter((row) => row.crossing.members_before < 3).length,
    crossing_more_than_14_days_after_first_reading: mixed.filter((row) => row.crossing.days_after_first_reading > 14).length,
    crossing_judges_target_on_shortlist: countBy(mixed, (row) => String(row.crossing.judges_target_on_shortlist)),
    crossing_extract_overlaps_label_at_least_half: mixed.filter((row) => row.crossing.extract_label_overlap >= 0.5).length,
    claims_where_other_story_grew: mixed.filter((row) => row.crossing.later_same_status >= 1).length,
    claims_where_other_story_grew_by_3_or_more: mixed.filter((row) => row.crossing.later_same_status >= 3).length,
    grown_claims_with_most_later_readings_nearest_the_other_story: mixed.filter((row) => row.crossing.later_same_status >= 3 && row.crossing.later_same_status_nearest_same_status >= row.crossing.later_same_status / 2).length,
    claims_with_a_later_join_passing_the_chain_test: mixed.filter((row) => row.crossing.later_joins_passing_chain_test >= 1).length,
    claims_where_label_moved_onto_the_entering_story: mixed.filter((row) => row.crossing.label_moved_to_other_story).length,
    label_moved_onto_a_foreign_story_after_a_core_founder: mixed.filter((row) => row.crossing.label_moved_to_other_story && !row.crossing.founder_is_foreign).length,
    label_moved_onto_the_core_after_a_foreign_founder: mixed.filter((row) => row.crossing.label_moved_to_other_story && row.crossing.founder_is_foreign).length,
    career_event_swallowed: countBy(rows.filter((row) => row.career_event), (row) => row.career_event),
    tags: countBy(rows.flatMap((row) => row.tags.map((tag) => ({ tag }))), (row) => row.tag),
    claims_with_a_posted_reading: rows.filter((row) => row.claim_posted).length,
  };
}

/**
 * Runs the classification and writes results/classification.json.
 *
 * @returns Nothing.
 */
function main() {
  const rows = buildRows();
  const counts = summarise(rows);
  const publicRows = rows.map((row) => ({ ...row, crossing: Object.fromEntries(Object.entries(row.crossing).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(3)) : value])) }));
  writeFileSync(join(here, "results", "classification.json"), JSON.stringify({ counts, claims: publicRows }, null, 1) + "\n");
  console.log(JSON.stringify(counts, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
