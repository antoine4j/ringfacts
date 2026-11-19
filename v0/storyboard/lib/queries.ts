// Questions more than one page asks the database.

import type { Settings } from "../../pipeline/settings/tiers.ts";
import { agentViews, answersInForce, disputedCalls, loadAgentMarks, spotSample, SPOT_SIZE, type AgentFile, type ClaimAgentView, type ReadingCallView, type SameCallView } from "./agent-marks.ts";
import { marksInForce, reviewViews, sameClaimGroups, type ClaimReviewView, type ReadingMark, type SameClaimMark } from "./reviews.ts";
import type { TierMark } from "./tier-marks.ts";
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
  pick: { claim?: number | null; confidence?: number; raw?: unknown } | null;
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

/**
 * Anton's grouping reviews that touch some claims (D35): every mark on their
 * readings; every mark on a reading elsewhere that ever named one of them as
 * where it belongs (all of that reading's marks, so a later undo is seen);
 * and every same-claim link (a group can reach these claims through others).
 *
 * @param schema  "public" or "replay".
 * @param claimIds  The claims shown.
 * @returns The rows; lib/reviews.ts works out what is in force.
 */
export async function reviewsFor(schema: Schema, claimIds: string[]): Promise<{ readingMarks: ReadingMark[]; sameMarks: SameClaimMark[] }> {
  if (claimIds.length === 0) return { readingMarks: [], sameMarks: [] };
  const [readingMarks, sameMarks] = await Promise.all([
    query<ReadingMark>(
      schema,
      `SELECT id, reading_id, claim_id, verdict, belongs_in_claim_id, note FROM review_readings
       WHERE claim_id = ANY($1::bigint[])
          OR (claim_id, reading_id) IN (SELECT claim_id, reading_id FROM review_readings WHERE belongs_in_claim_id = ANY($1::bigint[]))`,
      [claimIds],
    ),
    query<SameClaimMark>(schema, "SELECT id, claim_id, other_claim_id, verdict, note FROM review_same_claims"),
  ]);
  return { readingMarks, sameMarks };
}

/**
 * Anton's tier marks on some claims (scoreboard D3), every row; lib/tier-marks.ts works out which is in force.
 *
 * @param claimIds  The claims.
 * @returns The review_tiers rows.
 */
export async function tierMarksFor(claimIds: string[]): Promise<TierMark[]> {
  if (claimIds.length === 0) return [];

  // Marks made on the storyboard, plus one for each claim whose posted message carries his 🥱 now: it counts at once, and taking the emoji off takes it back.
  // A mark he made on the storyboard after the emoji wins, so the synthetic one is left out then. Its id is above any real one, so it is the newest.
  return query<TierMark>(
    "public",
    `SELECT id, claim_id, tier_had, verdict, should_be_tier, note FROM review_tiers WHERE claim_id = ANY($1::bigint[])
     UNION ALL
     SELECT ${EMOJI_MARK_ID_BASE} + c.id, c.id, tn.tier, 'wrong'::text, 2::smallint, '🥱 in Telegram: belongs in the digest'::text
     FROM claims c
     JOIN readings r ON r.id = c.posted_reading_id
     JOIN LATERAL (${latestHisEmoji("r.message_id", "$2")}) last ON last.emoji = '🥱'
     JOIN LATERAL (SELECT min(rn.tier) AS tier FROM reading_now rn WHERE rn.claim_id = c.id) tn ON tn.tier = 1
     WHERE c.id = ANY($1::bigint[]) AND NOT EXISTS (SELECT 1 FROM review_tiers t WHERE t.claim_id = c.id AND t.created_at > last.received_at)`,
    [claimIds, maintainerId()],
  );
}

/** A synthetic tier mark's id starts here, above any real review_tiers id. */
const EMOJI_MARK_ID_BASE = 9_000_000_000_000;

/** The marker the note read from a 🤔 starts with. */
export const LOOKS_WRONG_NOTE = "🤔 looks wrong (from Telegram)";

/**
 * His Telegram account id from the setting; "" when it is not set, which counts any account, right while he is alone in the chat.
 *
 * @returns The id, or "".
 */
function maintainerId(): string {
  return process.env.TELEGRAM_MAINTAINER_ID ?? "";
}

/**
 * A SQL query for the newest emoji he put on one message, with when it was put there.
 *
 * @param messageId  The column holding the message's id, with its table alias; a fixed name, never user input.
 * @param maintainerParam  The placeholder holding his account id ("" counts any account); a fixed name, never user input.
 * @returns The query, giving emoji and received_at.
 */
export function latestHisEmoji(messageId: string, maintainerParam: string): string {
  if (!messageId.includes(".")) throw new Error(`latestHisEmoji needs a qualified column, got "${messageId}"`);
  return `SELECT re.emoji, re.received_at FROM reactions re WHERE re.message_id = ${messageId} AND (${maintainerParam} = '' OR re.user_id IS NULL OR re.user_id::text = ${maintainerParam}) ORDER BY re.update_id DESC LIMIT 1`;
}

/** A note on a claim, and when it was written or last changed. */
export type ClaimNoteRow = { note: string; created_at: Date };

/**
 * Anton's note in force on each of some claims: each claim's newest row, unless it cleared the note.
 *
 * @param claimIds  The claims.
 * @returns Claim id → its note and when it was written; a claim without one is absent.
 */
export async function claimNotesFor(claimIds: string[]): Promise<Map<string, ClaimNoteRow>> {
  if (claimIds.length === 0) return new Map();
  const rows = await query<ClaimNoteRow & { claim_id: string }>(
    "public",
    "SELECT DISTINCT ON (claim_id) claim_id, note, created_at FROM review_claim_notes WHERE claim_id = ANY($1::bigint[]) ORDER BY claim_id, id DESC",
    [claimIds],
  );
  const notes = new Map(rows.filter((row) => row.note !== "").map((row) => [row.claim_id, { note: row.note, created_at: row.created_at }]));

  // A 🤔 on a claim's posted message is a looks-wrong note at once, kept in front of the note already there; a note written after the emoji wins.
  const wrong = await query<{ claim_id: string; at: Date }>(
    "public",
    `SELECT c.id AS claim_id, last.received_at AS at
     FROM claims c
     JOIN readings r ON r.id = c.posted_reading_id
     JOIN LATERAL (${latestHisEmoji("r.message_id", "$2")}) last ON last.emoji = '🤔'
     WHERE c.id = ANY($1::bigint[])
       AND NOT EXISTS (SELECT 1 FROM review_claim_notes k WHERE k.claim_id = c.id AND k.created_at > last.received_at)`,
    [claimIds, maintainerId()],
  );
  for (const row of wrong) {
    const existing = notes.get(row.claim_id);
    notes.set(row.claim_id, { note: existing ? `${LOOKS_WRONG_NOTE}. ${existing.note}` : LOOKS_WRONG_NOTE, created_at: row.at });
  }
  return notes;
}

/**
 * The review view of each claim shown (D35). Empty on the golden replay,
 * whose rulings are the golden set's.
 *
 * @param schema  "public" or "replay".
 * @param members  Claim → its readings, from claimMembers.
 * @returns Claim → its review view.
 */
export async function claimReviews(schema: Schema, members: Map<string, MemberRow[]>): Promise<Map<string, ClaimReviewView>> {
  if (schema === "replay") return new Map();
  const readingsOf = new Map([...members].map(([claimId, rows]) => [claimId, rows.map((row) => row.reading_id)]));
  const { readingMarks, sameMarks } = await reviewsFor(schema, [...members.keys()]);
  return reviewViews(readingsOf, readingMarks, sameMarks);
}

/**
 * The agents' calls on each claim shown, beside Anton's marks; empty on the
 * golden replay and when no calls file is set (lib/agent-marks.ts).
 *
 * @param schema  "public" or "replay".
 * @param claimIds  The claims shown.
 * @returns Claim → what it shows about the agents' calls; claims with none are absent.
 */
export async function claimAgentViews(schema: Schema, claimIds: string[]): Promise<Map<string, ClaimAgentView>> {
  const loaded = schema === "public" ? loadAgentMarks() : null;
  if (!loaded) return new Map();

  // The calls on these claims, set against Anton's marks and links in force.
  const shown = new Set(claimIds);
  const file = {
    ...loaded.file,
    readings: loaded.file.readings.filter((call) => shown.has(call.claim_id)),
    same_claims: loaded.file.same_claims.filter((call) => shown.has(call.claim_id) || shown.has(call.other_claim_id)),
  };
  const { readingMarks, sameMarks } = await reviewsFor(schema, claimIds);
  return agentViews(file, answersInForce(loaded.answers), marksInForce(readingMarks), sameClaimGroups(sameMarks).links);
}

/** The flat views of the three-judge file: ?agent=disputed and ?agent=spot. */
export type AgentListing = {
  mode: "disputed" | "spot";
  readings: { call: ReadingCallView; row: MemberRow | undefined }[];
  same: { claim_id: string; call: SameCallView }[];
  /** Spot only: calls Anton has answered (or already marked) out of the sample. */
  answered: number;
  total: number;
};

/**
 * The reading calls, and for disputed the same-claim pairs, one of the two
 * three-judge views shows, each set against Anton's answers and marks. Null
 * when no calls are loaded or the file is the single-judge shape.
 *
 * @param schema  "public" or "replay".
 * @param mode  "disputed" (not unanimous, split first) or "spot" (the fixed sample of unanimous change calls).
 * @returns The listing, or null.
 */
export async function agentListing(schema: Schema, mode: "disputed" | "spot"): Promise<AgentListing | null> {
  const loaded = schema === "public" ? loadAgentMarks() : null;
  if (!loaded || !loaded.file.judges) return null;
  const picked = mode === "spot" ? { readings: spotSample(loaded.file), same: [] } : disputedCalls(loaded.file);
  const file: AgentFile = { ...loaded.file, readings: picked.readings, same_claims: picked.same };
  const claimIds = [...new Set([...file.readings.map((call) => call.claim_id), ...file.same_claims.flatMap((call) => [call.claim_id, call.other_claim_id])])];
  const { readingMarks, sameMarks } = await reviewsFor(schema, claimIds);
  const views = agentViews(file, answersInForce(loaded.answers), marksInForce(readingMarks), sameClaimGroups(sameMarks).links);
  const members = await claimMembers(schema, claimIds);
  const readings = file.readings.map((call) => ({
    call: views.get(call.claim_id)!.readings[call.reading_id],
    row: members.get(call.claim_id)?.find((row) => row.reading_id === call.reading_id),
  }));
  const same = file.same_claims.map((call) => ({ claim_id: call.claim_id, call: views.get(call.claim_id)!.same.find((each) => each.other_claim_id === call.other_claim_id)! }));
  return { mode, readings, same, answered: readings.filter(({ call }) => call.state !== "open").length, total: mode === "spot" ? Math.min(SPOT_SIZE, readings.length) : readings.length };
}
