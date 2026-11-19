// What the maintainer wrote in the Telegram chat, and the emoji he put on v0's
// posts, as the storyboard shows them: the notes on a claim or a digest, the
// inbox of every note, the marks that wait for his Confirm, and when Telegram
// was last read. Live data only: the golden replay has no chat.
// Design: Launch Map task 9.13 (docs/launch-map.html).

import { query } from "./db.ts";

/** One of his messages, with the bot message at the top of its reply chain. */
export type TelegramNote = {
  message_id: string;
  text: string;
  quote: string | null;
  kind: string;
  sent_at: Date;
  reply_to_message_id: string | null;
  post_message_id: string | null;
  post_kind: "post" | "digest" | "daily" | null;
  post_reading_id: string | null;
  post_digest_id: string | null;
  post_part: number | null;
  repeats_message_id: string | null;
  repeats_kind: "post" | "digest" | "daily" | null;
  repeats_claim_id: string | null;
  claim_id: string | null;
  claim_label: string | null;
  digest_fighter: string | null;
  digest_period_end: Date | null;
};

/** The emoji that wait for his Confirm: 🥱 means "belongs in the digest", 🤔 means "looks wrong". */
export type EmojiMark = { message_id: string; emoji: "🥱" | "🤔"; claim_id: string; claim_label: string; tier_now: number | null; claim_note: string | null };

// The columns every notes query returns, with the claim or digest each note ends at.
const NOTE_COLUMNS = `n.message_id, n.text, n.quote, n.kind, n.sent_at, n.reply_to_message_id, n.post_message_id, n.post_kind, n.post_reading_id, n.post_digest_id,
  n.post_part, n.repeats_message_id, n.repeats_kind, rc.id AS repeats_claim_id, c.id AS claim_id, cn.current_label AS claim_label, d.fighter AS digest_fighter, d.period_end AS digest_period_end`;
const NOTE_JOINS = `FROM telegram_notes n
  LEFT JOIN claims c ON c.posted_reading_id = n.post_reading_id
  LEFT JOIN claims rc ON rc.posted_reading_id = n.repeats_reading_id
  LEFT JOIN claim_now cn ON cn.id = c.id
  LEFT JOIN digests d ON d.id = n.post_digest_id`;

/**
 * The notes on claims' tier-1 posts, oldest first, grouped by claim.
 *
 * @param claimIds  The claims.
 * @returns The notes under each claim that has any.
 */
export async function notesForClaims(claimIds: string[]): Promise<Map<string, TelegramNote[]>> {
  const byClaim = new Map<string, TelegramNote[]>();
  if (claimIds.length === 0) return byClaim;
  const rows = await query<TelegramNote>("public", `SELECT ${NOTE_COLUMNS} ${NOTE_JOINS} WHERE c.id = ANY($1::bigint[]) ORDER BY n.sent_at, n.message_id`, [claimIds]);
  for (const row of rows) {
    if (row.claim_id === null) continue;
    byClaim.set(row.claim_id, [...(byClaim.get(row.claim_id) ?? []), row]);
  }
  return byClaim;
}

/**
 * The notes on digests, on any of their parts, oldest first, grouped by digest.
 *
 * @param digestIds  The digests.
 * @returns The notes under each digest that has any.
 */
export async function notesForDigests(digestIds: string[]): Promise<Map<string, TelegramNote[]>> {
  const byDigest = new Map<string, TelegramNote[]>();
  if (digestIds.length === 0) return byDigest;
  const rows = await query<TelegramNote>("public", `SELECT ${NOTE_COLUMNS} ${NOTE_JOINS} WHERE n.post_digest_id = ANY($1::bigint[]) ORDER BY n.sent_at, n.message_id`, [digestIds]);
  for (const row of rows) {
    if (row.post_digest_id === null) continue;
    byDigest.set(row.post_digest_id, [...(byDigest.get(row.post_digest_id) ?? []), row]);
  }
  return byDigest;
}

/** The most notes the inbox lists. */
export const INBOX_LIMIT = 200;

/**
 * Every note, for the inbox: the ones that reach no post first, then newest first.
 *
 * @returns The notes.
 */
export async function inboxNotes(): Promise<TelegramNote[]> {
  return query<TelegramNote>("public", `SELECT ${NOTE_COLUMNS} ${NOTE_JOINS} ORDER BY (n.post_message_id IS NULL) DESC, n.sent_at DESC, n.message_id DESC LIMIT ${INBOX_LIMIT}`);
}

/**
 * The 🥱 and 🤔 on tier-1 posts that wait for his Confirm.
 *
 * Only his newest emoji on a post counts, so one he took off or changed is gone.
 * A 🥱 is waiting until the claim's newest tier mark says "wrong, should be the
 * digest"; a 🤔 until the claim has a note that starts with the marker the Confirm
 * writes. His account is the one in
 * TELEGRAM_MAINTAINER_ID; without it every account in the chat counts, which is
 * right while he is alone in it.
 *
 * @param maintainerId  His Telegram account id, or "" when not configured.
 * @returns The waiting marks, newest first.
 */
export async function emojiMarksWaiting(maintainerId: string): Promise<EmojiMark[]> {
  return query<EmojiMark>(
    "public",
    `WITH newest AS (
       SELECT DISTINCT ON (re.message_id, re.user_id) re.message_id, re.emoji, re.update_id
       FROM reactions re
       WHERE ($1 = '' OR re.user_id IS NULL OR re.user_id::text = $1)
       ORDER BY re.message_id, re.user_id, re.update_id DESC
     )
     SELECT nw.message_id, nw.emoji, c.id AS claim_id, cn.current_label AS claim_label,
            (SELECT min(rn.tier) FROM reading_now rn WHERE rn.claim_id = c.id) AS tier_now,
            (SELECT k.note FROM review_claim_notes k WHERE k.claim_id = c.id ORDER BY k.id DESC LIMIT 1) AS claim_note
     FROM newest nw
     JOIN sent_messages sm ON sm.message_id = nw.message_id AND sm.kind = 'post'
     JOIN claims c ON c.posted_reading_id = sm.reading_id
     JOIN claim_now cn ON cn.id = c.id
     WHERE nw.emoji IN ('🥱', '🤔')
       AND NOT (nw.emoji = '🥱' AND COALESCE((SELECT t.verdict = 'wrong' AND t.should_be_tier = 2 FROM review_tiers t WHERE t.claim_id = c.id ORDER BY t.id DESC LIMIT 1), false))
       AND NOT (nw.emoji = '🤔' AND EXISTS (SELECT 1 FROM review_claim_notes k WHERE k.claim_id = c.id AND k.note LIKE '🤔 looks wrong%'))
     ORDER BY nw.update_id DESC`,
    [maintainerId],
  );
}

/**
 * When the job last asked Telegram for feedback.
 *
 * @returns The finish time of the newest run that read the chat, or null when none has.
 */
export async function lastFeedbackRead(): Promise<Date | null> {
  const rows = await query<{ finished_at: Date | null }>("public", "SELECT finished_at FROM runs WHERE counts ? 'feedback_reads' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1");
  return rows[0]?.finished_at ?? null;
}

/** How long Telegram may go unread before the inbox says so: the job runs hourly. */
export const STALE_AFTER_HOURS = 3;

/**
 * Whether the last read is too old to trust that nothing is waiting.
 *
 * @param lastRead  When Telegram was last read, or null for never.
 * @param now  The current moment.
 * @returns True when it was never read or the read is older than the limit.
 */
export function isStale(lastRead: Date | null, now: Date): boolean {
  return lastRead === null || now.getTime() - lastRead.getTime() > STALE_AFTER_HOURS * 3_600_000;
}

/**
 * What a note's post is, in words.
 *
 * @param note  The note.
 * @returns For example "claim #12 · Topuria booked", "digest #4 (Ilia Topuria), part 2", or "no post reached".
 */
export function postWords(note: TelegramNote): string {
  if (note.post_message_id === null) return "no post reached";
  if (note.post_kind === "digest") return `digest #${note.post_digest_id}${note.digest_fighter ? ` (${note.digest_fighter})` : ""}${note.post_part && note.post_part > 1 ? `, part ${note.post_part}` : ""}`;
  if (note.post_kind === "daily") return "the daily counts";
  return note.claim_id ? `claim #${note.claim_id}${note.claim_label ? ` · ${note.claim_label}` : ""}` : `post ${note.post_message_id}`;
}
