// Questions more than one page asks the database.

import type { Settings } from "../../pipeline/settings/tiers.ts";
import { query } from "./db.ts";
import type { Schema } from "./schema.ts";

/**
 * The latest 👍 or 👎 on a v0 message, as a SQL expression (task 10.4). A
 * reaction removed later reads as null, since its newest row has no emoji.
 *
 * @param messageId  The column holding the message's id, with its table alias (a bare "message_id" would name the reaction's own); a fixed name, never user input.
 * @returns The expression.
 */
export function latestReaction(messageId: string): string {
  if (!messageId.includes(".")) throw new Error(`latestReaction needs a qualified column, got "${messageId}"`);
  return `(SELECT re.emoji FROM reactions re WHERE re.message_id = ${messageId} ORDER BY re.update_id DESC LIMIT 1)`;
}

/** A row of the settings table, with its metadata. */
export type SettingsRow = Settings & { author: string; note: string; created_at: Date };

/** A row of the feedback table. */
export type FeedbackRow = { id: string; reading_id: string | null; claim_id: string | null; digest_id: string | null; field: string; should_be: string | null; note: string; author: string; created_at: Date };

/** What a feedback row is about: one reading, one claim or one digest. */
export type FeedbackTarget = "reading" | "claim" | "digest";

/** The feedback column for each kind of target; the only column names that reach the SQL. */
export const FEEDBACK_COLUMN: Record<FeedbackTarget, string> = { reading: "reading_id", claim: "claim_id", digest: "digest_id" };

/**
 * The newest settings version: the one the next run uses.
 *
 * @param schema  "public" or "replay".
 * @returns The row, or null when there are no settings yet.
 */
export async function latestSettings(schema: Schema): Promise<SettingsRow | null> {
  const rows = await query<SettingsRow>(schema, "SELECT * FROM settings ORDER BY version DESC LIMIT 1");
  return rows[0] ?? null;
}

/**
 * The watched fighters, by name.
 *
 * @param schema  "public" or "replay".
 * @returns Their names, in alphabetical order.
 */
export async function fighterNames(schema: Schema): Promise<string[]> {
  const rows = await query<{ name: string }>(schema, "SELECT name FROM fighters ORDER BY name");
  return rows.map((row) => row.name);
}

/**
 * Every outlet with at least one article, for the outlet filter's suggestions.
 *
 * @param schema  "public" or "replay".
 * @returns Outlet names, in alphabetical order.
 */
export async function outletNames(schema: Schema): Promise<string[]> {
  const rows = await query<{ outlet: string }>(schema, "SELECT DISTINCT outlet FROM articles WHERE outlet <> '' ORDER BY outlet");
  return rows.map((row) => row.outlet);
}

/**
 * Every feedback row about one reading, claim or digest, newest first.
 *
 * @param schema  "public" or "replay".
 * @param target  What kind of thing the feedback is on.
 * @param id  Its id.
 * @returns The rows.
 */
export async function feedbackOn(schema: Schema, target: FeedbackTarget, id: string): Promise<FeedbackRow[]> {
  const column = FEEDBACK_COLUMN[target];
  return query<FeedbackRow>(schema, `SELECT * FROM feedback WHERE ${column} = $1 ORDER BY id DESC`, [id]);
}

/** A claim as the claim_now view shows it. */
export type ClaimRow = {
  id: string;
  fighter: string;
  grouping_version: string;
  label: string;
  current_label: string;
  current_label_reading_id: string | null;
  first_reading_id: string;
  posted_reading_id: string | null;
  readings: string;
  outlets: string;
  first_published: Date | null;
  last_published: Date | null;
  created_at: Date;
};

/** One reading of a claim, with the pick that put it there. */
export type MemberRow = {
  claim_id: string;
  reading_id: string;
  pick: { claim?: number | null; confidence?: number } | null;
  headline: string;
  url: string;
  outlet: string;
  published_at: Date;
  tier: number | null;
  cell: string | null;
  centrality: string | null;
  sentence: string | null;
  posted_at: Date | null;
  reaction: string | null;
};

/**
 * The readings of some claims, each with the grouping that joined it, in date order.
 *
 * @param schema  "public" or "replay".
 * @param claimIds  The claims.
 * @returns Claim id → its readings, oldest first.
 */
export async function claimMembers(schema: Schema, claimIds: string[]): Promise<Map<string, MemberRow[]>> {
  const byClaim = new Map<string, MemberRow[]>();
  if (claimIds.length === 0) return byClaim;

  // Each reading once per claim, with that claim's newest grouping of it.
  const rows = await query<MemberRow>(
    schema,
    `SELECT * FROM (
       SELECT DISTINCT ON (g.claim_id, g.reading_id)
         g.claim_id, g.reading_id, g.pick, rn.headline, rn.url, rn.outlet, rn.published_at,
         rn.tier, rn.cell, rn.classification ->> 'centrality' AS centrality, rn.extract ->> 'claim' AS sentence, rn.posted_at, ${latestReaction("rn.message_id")} AS reaction
       FROM groupings g
       JOIN reading_now rn ON rn.reading_id = g.reading_id
       WHERE g.claim_id = ANY($1::bigint[])
       ORDER BY g.claim_id, g.reading_id, g.id DESC
     ) members
     ORDER BY published_at, reading_id`,
    [claimIds],
  );

  // Sort them under their claims.
  for (const row of rows) {
    const list = byClaim.get(row.claim_id) ?? [];
    list.push(row);
    byClaim.set(row.claim_id, list);
  }
  return byClaim;
}
