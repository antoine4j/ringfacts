// The feedback step: stores the maintainer's messages and the five emoji put on
// v0's messages, then lets Telegram forget what was stored. A batch is stored in
// one transaction first, and only asking for the next batch confirms it, so a
// failed store loses nothing: Telegram sends the batch again. It runs only when
// the chat id and the maintainer's account id are configured. Reading updates
// also confirms them, and without the account id his messages could not be told
// from a friend's, so the step then reads nothing and they wait at Telegram.
// Design: Launch Map task 9.13 (docs/launch-map.html).

import type pg from "pg";
import { readBatch } from "../stations/telegram/updates.ts";
import { maintainerMessagesIn, reactionsIn, type MaintainerMessage, type Reaction } from "../stations/telegram/feedback.ts";
import { count, type RunContext } from "./context.ts";

/** The most batches one run reads: 2,000 updates, far more than an hour holds. */
const MAX_BATCHES = 20;

/**
 * Stores one batch of messages and reactions in one transaction.
 *
 * @param pool  The database.
 * @param messages  The maintainer's messages.
 * @param reactions  The emoji changes.
 */
async function storeBatch(pool: pg.Pool, messages: MaintainerMessage[], reactions: Reaction[]): Promise<void> {
  if (messages.length === 0 && reactions.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const message of messages) {
      await client.query(
        `INSERT INTO telegram_messages (update_id, message_id, reply_to_message_id, text, quote, kind, link_message_id, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [message.updateId, message.messageId, message.replyToMessageId, message.text, message.quote, message.kind, message.linkMessageId, message.sentAt],
      );
    }
    for (const reaction of reactions) {
      await client.query(
        "INSERT INTO reactions (update_id, message_id, emoji, old_emoji, user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (update_id) DO NOTHING",
        [reaction.updateId, reaction.messageId, reaction.emoji, reaction.oldEmoji, reaction.userId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reads and stores new feedback in v0's chat.
 *
 * @param context  The run.
 * @param token  The bot's token.
 * @param chatId  v0's chat, or undefined when not configured yet.
 * @param maintainerId  The maintainer's Telegram account id, or undefined when not configured yet.
 */
export async function storeFeedback(context: RunContext, token: string | undefined, chatId: string | undefined, maintainerId: string | undefined): Promise<void> {
  if (!token || !chatId) return;
  if (!maintainerId) {
    // Said once per run, so a missing setting is seen in the run's counts and the log.
    count(context, "feedback_no_maintainer");
    console.error("feedback not read: TELEGRAM_MAINTAINER_ID is not set, so the maintainer's messages cannot be told from anyone else's");
    return;
  }

  // Each read confirms the batch stored before it; the last read finds nothing waiting.
  let offset: number | undefined;
  for (let batchNumber = 0; batchNumber < MAX_BATCHES; batchNumber += 1) {
    const updates = await readBatch(token, offset);
    if (batchNumber === 0) count(context, "feedback_reads");
    if (updates.length === 0) return;
    const messages = maintainerMessagesIn(updates, chatId, maintainerId);
    const reactions = reactionsIn(updates, chatId);
    await storeBatch(context.pool, messages, reactions);
    count(context, "telegram_messages", messages.length);
    count(context, "reactions", reactions.length);
    offset = Math.max(...updates.map((update) => update.update_id)) + 1;
  }
}
