// The settings page's arithmetic: what a draft tier map would change, and the
// checks a draft passes before it is saved. The tiers themselves come from the
// Decider's own code (pipeline/settings/tiers.ts), so the preview and the
// hourly job can never disagree about what a map means.

import { cellName, decideTier, FACTS_V7, FIRMNESS_V7, type DigestSchedule, type Settings, type Tier } from "../../pipeline/settings/tiers.ts";

/** What each tier is called on the page. */
export const TIER_NAMES: Record<Tier, string> = { 1: "Post", 2: "Digest", 3: "Drop" };

/** The weekday numbers a digest schedule uses, Sunday first, as JavaScript counts them. */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Readings that share the answers the map reads, counted together. */
export type AnswerGroup = { answers: Record<string, string>; readings: number };

/** Readings that a draft would move from one tier to another. */
export type Move = { from: Tier; to: Tier; readings: number };

/** One combination of "what new fact" and "how firm". */
export type Combination = { fact: string; firmness: string; cell: string };

/**
 * Every combination of classifier v7.7's two answers, in the order the page shows them.
 *
 * @returns Fact × firmness, each with its cell name.
 */
export function allCombinations(): Combination[] {
  const combinations: Combination[] = [];
  for (const fact of FACTS_V7) {
    for (const firmness of FIRMNESS_V7) {
      combinations.push({ fact, firmness, cell: cellName(fact, firmness) });
    }
  }
  return combinations;
}

/**
 * A copy of some settings with a different tier for some cells.
 *
 * @param settings  The settings to start from.
 * @param cells  Cell → tier, for the cells that change (or all of them).
 * @returns New settings; the original is untouched.
 */
export function withCells(settings: Settings, cells: Record<string, Tier>): Settings {
  const mergedCells = { ...settings.tiers.cells, ...cells };
  return { ...settings, tiers: { ...settings.tiers, cells: mergedCells } };
}

/**
 * What a draft changes: for the readings given, their tier under the current
 * settings and under the draft, both worked out by the Decider's own lookup.
 *
 * @param groups  Readings grouped by the answers the map reads.
 * @param current  The settings in force.
 * @param draft  The settings being drafted.
 * @returns One entry per (from, to) pair that changes, largest first.
 */
export function movesBetween(groups: AnswerGroup[], current: Settings, draft: Settings): Move[] {
  const byPair = new Map<string, Move>();

  // Decide every group twice and keep the ones whose tier differs.
  for (const group of groups) {
    const before = tierOrNothing(group.answers, current);
    const after = tierOrNothing(group.answers, draft);
    if (before === null || after === null || before === after) continue;
    const key = `${before}→${after}`;
    const move = byPair.get(key) ?? { from: before, to: after, readings: 0 };
    move.readings += group.readings;
    byPair.set(key, move);
  }

  // Largest move first, so the headline change is on top.
  const moves = [...byPair.values()];
  moves.sort((first, second) => second.readings - first.readings);
  return moves;
}

/**
 * One reading's tier, or nothing when the map has no cell for its answers.
 *
 * @param answers  The classifier's answers.
 * @param settings  The settings to apply.
 * @returns 1, 2 or 3; null when the Decider would refuse.
 */
function tierOrNothing(answers: Record<string, string>, settings: Settings): Tier | null {
  try {
    return decideTier(answers, settings.classifier_version, settings).tier;
  } catch {
    return null;
  }
}

/**
 * Checks a draft's cells as the page sent them: only known combinations, and
 * each tier 1, 2 or 3.
 *
 * @param input  The parsed draft.
 * @returns The cells, typed.
 */
export function checkCells(input: unknown): Record<string, Tier> {
  // The draft is an object of cell → tier.
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("the draft is not a map of cells");
  const known = new Set(allCombinations().map((combination) => combination.cell));
  const cells: Record<string, Tier> = {};

  // Every cell is one the page shows, with a tier the Decider knows.
  for (const [cell, tier] of Object.entries(input)) {
    if (!known.has(cell)) throw new Error(`unknown combination "${cell}"`);
    if (tier !== 1 && tier !== 2 && tier !== 3) throw new Error(`"${cell}" has tier ${String(tier)}, not 1, 2 or 3`);
    cells[cell] = tier;
  }

  // Nothing may be left unmapped.
  for (const cell of known) {
    if (!(cell in cells)) throw new Error(`"${cell}" has no tier`);
  }
  return cells;
}

/**
 * Checks a draft digest schedule: one entry per fighter, each a weekday, a
 * time and a real time zone.
 *
 * @param input  The parsed schedule.
 * @param fighters  The watched fighters.
 * @returns The schedule, typed.
 */
export function checkSchedule(input: unknown, fighters: string[]): Record<string, DigestSchedule> {
  // The schedule is an object of fighter → schedule.
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("the schedule is not a map of fighters");
  const entries = input as Record<string, Partial<DigestSchedule>>;
  const schedule: Record<string, DigestSchedule> = {};

  // Every watched fighter has a valid entry.
  for (const fighter of fighters) {
    const entry = entries[fighter];
    if (!entry) throw new Error(`${fighter} has no digest schedule`);
    schedule[fighter] = checkOneSchedule(fighter, entry);
  }
  return schedule;
}

/**
 * Checks one fighter's digest schedule.
 *
 * @param fighter  Whose schedule it is, for the error message.
 * @param entry  The schedule as sent.
 * @returns The schedule, typed.
 */
function checkOneSchedule(fighter: string, entry: Partial<DigestSchedule>): DigestSchedule {
  // Weekday 0 (Sunday) to 6 (Saturday), and a 24-hour time.
  const weekday = Number(entry.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error(`${fighter}: weekday must be 0 to 6`);
  const time = String(entry.time ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${fighter}: time must look like 07:00`);

  // A time zone the runtime knows; an unknown one makes Intl throw.
  const timezone = String(entry.timezone ?? "");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`${fighter}: "${timezone}" is not a time zone`);
  }
  return { every: "week", weekday, time, timezone };
}
