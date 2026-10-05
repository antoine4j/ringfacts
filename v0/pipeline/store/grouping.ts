// Semantic dedup (6), the database half: the shortlist of claims an article
// could join, and writing the grouping, which starts a new claim when JEV
// picks none. Settings measured on the golden set (D22): claims of this
// fighter with an article in the 14 days before this one, ranked by their
// closest article, the top 5, no similarity cutoff.

import type pg from "pg";
import type { Candidate, Pick } from "../stations/grouping/grouping.ts";
import type { Extract } from "../stations/extractor/extractor.ts";
import { recordAnswer } from "./readings.ts";

export const WINDOW_DAYS = 14;
export const SHORTLIST_SIZE = 5;

/**
 * pgvector's text form of a vector.
 *
 * @param vector  The numbers.
 * @returns "[0.1,0.2,…]".
 */
export function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * The claims this article could belong to, most similar first.
 *
 * @param pool  The v0 pool.
 * @param fighter  The reading's fighter.
 * @param publishedAt  The article's date; the window ends here.
 * @param embedding  The article's vector.
 * @param version  The grouping version whose claims are candidates.
 * @returns Up to SHORTLIST_SIZE claims, each with its current label and its closest article's similarity.
 */
export async function shortlist(pool: pg.Pool, fighter: string, publishedAt: Date, embedding: number[], version: string): Promise<Candidate[]> {
  const result = await pool.query(
    `WITH recent AS (
       SELECT DISTINCT g.claim_id
       FROM groupings g
       JOIN readings r ON r.id = g.reading_id
       JOIN articles a ON a.id = r.article_id
       WHERE r.fighter = $1 AND g.version = $2
         AND a.published_at >= $3::timestamptz - make_interval(days => $4)
     ),
     closest AS (
       SELECT g.claim_id, max(1 - (g.embedding <=> $5::vector)) AS similarity
       FROM groupings g
       WHERE g.claim_id IN (SELECT claim_id FROM recent) AND g.version = $2
       GROUP BY g.claim_id
     )
     SELECT closest.claim_id, closest.similarity, claim_now.current_label
     FROM closest JOIN claim_now ON claim_now.id = closest.claim_id
     ORDER BY closest.similarity DESC
     LIMIT $6`,
    [fighter, version, publishedAt, WINDOW_DAYS, vectorLiteral(embedding), SHORTLIST_SIZE],
  );
  return result.rows.map((row) => ({ claimId: Number(row.claim_id), label: row.current_label, similarity: Number(row.similarity) }));
}

/**
 * The label a new claim gets: its first reading's extract sentence, or the
 * headline when the extract found no claim.
 *
 * @param extract  The reading's extract.
 * @param headline  The article's headline.
 * @returns The label.
 */
export function newClaimLabel(extract: Extract, headline: string): string {
  return extract.claim === "NO CLAIM" ? headline : extract.claim;
}

/**
 * Writes the grouping, starting a claim first when JEV picked none, and moves the reading on.
 *
 * @param pool  The v0 pool.
 * @param grouping  The reading, its extract, the vector, the shortlist, the pick and the label a new claim would get.
 * @returns The claim the reading joined or started, and whether it is new.
 */
export async function recordGrouping(
  pool: pg.Pool,
  grouping: { readingId: number; fighter: string; extractId: number; version: string; embedding: number[]; shortlist: Candidate[]; pick: Pick; pickRaw: unknown; newLabel: string },
): Promise<{ claimId: number; isNew: boolean }> {
  let claimId = grouping.pick.claim;
  const isNew = claimId === null;
  await recordAnswer(pool, grouping.readingId, "group", async (client) => {
    // A pick of none starts a claim, labelled by this reading's extract.
    if (claimId === null) {
      const claim = await client.query(
        "INSERT INTO claims (fighter, grouping_version, label, first_reading_id) VALUES ($1, $2, $3, $4) RETURNING id",
        [grouping.fighter, grouping.version, grouping.newLabel, grouping.readingId],
      );
      claimId = Number(claim.rows[0].id);
    }
    const row = await client.query(
      `INSERT INTO groupings (reading_id, extract_id, version, embedding, shortlist, pick, claim_id)
       VALUES ($1, $2, $3, $4::vector, $5, $6, $7) RETURNING id`,
      [grouping.readingId, grouping.extractId, grouping.version, vectorLiteral(grouping.embedding), JSON.stringify(grouping.shortlist), JSON.stringify({ ...grouping.pick, raw: grouping.pickRaw }), claimId],
    );
    return Number(row.rows[0].id);
  });
  return { claimId: claimId as number, isNew };
}
