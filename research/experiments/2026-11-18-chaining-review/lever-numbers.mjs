// Numbers for the observations section of the README: how confident the picker
// was on the entering articles against the right joins of the same claims, and
// how often the extract's event or opponent differed from the claim's first
// reading, for entering articles and for right joins. Observations only: the
// right joins counted are those of the 60 claims read, which are all mixed, so
// the rates are not the rate over every claim. Writes results/lever-numbers.json.
//
// Usage: node research/experiments/2026-11-18-chaining-review/lever-numbers.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT_DATA, readJson } from "./load-judged.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Whether two optional text values differ, ignoring case; null when either is missing.
 *
 * @param first  A value or null.
 * @param second  A value or null.
 * @returns True or false, or null when one side is empty.
 */
export function differs(first, second) {
  if (!first || !second) return null;
  return String(first).toLowerCase() !== String(second).toLowerCase();
}

/**
 * Counts how many of a list of confidences fall below a floor.
 *
 * @param confidences  The numbers.
 * @param floor  The floor.
 * @returns The count.
 */
export function below(confidences, floor) {
  return confidences.filter((confidence) => confidence < floor).length;
}

/**
 * Computes the numbers.
 *
 * @returns Nothing; writes the file and prints it.
 */
function main() {
  const classified = readJson(join(here, "results", "classification.json"));
  const raw = readJson(join(OUT_DATA, "claims-raw.json"));
  const traces = readJson(join(OUT_DATA, "claim-traces.json"));
  const entering = [];
  const enteringDiffers = [];
  const rightConfidences = [];
  const rightDiffers = [];
  for (const row of classified.claims) {
    if (row.class !== "wrong_pick" && row.class !== "chain") continue;
    const rows = raw[row.claim_id].rows;
    const first = rows[0].extract ?? {};
    const crossing = rows[row.crossing.position].extract ?? {};
    entering.push(row.crossing.confidence);
    const eventDiffers = differs(crossing.event, first.event);
    const opponentDiffers = differs(crossing.opponent, first.opponent);
    if (eventDiffers !== null || opponentDiffers !== null) enteringDiffers.push(Boolean(eventDiffers || opponentDiffers));

    // The right joins of the same claim: not called out by two judges, after the first reading.
    traces[row.claim_id].entries.forEach((entry, position) => {
      if (position === 0 || entry.foreign) return;
      rightConfidences.push(entry.confidence);
      const own = rows[position].extract ?? {};
      const eventOwn = differs(own.event, first.event);
      const opponentOwn = differs(own.opponent, first.opponent);
      if (eventOwn !== null || opponentOwn !== null) rightDiffers.push(Boolean(eventOwn || opponentOwn));
    });
  }
  const numbers = {
    entering_articles: entering.length,
    entering_below_0_8: below(entering, 0.8),
    entering_below_0_5: below(entering, 0.5),
    right_joins_in_the_same_claims: rightConfidences.length,
    right_joins_below_0_8: below(rightConfidences, 0.8),
    right_joins_below_0_5: below(rightConfidences, 0.5),
    entering_with_event_or_opponent_to_compare: enteringDiffers.length,
    entering_event_or_opponent_differs: enteringDiffers.filter(Boolean).length,
    right_joins_with_event_or_opponent_to_compare: rightDiffers.length,
    right_joins_event_or_opponent_differs: rightDiffers.filter(Boolean).length,
  };
  writeFileSync(join(here, "results", "lever-numbers.json"), JSON.stringify(numbers, null, 1) + "\n");
  console.log(numbers);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
