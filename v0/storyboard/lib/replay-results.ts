// The golden replay's stored results (scoreboard D7): one JSON file per run in
// v0/pipeline/measure/replay-results/, committed after a station change. The
// storyboard reads them from disk; they change only when a push builds, so the
// scores page's reference section is fixed between pushes.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §1 and §7.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Where the result files are, from the storyboard's folder (the working directory locally and on Vercel). */
const RESULTS_FOLDER = path.join(process.cwd(), "../pipeline/measure/replay-results");

/**
 * The result files' names, oldest first. Each name starts with the run's
 * time, so sorting by name sorts by time.
 *
 * @returns The names, such as "2026-10-05T1019-earliest-on-tie.json".
 */
export function resultFiles(): string[] {
  return readdirSync(RESULTS_FOLDER).filter((name) => name.endsWith(".json")).sort();
}

/**
 * One result file, parsed.
 *
 * @param name  A name from resultFiles.
 * @returns The file's JSON.
 */
export function readResultFile(name: string): unknown {
  return JSON.parse(readFileSync(path.join(RESULTS_FOLDER, name), "utf8"));
}

/** How many of how many. */
export type Count = { count: number; of: number };

/** The versions a run used; null for a file written before they were recorded. */
export type Versions = { classifier: string | null; extractor: string | null; grouping: string | null; settings: string | null };

/** One side's scores (training, validation or test), as the page shows them. */
export type SideScores = {
  articles: number;
  allNineRight: Count;
  rightPerQuestion: Record<string, number>;
  g1Recognised: Count;
  g2FalseAlarms: Count;
  g4WeakerCalledOfficial: number;
  pairPrecision: number;
  pairRecall: number;
  pairs: { v0Same: number; ruledSame: number; bothSame: number } | null;
  ruledClaimsSplit: Count;
  v0ClaimsMixingRuled: Count;
  posting: { shouldPost: number; posted: number; v0Posts: number; notDue: number; postedTwice: number };
};

/** One replay run, read from its file. */
export type ReplayResult = { name: string; runDate: string; versions: Versions | null; sides: { training: SideScores; validation: SideScores; test: SideScores | null } };

/**
 * "8 of 9" as numbers.
 *
 * @param text  The scorer's "k of n".
 * @returns The two numbers.
 */
export function parseCount(text: string): Count {
  const match = /^(\d+) of (\d+)$/.exec(String(text).trim());
  if (!match) throw new Error(`not a "k of n" count: ${text}`);
  return { count: Number(match[1]), of: Number(match[2]) };
}

/**
 * One side of a result file, in the page's shape.
 *
 * @param side  The file's scores for training, validation or test.
 * @returns The side's scores.
 */
function parseSide(side: Record<string, Record<string, any>>): SideScores {
  const { classifier, grouping, posting } = side;
  const pairs = grouping.pairs ? { v0Same: grouping.pairs.v0_same, ruledSame: grouping.pairs.ruled_same, bothSame: grouping.pairs.both_same } : null;
  return {
    articles: classifier.articles,
    allNineRight: { count: classifier.all_nine_right, of: classifier.articles },
    rightPerQuestion: classifier.right_per_question,
    g1Recognised: parseCount(classifier.g1_career_stories_recognised),
    g2FalseAlarms: parseCount(classifier.g2_false_alarms),
    g4WeakerCalledOfficial: classifier.g4_weaker_called_official,
    pairPrecision: grouping.pair_precision,
    pairRecall: grouping.pair_recall,
    pairs,
    ruledClaimsSplit: { count: grouping.ruled_claims_split, of: grouping.ruled_claims },
    v0ClaimsMixingRuled: { count: grouping.v0_claims_mixing_ruled, of: grouping.v0_claims },
    posting: { shouldPost: posting.ruled_should_post, posted: posting.ruled_posted, v0Posts: posting.v0_posts, notDue: posting.v0_posts_not_due, postedTwice: posting.ruled_posted_more_than_once },
  };
}

/**
 * A result file in the page's shape.
 *
 * @param name  The file's name; its first ten characters are the run's day.
 * @param json  The file's content.
 * @returns The run.
 */
export function parseResult(name: string, json: unknown): ReplayResult {
  const file = json as { run_started_at?: string; versions?: Versions; scores: Record<string, Record<string, Record<string, any>>> };
  return {
    name,
    runDate: (file.run_started_at ?? name).slice(0, 10),
    versions: file.versions ?? null,
    sides: {
      training: parseSide(file.scores.training),
      validation: parseSide(file.scores.validation),
      test: file.scores.test ? parseSide(file.scores.test) : null,
    },
  };
}

/**
 * The newest run, shown in full, and the older ones, shown a line each.
 *
 * @param results  The runs, in any order.
 * @returns The newest by name, and the rest newest first.
 */
export function headlineAndHistory(results: ReplayResult[]): { headline: ReplayResult | null; history: ReplayResult[] } {
  const newestFirst = [...results].sort((one, other) => other.name.localeCompare(one.name));
  return { headline: newestFirst[0] ?? null, history: newestFirst.slice(1) };
}

/**
 * Every stored run, read and parsed.
 *
 * @returns The runs, in the order of resultFiles.
 */
export function replayResults(): ReplayResult[] {
  return resultFiles().map((name) => parseResult(name, readResultFile(name)));
}
