// What the bot sent, one row per Telegram message: a tier-1 post, each part of a
// digest, the daily counts. A reply or an emoji finds its post through these
// rows, so a long digest's later parts are reachable too.
// Design: Launch Map task 9.13 (docs/launch-map.html).

import type pg from "pg";

/** What a sent message belongs to. */
export type SentTarget =
  | { kind: "post"; readingId: number }
  | { kind: "digest"; digestId: number; part: number }
  | { kind: "daily"; day: string };

/**
 * Records one message the bot sent. Safe to call twice for the same message.
 *
 * @param pool  The database.
 * @param messageId  The message's Telegram id.
 * @param target  What the message belongs to.
 */
export async function recordSent(pool: pg.Pool, messageId: number, target: SentTarget): Promise<void> {
  // Exactly one of the three owner columns is set, as the table requires.
  const readingId = target.kind === "post" ? target.readingId : null;
  const digestId = target.kind === "digest" ? target.digestId : null;
  const day = target.kind === "daily" ? target.day : null;
  const part = target.kind === "digest" ? target.part : 1;
  await pool.query(
    "INSERT INTO sent_messages (message_id, kind, reading_id, digest_id, daily_day, part) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
    [messageId, target.kind, readingId, digestId, day, part],
  );
}
