// What a grouping pill's percentage means, said in its tooltip: JEV's
// confidence in the story it picked, out of the shortlisted claims and "none
// of these" (a new claim), and the option it nearly picked instead.

/** A groupings.pick value: the claim picked (null for a new one), the confidence, and JEV's whole reply. */
export type GroupingPick = { claim?: number | null; confidence?: number; raw?: unknown };

/** Below this, a pick is flagged for checking. */
export const DOUBTFUL_BELOW = 0.5;

const NONE_OF_THESE = "none_of_these";

/**
 * The option the pick was chosen against, as JEV weighed it.
 *
 * @param raw  JEV's reply, as stored in pick.raw.
 * @returns Option → probability, or null when JEV was not asked.
 */
function probabilities(raw: unknown): Record<string, number> | null {
  const story = (raw as { answers?: { story?: { probabilities?: Record<string, number> } } } | null)?.answers?.story;
  return story?.probabilities ?? null;
}

/**
 * An option's name as a reader would say it.
 *
 * @param option  "claim_273" or "none_of_these".
 * @returns "claim #273" or "a new claim".
 */
function optionName(option: string): string {
  return option === NONE_OF_THESE ? "a new claim" : `claim #${option.replace("claim_", "")}`;
}

/**
 * The tooltip for a grouping pill.
 *
 * @param pick  The pick.
 * @returns What the percentage is, the runner-up, and a warning when it is low.
 */
export function pickExplanation(pick: GroupingPick): string {
  const joined = pick.claim !== null && pick.claim !== undefined;
  const options = probabilities(pick.raw);

  // No similar claim was found, so JEV was not asked.
  if (!options) {
    return joined ? "Joined this claim." : "No similar claim existed, so a new claim started without asking JEV: 100% means no choice was made.";
  }

  // What the percentage is, out of how many options.
  const shortlisted = Object.keys(options).filter((option) => option !== NONE_OF_THESE).length;
  const claims = shortlisted === 1 ? "the 1 most similar claim" : `the ${shortlisted} most similar claims`;
  const what = joined
    ? `JEV's confidence that this article reports the same story as this claim. It chose from ${claims} or "none of these" (a new claim).`
    : `JEV's confidence that this article is a new story, matching none of ${claims} it was shown.`;

  // The option it nearly picked.
  const picked = joined ? `claim_${pick.claim}` : NONE_OF_THESE;
  const [runnerUp, chance] = Object.entries(options).filter(([option]) => option !== picked).sort((a, b) => b[1] - a[1])[0] ?? [];
  const second = runnerUp ? ` Runner-up: ${optionName(runnerUp)} at ${Math.round(chance * 100)}%.` : "";

  const doubtful = typeof pick.confidence === "number" && pick.confidence < DOUBTFUL_BELOW ? " Below 50%: check this grouping." : "";
  return `${what}${second}${doubtful}`;
}
