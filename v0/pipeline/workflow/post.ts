// Posts tier 1 (9.1): each claim once, from its first tier-1 reading, as that
// reading's own extract sentence and link (D5). A claim whose first tier-1
// reading is history (backfill) never posts: that news is old.

import { escapeHtml } from "../stations/telegram/telegram.ts";
import { count, type RunContext } from "./context.ts";

// News older than this is not posted: a claim whose first tier-1 article is
// older waited too long (no chat yet, an outage) and is old news by now.
export const MAX_POST_AGE_HOURS = 48;

/** A claim ready to post, with the reading that posts it, its cell ("next_fight · reported") and how many outlets carry the claim. */
type ToPost = {
  claim_id: number;
  reading_id: number;
  fighter: string;
  headline: string;
  outlet: string;
  url: string;
  extract: { claim?: string } | null;
  cell?: string | null;
  outlets?: number | null;
};

// The kind of news, as the post's first words: every fact the settings could put at tier 1.
const FACT_LABELS: Record<string, string> = {
  result: "🏆 Result",
  next_fight: "📅 Next fight",
  fight_week_event: "🥊 Fight week",
  health: "🩺 Health",
  career_move: "🔁 Career move",
  personal_life: "👤 Personal",
  status_update: "📌 Update",
};
const FIRMNESS_WORDS: Record<string, string> = { official_or_done: "official", reported: "reported", rumour: "rumour", wish: "wish" };

/**
 * The post's label: the kind of news, and how firm it is unless it is a result (a result is done).
 *
 * @param cell  The reading's cell, such as "next_fight · reported".
 * @returns Such as "📅 Next fight · reported", or "📰 News" without a cell.
 */
export function newsLabel(cell: string | null | undefined): string {
  const [fact, firmness] = (cell ?? "").split(" · ");
  const kind = FACT_LABELS[fact] ?? "📰 News";
  const firm = fact === "result" ? undefined : FIRMNESS_WORDS[firmness];
  return firm ? `${kind} · ${firm}` : kind;
}

/**
 * The tier-1 message for one reading (the look Anton chose on 5 Oct, variant B).
 *
 * @param row  The claim and its posting reading.
 * @returns Telegram HTML: the label and the fighter, the extract sentence (the headline when there is none), the outlet as a link and the claim's outlet count when above one.
 */
export function tierOneMessage(row: ToPost): string {
  const sentence = row.extract?.claim && row.extract.claim !== "NO CLAIM" ? row.extract.claim : row.headline;
  const outlets = Number(row.outlets ?? 0) > 1 ? ` · ${Number(row.outlets)} outlets` : "";
  const link = `<a href="${escapeHtml(row.url)}">${escapeHtml(row.outlet || "source")}</a>`;
  return `${newsLabel(row.cell)} · <b>${escapeHtml(row.fighter)}</b>\n${escapeHtml(sentence)}\n${link}${outlets}`;
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
       SELECT DISTINCT ON (claim_id) claim_id, reading_id, fighter, headline, outlet, url, extract, cell, backfill, published_at
       FROM reading_now
       WHERE tier = 1 AND claim_id IS NOT NULL
       ORDER BY claim_id, published_at, reading_id
     )
     SELECT f.*, cn.outlets FROM first_tier_one f JOIN claims c ON c.id = f.claim_id JOIN claim_now cn ON cn.id = f.claim_id
     WHERE c.posted_reading_id IS NULL AND NOT f.backfill
       AND f.published_at > now() - make_interval(hours => $1)
     ORDER BY f.published_at`,
    [MAX_POST_AGE_HOURS],
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
