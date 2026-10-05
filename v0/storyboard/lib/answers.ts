// Why a reading got its tier, in the classifier's own words. The decisions
// table stores a cell name ("next_fight · reported", or "not about him" for
// the gate); this turns it back into the answers that made it, each in plain
// words with the classifier's definition, so no label of the storyboard's own
// stands between the reader and what the classifier said.

import QUESTIONS from "../../pipeline/stations/classifier/questions-v7.7.json" with { type: "json" };

/** The Decider's name for the gate's cell (decideTier in pipeline/settings/tiers.ts). */
export const GATE_CELL = "not about him";

/** One answer the tier rests on. */
export type Answer = { question: string; value: string; words: string; definition: string };

// v7.7's scored questions list their criteria lowest first, in this order.
const SCALES: Record<string, string[]> = {
  centrality: ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
  firmness: ["wish", "rumour", "reported", "official_or_done"],
};

// Plain words where the code name does not read as English.
const WORDS: Record<string, string> = {
  not_in_content: "absent from the text",
  one_of_several: "one of several",
  main_subject: "main subject",
  no_fact: "no new fact",
  fight_week_event: "fight-week event",
};

/**
 * One answer in plain words, with the classifier's definition of it.
 *
 * @param question  The question's handle: centrality, fact or firmness.
 * @param value  The answer's code name.
 * @returns The answer.
 */
export function describeAnswer(question: string, value: string): Answer {
  const words = WORDS[value] ?? value.replaceAll("_", " ");
  const criteria = (QUESTIONS as Record<string, { criteria?: unknown }>)[question]?.criteria;

  // A choice question keys its criteria by answer; a scored one lists them in scale order, as text or with a summary.
  let definition = "";
  if (Array.isArray(criteria)) {
    const criterion = criteria[SCALES[question]?.indexOf(value) ?? -1] as string | { summary?: string } | undefined;
    definition = typeof criterion === "string" ? criterion : (criterion?.summary ?? "");
  } else if (criteria) definition = (criteria as Record<string, { what?: string }>)[value]?.what ?? "";
  return { question, value, words, definition };
}

/**
 * The answers behind a decision: the gate's centrality answer, or the fact and
 * (when there is one to rate) the firmness.
 *
 * @param cell  The decision's cell name.
 * @param centrality  The reading's centrality answer, for a gate decision.
 * @returns The answers, in the order the Decider read them; empty for no cell.
 */
export function answersBehind(cell: string | null, centrality: string | null): Answer[] {
  if (!cell) return [];
  if (cell === GATE_CELL) return [describeAnswer("centrality", centrality ?? "only_mentioned")];
  const [fact, firmness] = cell.split(" · ");
  const answers = [describeAnswer("fact", fact)];
  if (firmness && firmness !== "none") answers.push(describeAnswer("firmness", firmness));
  return answers;
}

/**
 * The anchor of a cell's card on the settings page.
 *
 * @param cell  The cell name.
 * @returns For example "cell-next_fight--reported", or "cell-gate".
 */
export function cellAnchor(cell: string): string {
  return cell === GATE_CELL ? "cell-gate" : `cell-${cell.replace(" · ", "--")}`;
}
