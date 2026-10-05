// Writes the Classifier's (4), Claim extractor's (5) and Decider's (7) answers,
// each with the move to the next stage, and reads back what a later station
// needs from an earlier one.

import type pg from "pg";
import type { Settings } from "../settings/tiers.ts";
import { recordAnswer } from "./readings.ts";

/**
 * Stores the classifier's answers and moves the reading to extract.
 *
 * @param pool  The v0 pool.
 * @param readingId  The reading.
 * @param version  The classifier version.
 * @param answers  The answers, ties applied.
 * @param raw  JEV's whole reply.
 * @returns The new row's id.
 */
export async function recordClassification(pool: pg.Pool, readingId: number, version: string, answers: unknown, raw: unknown): Promise<number> {
  return recordAnswer(pool, readingId, "classify", async (client) => {
    const row = await client.query("INSERT INTO classifications (reading_id, version, answers, raw) VALUES ($1, $2, $3, $4) RETURNING id", [readingId, version, answers, raw]);
    return Number(row.rows[0].id);
  });
}

/**
 * Stores the extract and moves the reading to group.
 *
 * @param pool  The v0 pool.
 * @param readingId  The reading.
 * @param version  The extractor version.
 * @param answers  The extract.
 * @param raw  The model's whole reply.
 * @returns The new row's id.
 */
export async function recordExtract(pool: pg.Pool, readingId: number, version: string, answers: unknown, raw: unknown): Promise<number> {
  return recordAnswer(pool, readingId, "extract", async (client) => {
    const row = await client.query("INSERT INTO extracts (reading_id, version, answers, raw) VALUES ($1, $2, $3, $4) RETURNING id", [readingId, version, answers, raw]);
    return Number(row.rows[0].id);
  });
}

/**
 * Stores the Decider's tier and moves the reading to done.
 *
 * @param pool  The v0 pool.
 * @param decision  The reading, the classification it read, the settings version, the tier and the cell.
 * @returns The new row's id.
 */
export async function recordDecision(pool: pg.Pool, decision: { readingId: number; classificationId: number; settingsVersion: number; tier: number; cell: string }): Promise<number> {
  return recordAnswer(pool, decision.readingId, "decide", async (client) => {
    const row = await client.query(
      "INSERT INTO decisions (reading_id, classification_id, settings_version, tier, cell) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [decision.readingId, decision.classificationId, decision.settingsVersion, decision.tier, decision.cell],
    );
    return Number(row.rows[0].id);
  });
}

/**
 * A reading's latest answer from one station.
 *
 * @param pool  The v0 pool.
 * @param table  "classifications" or "extracts".
 * @param readingId  The reading.
 * @returns The row's id, version and answers, or null if the station has not answered.
 */
export async function latestAnswer(pool: pg.Pool, table: "classifications" | "extracts", readingId: number): Promise<{ id: number; version: string; answers: Record<string, string> } | null> {
  const result = await pool.query(`SELECT id, version, answers FROM ${table} WHERE reading_id = $1 ORDER BY id DESC LIMIT 1`, [readingId]);
  if (result.rowCount === 0) return null;
  return { id: Number(result.rows[0].id), version: result.rows[0].version, answers: result.rows[0].answers };
}

/**
 * The newest settings: what the Decider applies now.
 *
 * @param pool  The v0 pool.
 * @returns The settings row.
 */
export async function currentSettings(pool: pg.Pool): Promise<Settings> {
  const result = await pool.query("SELECT version, classifier_version, tiers, digest_schedule FROM settings ORDER BY version DESC LIMIT 1");
  if (result.rowCount === 0) throw new Error("no settings: run store/migrate.ts");
  return result.rows[0];
}
