// The Decider (7): looks a reading's classifier answers up in the settings and
// returns its tier. Also used by the storyboard's settings page, so its preview
// and the pipeline are the same code.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 7.

export type Tier = 1 | 2 | 3;

/** The tier mapping, as stored in settings.tiers. */
export type TierMap = {
  gate: { question: string; notAboutHim: string[] };
  rows: string;
  columns: string;
  cells: Record<string, Tier>;
};

/** One fighter's digest schedule, as stored in settings.digest_schedule. */
export type DigestSchedule = { every: "week"; weekday: number; time: string; timezone: string };

/** A row of the settings table. */
export type Settings = {
  version: number;
  classifier_version: string;
  tiers: TierMap;
  digest_schedule: Record<string, DigestSchedule>;
};

// Classifier v7.7's options for the two questions the map is drawn on.
export const FACTS_V7 = ["result", "next_fight", "fight_week_event", "health", "career_move", "personal_life", "status_update", "no_fact", "none_of_these"];
export const FIRMNESS_V7 = ["official_or_done", "reported", "rumour", "wish", "none"];

/**
 * The name of one combination, as the settings page and the decisions table show it.
 *
 * @param fact  The "what new fact" answer.
 * @param firmness  The "how firm" answer.
 * @returns For example "next_fight · rumour".
 */
export function cellName(fact: string, firmness: string): string {
  return `${fact} · ${firmness}`;
}

/**
 * The starting map (D1): a result, or a next fight reported or official, posts;
 * everything else about him goes to the digest; not about him is dropped.
 *
 * @returns Every combination of v7.7's two answers, each with its tier.
 */
export function startingTierMap(): TierMap {
  const cells: Record<string, Tier> = {};
  for (const fact of FACTS_V7) {
    for (const firmness of FIRMNESS_V7) {
      const isResult = fact === "result";
      const isFirmNextFight = fact === "next_fight" && (firmness === "reported" || firmness === "official_or_done");
      cells[cellName(fact, firmness)] = isResult || isFirmNextFight ? 1 : 2;
    }
  }
  return {
    gate: { question: "centrality", notAboutHim: ["not_in_content", "only_mentioned"] },
    rows: "fact",
    columns: "firmness",
    cells,
  };
}

/**
 * The starting digest schedule (D24): Monday 07:00 Pacific for every fighter.
 *
 * @param fighters  The watched fighters' names.
 * @returns Fighter → schedule.
 */
export function startingSchedule(fighters: string[]): Record<string, DigestSchedule> {
  const schedule: Record<string, DigestSchedule> = {};
  for (const fighter of fighters) {
    schedule[fighter] = { every: "week", weekday: 1, time: "07:00", timezone: "America/Los_Angeles" };
  }
  return schedule;
}

/**
 * The tier of one reading under one settings version.
 *
 * @param answers  The classifier's answers, ties applied.
 * @param classifierVersion  The version that gave them.
 * @param settings  The settings to apply.
 * @returns The tier and the cell that gave it; "not about him" for the gate.
 */
export function decideTier(answers: Record<string, string>, classifierVersion: string, settings: Settings): { tier: Tier; cell: string } {
  // Settings name answers of one classifier version and mean nothing for another.
  if (classifierVersion !== settings.classifier_version) {
    throw new Error(`settings v${settings.version} are for classifier ${settings.classifier_version}, not ${classifierVersion}`);
  }

  // The gate: an article not about him is dropped, whatever it reports.
  const { gate, rows, columns, cells } = settings.tiers;
  if (gate.notAboutHim.includes(answers[gate.question])) return { tier: 3, cell: "not about him" };

  // Every other reading sits in exactly one cell; an unmapped cell is an error, never a guess.
  const cell = cellName(answers[rows], answers[columns]);
  const tier = cells[cell];
  if (tier === undefined) throw new Error(`settings v${settings.version} have no tier for "${cell}"`);
  return { tier, cell };
}
