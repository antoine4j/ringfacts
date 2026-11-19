// The questions the scores page asks the database. Each returns rows shaped
// for lib/scores.ts, which does the counting. Live data only: the scores
// are about the live pipeline, so every query reads the public schema.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §2 and §7.

import type { ClaimFacts } from "./career-events.ts";
import type { DayRange } from "./dates.ts";
import { claimFilter, whereSql } from "./filters.ts";
import { query } from "./db.ts";
import { claimMembers, claimReviews, latestReaction, type MemberRow } from "./queries.ts";
import { claimTier, type FirstUsedRow, type Post, type VersionRow } from "./scores.ts";
import type { ClaimReviewView, SameClaimMark } from "./reviews.ts";

/** The claims of a period, their readings, and their review views. */
export type PeriodClaims = { ids: string[]; members: Map<string, MemberRow[]>; views: Map<string, ClaimReviewView> };

/**
 * The claims in a period: those with a reading published in it, the claims
 * list's rule (scoreboard D5), each with its readings and review view.
 *
 * @param range  The period's days, or null for all time.
 * @returns The claims, their readings and their views.
 */
export async function claimsInPeriod(range: DayRange | null): Promise<PeriodClaims> {
  // Only the date keys reach the filter, so a claim counts whole, by any one reading.
  const params = range ? { when: "custom", from: range.from ?? "", to: range.to ?? "" } : {};
  const filter = claimFilter(params);
  const rows = await query<{ id: string }>("public", `SELECT cn.id FROM claim_now cn ${whereSql(filter)}`, filter.values);
  const ids = rows.map((row) => row.id);

  // Their readings, then the review marks on them.
  const members = await claimMembers("public", ids);
  const views = await claimReviews("public", members);
  return { ids, members, views };
}

/**
 * Adds "the Pacific day of this column is inside the range" to a query.
 *
 * @param column  A fixed column name, such as "r.posted_at"; never user input.
 * @param range  The days, or null for all time.
 * @param values  The query's values so far; the range's days are added.
 * @returns The conditions, each starting with AND; "" for all time.
 */
function dayConditions(column: string, range: DayRange | null, values: unknown[]): string {
  const pacificDay = `(${column} AT TIME ZONE 'America/Los_Angeles')::date`;
  let sql = "";
  if (range?.from) {
    values.push(range.from);
    sql += ` AND ${pacificDay} >= $${values.length}::date`;
  }
  if (range?.to) {
    values.push(range.to);
    sql += ` AND ${pacificDay} <= $${values.length}::date`;
  }
  return sql;
}

/**
 * The tier-1 posts sent in a period: each claim's posted reading.
 *
 * @param range  The days, or null for every post ever sent.
 * @returns The posts, with each one's latest emoji and whether he wrote a reply to it.
 */
export async function postsInPeriod(range: DayRange | null): Promise<(Post & { latest: string | null; noted: boolean })[]> {
  const values: unknown[] = [];
  const rows = await query<{ claim_id: string; posted_at: Date; latest: string | null; noted: boolean }>(
    "public",
    `SELECT c.id AS claim_id, r.posted_at, ${latestReaction("r.message_id")} AS latest,
            EXISTS (SELECT 1 FROM telegram_notes n WHERE n.post_reading_id = r.id) AS noted
     FROM claims c JOIN readings r ON r.id = c.posted_reading_id
     WHERE r.posted_at IS NOT NULL${dayConditions("r.posted_at", range, values)}`,
    values,
  );
  return rows.map((row) => ({ claimId: row.claim_id, postedAt: row.posted_at, latest: row.latest, noted: row.noted }));
}

/**
 * The latest emoji on a digest, as a SQL expression: a 👎 on any part of it counts
 * as the digest's, since a long digest is several messages and he may react to
 * any of them; otherwise the newest emoji on any part.
 *
 * @param digestId  The column holding the digest's id, with its table alias; a fixed name, never user input.
 * @returns The expression.
 */
export function latestDigestReaction(digestId: string): string {
  if (!digestId.includes(".")) throw new Error(`latestDigestReaction needs a qualified column, got "${digestId}"`);
  return `(SELECT CASE WHEN bool_or(part.emoji = '👎') THEN '👎' ELSE (array_agg(part.emoji ORDER BY part.update_id DESC))[1] END
     FROM (SELECT DISTINCT ON (re.message_id) re.message_id, re.emoji, re.update_id
           FROM reactions re JOIN sent_messages sm ON sm.message_id = re.message_id
           WHERE sm.digest_id = ${digestId}
           ORDER BY re.message_id, re.update_id DESC) part)`;
}

/**
 * The digests sent in a period, each with its latest emoji and whether he wrote a reply to any part.
 *
 * @param range  The days, or null for all time.
 * @returns One row per digest sent.
 */
export async function digestsInPeriod(range: DayRange | null): Promise<{ id: string; latest: string | null; noted: boolean }[]> {
  const values: unknown[] = [];
  return query<{ id: string; latest: string | null; noted: boolean }>(
    "public",
    `SELECT d.id, ${latestDigestReaction("d.id")} AS latest,
            EXISTS (SELECT 1 FROM telegram_notes n WHERE n.post_digest_id = d.id) AS noted
     FROM digests d
     WHERE d.posted_at IS NOT NULL AND NOT d.backfill${dayConditions("d.posted_at", range, values)}`,
    values,
  );
}

/**
 * The claims whose tier-1 post he called a repeat by replying with a link to an earlier post.
 * A link to the very post replied to is no repeat of anything, so it is left out.
 *
 * @returns The claim ids.
 */
export async function claimsMarkedRepeatByLink(): Promise<Set<string>> {
  const rows = await query<{ claim_id: string }>(
    "public",
    `SELECT DISTINCT c.id AS claim_id
     FROM telegram_notes n JOIN claims c ON c.posted_reading_id = n.post_reading_id
     WHERE n.repeats_message_id IS NOT NULL AND n.repeats_message_id <> n.post_message_id`,
  );
  return new Set(rows.map((row) => row.claim_id));
}

/** One claim's facts as the database returns them. */
type ClaimFactsRow = { id: string; posted: boolean; best_tier: number | null; in_posted_digest: boolean; digest_still_due: boolean };

/**
 * What the bot did with the claims the career events name (design §3).
 *
 * @param claimIds  The claims.
 * @returns Claim id → its facts; a claim that does not exist is left out.
 */
export async function claimFacts(claimIds: number[]): Promise<Map<number, ClaimFacts>> {
  if (claimIds.length === 0) return new Map();

  // A digest covers the tier 1 and 2 readings published inside its window, so
  // it is still due while no posted digest of the fighter ends after the claim's first such reading.
  const rows = await query<ClaimFactsRow>(
    "public",
    `SELECT c.id, c.posted_reading_id IS NOT NULL AS posted, best.tier AS best_tier,
            EXISTS (SELECT 1 FROM digest_claims dc JOIN digests d ON d.id = dc.digest_id
                    WHERE dc.claim_id = c.id AND dc.used AND d.posted_at IS NOT NULL) AS in_posted_digest,
            NOT EXISTS (SELECT 1 FROM digests d
                        WHERE d.fighter = c.fighter AND NOT d.backfill AND d.posted_at IS NOT NULL
                          AND d.period_end > coalesce(best.first_digestible, best.first_published)) AS digest_still_due
     FROM claims c
     CROSS JOIN LATERAL (
       SELECT min(rn.tier) AS tier, min(rn.published_at) FILTER (WHERE rn.tier IN (1, 2)) AS first_digestible, min(rn.published_at) AS first_published
       FROM reading_now rn WHERE rn.claim_id = c.id
     ) best
     WHERE c.id = ANY($1::bigint[])`,
    [claimIds],
  );
  return new Map(rows.map((row) => [Number(row.id), toClaimFacts(row)]));
}

/**
 * One claim's facts in the shape lib/career-events.ts reads.
 *
 * @param row  The row from claimFacts.
 * @returns The facts.
 */
function toClaimFacts(row: ClaimFactsRow): ClaimFacts {
  const tier = row.best_tier === null ? null : claimTier([Number(row.best_tier)]);
  return { tier, posted: row.posted, inPostedDigest: row.in_posted_digest, digestStillDue: row.digest_still_due };
}

/**
 * The versions behind the readings of some claims, with how many readings each.
 *
 * @param claimIds  The claims counted.
 * @returns One row per combination of versions.
 */
export async function versionRows(claimIds: string[]): Promise<VersionRow[]> {
  if (claimIds.length === 0) return [];
  return query<VersionRow>(
    "public",
    `SELECT classifier_version, grouping_version, settings_version, count(*) AS readings
     FROM reading_now WHERE claim_id = ANY($1::bigint[]) GROUP BY 1, 2, 3`,
    [claimIds],
  );
}

/**
 * When each version of the classifier, the grouping and the settings was first used.
 *
 * @returns One row per station and version.
 */
export async function firstUsedRows(): Promise<FirstUsedRow[]> {
  return query<FirstUsedRow>(
    "public",
    `SELECT 'classifier' AS station, version, min(created_at) AS first_used FROM classifications GROUP BY version
     UNION ALL SELECT 'grouping', version, min(created_at) FROM groupings GROUP BY version
     UNION ALL SELECT 'settings', version::text, created_at FROM settings`,
  );
}

/**
 * Each claim's newest reading mark, and when each of its readings joined it, to find reopened claims.
 *
 * @param claimIds  The claims.
 * @returns Claim → time of its newest mark; claim → reading → time it joined.
 */
export async function reviewTimes(claimIds: string[]): Promise<{ lastMarkAt: Map<string, Date>; joinedAt: Map<string, Map<string, Date>> }> {
  if (claimIds.length === 0) return { lastMarkAt: new Map(), joinedAt: new Map() };
  const [marks, joins] = await Promise.all([
    query<{ claim_id: string; at: Date }>("public", "SELECT claim_id, max(created_at) AS at FROM review_readings WHERE claim_id = ANY($1::bigint[]) GROUP BY claim_id", [claimIds]),
    query<{ claim_id: string; reading_id: string; at: Date }>(
      "public",
      "SELECT claim_id, reading_id, min(created_at) AS at FROM groupings WHERE claim_id = ANY($1::bigint[]) GROUP BY claim_id, reading_id",
      [claimIds],
    ),
  ]);

  // Sort the joins under their claims.
  const joinedAt = new Map<string, Map<string, Date>>();
  for (const join of joins) joinedAt.set(join.claim_id, (joinedAt.get(join.claim_id) ?? new Map()).set(join.reading_id, join.at));
  return { lastMarkAt: new Map(marks.map((mark) => [mark.claim_id, mark.at])), joinedAt };
}

/**
 * Every "same claim as" mark, for the groups behind over-split and repeats.
 *
 * @returns The rows; lib/reviews.ts works out which links are in force.
 */
export async function sameClaimMarks(): Promise<SameClaimMark[]> {
  return query<SameClaimMark>("public", "SELECT id, claim_id, other_claim_id, verdict, note FROM review_same_claims");
}
