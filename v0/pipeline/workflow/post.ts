// Posts tier 1 (9.1): each claim once, from its first tier-1 reading, as that
// reading's own extract sentence and link (D5). A claim whose first tier-1
// reading is history (backfill) never posts: that news is old.

import { escapeHtml } from "../stations/telegram/telegram.ts";
import { count, type RunContext } from "./context.ts";

/** A claim ready to post, with the reading that posts it. */
type ToPost = { claim_id: number; reading_id: number; fighter: string; headline: string; outlet: string; url: string; extract: { claim?: string } | null };

/**
 * The tier-1 message for one reading.
 *
 * @param row  The claim and its posting reading.
 * @returns Telegram HTML: the fighter, the extract sentence (the headline when there is none), the outlet as a link.
 */
export function tierOneMessage(row: ToPost): string {
  const sentence = row.extract?.claim && row.extract.claim !== "NO CLAIM" ? row.extract.claim : row.headline;
  return `<b>${escapeHtml(row.fighter)}</b>\n${escapeHtml(sentence)}\n<a href="${escapeHtml(row.url)}">${escapeHtml(row.outlet || "source")}</a>`;
}

/**
 * Posts every claim whose first tier-1 reading is live and not yet posted.
 *
 * @param context  The run.
 * @returns How many were posted (or printed).
 */
export async function postNewClaims(context: RunContext): Promise<{ posted: number }> {
  const due = await context.pool.query<ToPost>(
    `WITH first_tier_one AS (
       SELECT DISTINCT ON (claim_id) claim_id, reading_id, fighter, headline, outlet, url, extract, backfill, published_at
       FROM reading_now
       WHERE tier = 1 AND claim_id IS NOT NULL
       ORDER BY claim_id, published_at, reading_id
     )
     SELECT f.* FROM first_tier_one f JOIN claims c ON c.id = f.claim_id
     WHERE c.posted_reading_id IS NULL AND NOT f.backfill
     ORDER BY f.published_at`,
  );

  // Send each, then mark the claim posted; a failed send is retried next run.
  let posted = 0;
  for (const row of due.rows) {
    try {
      const messageId = await context.poster(tierOneMessage(row));
      posted += 1;
      if (messageId === null) continue;
      await context.pool.query("UPDATE claims SET posted_reading_id = $1 WHERE id = $2 AND posted_reading_id IS NULL", [row.reading_id, row.claim_id]);
      await context.pool.query("UPDATE readings SET posted_at = now(), message_id = $1, updated_at = now() WHERE id = $2", [messageId, row.reading_id]);
    } catch (error) {
      count(context, "post_failed");
      console.error(`claim ${row.claim_id} not posted: ${(error as Error).message}`);
    }
  }
  count(context, "posted", posted);
  return { posted };
}
