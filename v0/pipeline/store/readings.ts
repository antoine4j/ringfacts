// Moves readings through the stations. A station's answer and the move to the
// next stage are written together, so a reading never skips a station; a
// failure leaves the reading where it is for the next run.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 4.

import type pg from "pg";
import { inTransaction } from "./db.ts";

// A day of hourly runs failing in a row.
export const STUCK_AFTER_ATTEMPTS = 24;

export const NEXT_STAGE: Record<string, string> = {
  classify: "extract",
  extract: "group",
  group: "decide",
  decide: "done",
};

/** A reading with the article fields the stations need. */
export type Reading = {
  id: number;
  fighter: string;
  article_id: number;
  headline: string;
  outlet: string;
  url: string;
  published_at: Date;
  body: string;
  backfill: boolean;
};

/**
 * The readings waiting at one stage, oldest article first.
 *
 * @param pool  The v0 pool.
 * @param stage  The stage.
 * @param limit  At most this many; null for all.
 * @returns The readings.
 */
export async function readingsAt(pool: pg.Pool, stage: string, limit: number | null = null): Promise<Reading[]> {
  const result = await pool.query(
    `SELECT r.id, r.fighter, a.id AS article_id, a.headline, a.outlet, a.url, a.published_at, a.body, a.backfill
     FROM readings r JOIN articles a ON a.id = r.article_id
     WHERE r.stage = $1
     ORDER BY a.published_at, r.id
     LIMIT $2`,
    [stage, limit],
  );

  // Postgres bigints arrive as strings; ids are small enough to be numbers.
  return result.rows.map((row) => ({ ...row, id: Number(row.id), article_id: Number(row.article_id) }));
}

/**
 * Writes one station's answer and moves the reading to the next stage.
 *
 * @param pool  The v0 pool.
 * @param readingId  The reading.
 * @param stage  The stage it is leaving.
 * @param write  Inserts the answer, given the transaction's connection; returns the new row's id.
 * @returns The new answer row's id.
 */
export async function recordAnswer(pool: pg.Pool, readingId: number, stage: string, write: (client: pg.PoolClient) => Promise<number>): Promise<number> {
  return inTransaction(pool, async (client) => {
    const answerId = await write(client);
    const moved = await client.query(
      "UPDATE readings SET stage = $1, attempts = 0, last_error = NULL, updated_at = now() WHERE id = $2 AND stage = $3",
      [NEXT_STAGE[stage], readingId, stage],
    );
    if (moved.rowCount !== 1) throw new Error(`reading ${readingId} was no longer at ${stage}`);
    return answerId;
  });
}

/**
 * Notes a failed attempt; after STUCK_AFTER_ATTEMPTS in a row the reading is stuck.
 *
 * @param pool  The v0 pool.
 * @param readingId  The reading.
 * @param stage  The stage it failed at.
 * @param error  What went wrong.
 * @returns True when this failure made the reading stuck.
 */
export async function recordFailure(pool: pg.Pool, readingId: number, stage: string, error: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE readings
     SET attempts = attempts + 1,
         last_error = $1,
         stuck_from = CASE WHEN attempts + 1 >= $2 THEN stage END,
         stage = CASE WHEN attempts + 1 >= $2 THEN 'stuck' ELSE stage END,
         updated_at = now()
     WHERE id = $3 AND stage = $4
     RETURNING stage`,
    [error.slice(0, 1000), STUCK_AFTER_ATTEMPTS, readingId, stage],
  );
  return result.rows[0]?.stage === "stuck";
}

/**
 * How many readings sit at each stage now.
 *
 * @param pool  The v0 pool.
 * @returns Stage → count.
 */
export async function stageCounts(pool: pg.Pool): Promise<Record<string, number>> {
  const result = await pool.query("SELECT stage, count(*)::int AS n FROM readings GROUP BY stage");
  const counts: Record<string, number> = {};
  for (const row of result.rows) counts[row.stage] = row.n;
  return counts;
}
