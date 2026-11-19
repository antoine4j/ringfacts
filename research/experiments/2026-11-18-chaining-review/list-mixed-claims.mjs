// Step 1 of the review: which pipeline claims do the judges say hold more than
// one story, and which of them are read by hand. Writes the counts and claim ids
// (no article text) to results/mixed-claims.json and the same list with
// headlines to the git-ignored data folder.
//
// The rule: a claim is "mixed" when at least two of the three judges each call
// at least one of its readings "does not belong" or "its own claim". Under the
// all-three rule every judge does. The foreign readings of a mixed claim are
// the ones at least two judges call out.
//
// Usage: node research/experiments/2026-11-18-chaining-review/list-mixed-claims.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAST_WEEK, MODELS, OUT_DATA, loadJudged } from "./load-judged.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SEED = 20261118;
const LARGEST = 20;
const SAMPLE = 40;

/**
 * A small seeded random number generator (mulberry32), so the sample is the same on every run.
 *
 * @param seed  The seed.
 * @returns A function that returns a number in [0, 1) each call.
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Whether a judge's call on a reading says it does not belong in its claim.
 *
 * @param call  One judge's call, or undefined when that judge made none.
 * @returns True for "does not belong" and "own claim".
 */
function isOut(call) {
  return Boolean(call) && call.verdict !== "belongs";
}

/**
 * Groups the joined reading calls by claim and works out, for each claim, which judges call a reading out and which readings at least two judges call out.
 *
 * @param claims  Claims by id, with their readings.
 * @param joined  The joined calls.
 * @returns One record per claim that has any call.
 */
export function summariseClaims(claims, joined) {
  const entriesByClaim = Object.groupBy(joined.readings, (entry) => entry.claim_id);
  const summaries = [];
  for (const [claimId, entries] of Object.entries(entriesByClaim)) {
    const claim = claims.get(claimId);
    const judgesCallingOut = MODELS.filter((model) => entries.some((entry) => isOut(entry.calls[model])));
    const foreignReadings = entries.filter((entry) => MODELS.filter((model) => isOut(entry.calls[model])).length >= 2).map((entry) => entry.reading_id);
    const disputedReadings = entries.filter((entry) => MODELS.filter((model) => isOut(entry.calls[model])).length === 1).map((entry) => entry.reading_id);
    const unanimousForeign = entries.filter((entry) => MODELS.every((model) => isOut(entry.calls[model]))).map((entry) => entry.reading_id);
    summaries.push({ claim_id: claimId, fighter: claim.fighter, readings: claim.readings.length, judges_calling_out: judgesCallingOut, foreign: foreignReadings, disputed: disputedReadings, unanimous_foreign: unanimousForeign });
  }
  return summaries;
}

/**
 * Picks the claims read by hand: the largest by article count, then a seeded random sample of the rest.
 *
 * @param mixed  The mixed claims' summaries.
 * @returns The largest and the sampled claims, each in claim-id order.
 */
export function chooseReadingSet(mixed) {
  const bySize = [...mixed].sort((first, second) => second.readings - first.readings || Number(first.claim_id) - Number(second.claim_id));
  const largest = bySize.slice(0, LARGEST);
  const rest = bySize.slice(LARGEST).sort((first, second) => Number(first.claim_id) - Number(second.claim_id));
  const random = seededRandom(SEED);
  const pool = [...rest];
  const sampled = [];
  while (sampled.length < SAMPLE && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    sampled.push(pool.splice(index, 1)[0]);
  }
  const byId = (first, second) => Number(first.claim_id) - Number(second.claim_id);
  return { largest: largest.sort(byId), sampled: sampled.sort(byId) };
}

/**
 * Runs the listing and writes both files.
 *
 * @returns Nothing; writes results/mixed-claims.json and data/mixed-claims.json.
 */
function main() {
  const { weeks, claims, joined } = loadJudged();
  const summaries = summariseClaims(claims, joined);
  const mixed = summaries.filter((summary) => summary.judges_calling_out.length >= 2);
  const allThree = summaries.filter((summary) => summary.judges_calling_out.length === 3);
  const twoJudgesSameReading = summaries.filter((summary) => summary.foreign.length > 0);
  const allThreeSameReading = summaries.filter((summary) => summary.unanimous_foreign.length > 0);
  const { largest, sampled } = chooseReadingSet(mixed);
  const perFighter = Object.fromEntries([...new Set(summaries.map((summary) => summary.fighter))].sort().map((fighter) => [fighter, { claims: summaries.filter((summary) => summary.fighter === fighter).length, mixed: mixed.filter((summary) => summary.fighter === fighter).length }]));
  const counts = {
    weeks: { first: weeks[0], last: weeks.at(-1), count: weeks.length, left_out: `weeks after ${LAST_WEEK}` },
    claims: summaries.length,
    readings: joined.readings.length,
    mixed_two_or_more_judges: mixed.length,
    mixed_all_three_judges: allThree.length,
    mixed_two_judges_same_reading: twoJudgesSameReading.length,
    mixed_three_judges_same_reading: allThreeSameReading.length,
    per_fighter: perFighter,
    rule: "mixed = at least two of the three judges each call at least one reading of the claim out (does not belong or own claim); foreign readings = called out by at least two judges",
    selection: { seed: SEED, largest_by_article_count: LARGEST, random_sample_of_rest: SAMPLE, largest: largest.map((summary) => summary.claim_id), sampled: sampled.map((summary) => summary.claim_id) },
  };
  mkdirSync(join(here, "results"), { recursive: true });
  mkdirSync(OUT_DATA, { recursive: true });
  writeFileSync(join(here, "results", "mixed-claims.json"), JSON.stringify(counts, null, 1) + "\n");
  const detail = [...largest, ...sampled].map((summary) => ({ ...summary, set: largest.includes(summary) ? "largest" : "sampled" }));
  writeFileSync(join(OUT_DATA, "mixed-claims.json"), JSON.stringify({ counts, detail }, null, 1));
  console.log(JSON.stringify({ ...counts, selection: { ...counts.selection, largest: largest.length, sampled: sampled.length } }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
