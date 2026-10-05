// The numbers behind the daily counts (10.2): per fighter, what each station
// did between two moments, what is waiting now, and what the runs cost.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, sections 12 and 13.

import type pg from "pg";

// JEV's price per input token, as the classifier experiments measured it.
const JEV_DOLLARS_PER_TOKEN = 0.042 / 1e6;

/** One fighter's day. */
export type FighterDay = {
  fighter: string;
  readings: number;
  noBody: number;
  classified: number;
  newClaims: number;
  joins: number;
  tier1: number;
  tier2: number;
  tier3: number;
  posted: number;
  waiting: number;
  stuck: number;
};

/**
 * Each fighter's numbers for a period, and what waits or is stuck now.
 *
 * @param pool  The v0 pool.
 * @param from  The start.
 * @param to  The end.
 * @returns One row per fighter.
 */
export async function fighterDays(pool: pg.Pool, from: Date, to: Date): Promise<FighterDay[]> {
  const result = await pool.query(
    `SELECT f.name AS fighter,
       (SELECT count(*) FROM readings r WHERE r.fighter = f.name AND r.created_at >= $1 AND r.created_at < $2)::int AS readings,
       (SELECT count(*) FROM readings r WHERE r.fighter = f.name AND r.stage = 'no_body' AND r.created_at >= $1 AND r.created_at < $2)::int AS no_body,
       (SELECT count(*) FROM classifications c JOIN readings r ON r.id = c.reading_id WHERE r.fighter = f.name AND c.created_at >= $1 AND c.created_at < $2)::int AS classified,
       (SELECT count(*) FROM claims cl WHERE cl.fighter = f.name AND cl.created_at >= $1 AND cl.created_at < $2)::int AS new_claims,
       (SELECT count(*) FROM groupings g JOIN readings r ON r.id = g.reading_id WHERE r.fighter = f.name AND g.created_at >= $1 AND g.created_at < $2)::int AS groupings,
       (SELECT count(*) FROM decisions d JOIN readings r ON r.id = d.reading_id WHERE r.fighter = f.name AND d.tier = 1 AND d.created_at >= $1 AND d.created_at < $2)::int AS tier1,
       (SELECT count(*) FROM decisions d JOIN readings r ON r.id = d.reading_id WHERE r.fighter = f.name AND d.tier = 2 AND d.created_at >= $1 AND d.created_at < $2)::int AS tier2,
       (SELECT count(*) FROM decisions d JOIN readings r ON r.id = d.reading_id WHERE r.fighter = f.name AND d.tier = 3 AND d.created_at >= $1 AND d.created_at < $2)::int AS tier3,
       (SELECT count(*) FROM readings r WHERE r.fighter = f.name AND r.posted_at >= $1 AND r.posted_at < $2)::int AS posted,
       (SELECT count(*) FROM readings r WHERE r.fighter = f.name AND r.stage IN ('classify', 'extract', 'group', 'decide'))::int AS waiting,
       (SELECT count(*) FROM readings r WHERE r.fighter = f.name AND r.stage = 'stuck')::int AS stuck
     FROM fighters f ORDER BY f.name`,
    [from, to],
  );
  return result.rows.map((row) => ({
    fighter: row.fighter, readings: row.readings, noBody: row.no_body, classified: row.classified, newClaims: row.new_claims,
    joins: row.groupings - row.new_claims, tier1: row.tier1, tier2: row.tier2, tier3: row.tier3, posted: row.posted, waiting: row.waiting, stuck: row.stuck,
  }));
}

/**
 * What the hourly runs did and cost between two moments.
 *
 * @param pool  The v0 pool.
 * @param from  The start.
 * @param to  The end.
 * @returns Runs, articles imported, failed attempts, and dollars spent on models.
 */
export async function runTotals(pool: pg.Pool, from: Date, to: Date): Promise<{ runs: number; imported: number; failures: number; dollars: number }> {
  const result = await pool.query("SELECT counts FROM runs WHERE kind = 'hourly' AND started_at >= $1 AND started_at < $2", [from, to]);
  const totals = { runs: result.rowCount ?? 0, imported: 0, failures: 0, dollars: 0 };
  for (const { counts } of result.rows) {
    totals.imported += counts.imported ?? 0;
    totals.dollars += (counts.jev_input_tokens ?? 0) * JEV_DOLLARS_PER_TOKEN + (counts.openrouter_cost_microdollars ?? 0) / 1e6;
    for (const [name, value] of Object.entries(counts)) {
      if (name.endsWith("_failed")) totals.failures += Number(value);
    }
  }
  return totals;
}

/**
 * The seconds the hourly job has run this calendar month (UTC), on its one vCPU.
 *
 * @param pool  The v0 pool.
 * @param now  The current moment.
 * @returns vCPU-seconds so far.
 */
export async function cpuSecondsThisMonth(pool: pg.Pool, now: Date): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const result = await pool.query("SELECT coalesce(sum(seconds), 0) AS seconds FROM runs WHERE kind = 'hourly' AND started_at >= $1", [monthStart]);
  return Number(result.rows[0].seconds);
}

/**
 * The day's counts message, if one was written, and whether it was sent.
 *
 * @param pool  The v0 pool.
 * @param day  The report's date, "YYYY-MM-DD" in Pacific time.
 * @returns Its text and whether it was posted, or null when none was written.
 */
export async function dailyReport(pool: pg.Pool, day: string): Promise<{ text: string; posted: boolean } | null> {
  const result = await pool.query("SELECT text, posted_at FROM daily_reports WHERE day = $1", [day]);
  if (result.rowCount === 0) return null;
  return { text: result.rows[0].text, posted: result.rows[0].posted_at !== null };
}
