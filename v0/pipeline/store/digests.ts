// The Digest writer's (8) database half: everything the writer is given for
// one fighter and one period, and storing the digest with which claims it
// was given and which it used. Readings of tier 3 (not about him) are left out.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 8.

import type pg from "pg";
import { inTransaction } from "./db.ts";

const PREVIOUS_DIGEST_DAYS = 30;
const MIN_PREVIOUS_DIGESTS = 3;
const BACKGROUND_DAYS = 30;

/** One article of a claim, as the writer sees it. */
export type DigestArticle = { sentence: string; outlet: string; date: string; url: string; tier: number };

/** One claim as the writer sees it. */
export type DigestClaim = {
  id: number;
  label: string;
  firstLabel: string;
  bestTier: number;
  postedInPeriod: boolean;
  readings: number;
  outlets: number;
  firstDate: string;
  lastDate: string;
  articles: DigestArticle[];
};

/** Everything the writer is given. */
export type DigestContext = {
  fighter: string;
  periodStart: Date;
  periodEnd: Date;
  previous: { start: string; end: string; text: string }[];
  active: DigestClaim[];
  background: DigestClaim[];
};

/**
 * Where a fighter's last digest ended.
 *
 * @param pool  The v0 pool.
 * @param fighter  The fighter.
 * @param backfill  True to look only at archive digests, false only at live ones.
 * @returns Its period's end, or null when he has none.
 */
export async function previousDigestEnd(pool: pg.Pool, fighter: string, backfill: boolean): Promise<Date | null> {
  const result = await pool.query("SELECT max(period_end) AS end FROM digests WHERE fighter = $1 AND backfill = $2", [fighter, backfill]);
  return result.rows[0].end;
}

/**
 * The claims with at least one tier-1 or tier-2 reading published between two moments.
 *
 * @param pool  The v0 pool.
 * @param fighter  The fighter.
 * @param from  The start, inclusive.
 * @param to  The end, exclusive.
 * @param withArticles  True to list every such reading; false for the claim's summary only.
 * @returns The claims, most articles first.
 */
async function claimsBetween(pool: pg.Pool, fighter: string, from: Date, to: Date, withArticles: boolean): Promise<DigestClaim[]> {
  const result = await pool.query(
    `SELECT rn.claim_id, cn.current_label, cn.label, cn.readings, cn.outlets, cn.first_published, cn.last_published, cn.posted_reading_id,
            min(rn.tier) AS best_tier,
            bool_or(rn.posted_at IS NOT NULL) AS posted,
            json_agg(json_build_object('sentence', coalesce(nullif(rn.extract->>'claim', 'NO CLAIM'), rn.headline), 'outlet', rn.outlet,
                     'date', to_char(rn.published_at, 'YYYY-MM-DD'), 'url', rn.url, 'tier', rn.tier) ORDER BY rn.published_at) AS articles
     FROM reading_now rn JOIN claim_now cn ON cn.id = rn.claim_id
     WHERE rn.fighter = $1 AND rn.tier IN (1, 2) AND rn.published_at >= $2 AND rn.published_at < $3
     GROUP BY rn.claim_id, cn.current_label, cn.label, cn.readings, cn.outlets, cn.first_published, cn.last_published, cn.posted_reading_id
     ORDER BY count(*) DESC, max(rn.published_at) DESC`,
    [fighter, from, to],
  );
  return result.rows.map((row) => ({
    id: Number(row.claim_id),
    label: row.current_label,
    firstLabel: row.label,
    bestTier: Number(row.best_tier),
    postedInPeriod: row.posted,
    readings: Number(row.readings),
    outlets: Number(row.outlets),
    firstDate: row.first_published.toISOString().slice(0, 10),
    lastDate: row.last_published.toISOString().slice(0, 10),
    articles: withArticles ? row.articles : [],
  }));
}

/**
 * Everything the writer is given for one fighter's period.
 *
 * @param pool  The v0 pool.
 * @param fighter  The fighter.
 * @param periodStart  The period's start.
 * @param periodEnd  The period's end.
 * @param backfill  True for an archive digest: earlier archive digests are its "previous".
 * @returns The context.
 */
export async function digestContext(pool: pg.Pool, fighter: string, periodStart: Date, periodEnd: Date, backfill: boolean): Promise<DigestContext> {
  const active = await claimsBetween(pool, fighter, periodStart, periodEnd, true);
  const activeIds = new Set(active.map((claim) => claim.id));
  const backgroundFrom = new Date(periodStart.getTime() - BACKGROUND_DAYS * 86_400_000);
  const background = (await claimsBetween(pool, fighter, backgroundFrom, periodStart, false)).filter((claim) => !activeIds.has(claim.id));

  // Previous digests: those of the last 30 days, and at least the last 3.
  const previous = await pool.query(
    `SELECT period_start, period_end, text FROM digests
     WHERE fighter = $1 AND backfill = $2 AND period_end <= $3
     ORDER BY period_end DESC
     LIMIT greatest($4, (SELECT count(*) FROM digests WHERE fighter = $1 AND backfill = $2 AND period_end <= $3 AND period_end > $3::timestamptz - make_interval(days => $5)))`,
    [fighter, backfill, periodStart, MIN_PREVIOUS_DIGESTS, PREVIOUS_DIGEST_DAYS],
  );
  const previousDigests = previous.rows.reverse().map((row) => ({
    start: row.period_start.toISOString().slice(0, 10),
    end: row.period_end.toISOString().slice(0, 10),
    text: row.text,
  }));
  return { fighter, periodStart, periodEnd, previous: previousDigests, active, background };
}

/**
 * Stores a digest, and every claim it was given with whether it used it.
 *
 * @param pool  The v0 pool.
 * @param digest  The digest and its context.
 * @returns The digest's id.
 */
export async function recordDigest(
  pool: pg.Pool,
  digest: { context: DigestContext; model: string; promptVersion: string; text: string; items: unknown[]; usedClaimIds: Set<number>; raw: unknown; backfill: boolean },
): Promise<number> {
  return inTransaction(pool, async (client) => {
    const row = await client.query(
      `INSERT INTO digests (fighter, period_start, period_end, model, prompt_version, text, items, raw, backfill)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [digest.context.fighter, digest.context.periodStart, digest.context.periodEnd, digest.model, digest.promptVersion, digest.text, JSON.stringify(digest.items), digest.raw, digest.backfill],
    );
    const digestId = Number(row.rows[0].id);
    for (const claim of [...digest.context.active, ...digest.context.background]) {
      await client.query("INSERT INTO digest_claims (digest_id, claim_id, used) VALUES ($1, $2, $3)", [digestId, claim.id, digest.usedClaimIds.has(claim.id)]);
    }
    return digestId;
  });
}
