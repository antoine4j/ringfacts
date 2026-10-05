// The reactions step: stores the 👍 and 👎 on v0's messages. It runs only
// when v0's chat id is configured, because reading updates also confirms
// them, and the update that names the chat must stay readable until then.

import { readUpdates, reactionsIn } from "../stations/telegram/reactions.ts";
import { count, type RunContext } from "./context.ts";

/**
 * Reads and stores new reactions in v0's chat.
 *
 * @param context  The run.
 * @param token  The bot's token.
 * @param chatId  v0's chat, or undefined when not configured yet.
 */
export async function storeReactions(context: RunContext, token: string | undefined, chatId: string | undefined): Promise<void> {
  if (!token || !chatId) return;
  const reactions = reactionsIn(await readUpdates(token), chatId);
  for (const reaction of reactions) {
    await context.pool.query(
      "INSERT INTO reactions (update_id, message_id, emoji, old_emoji) VALUES ($1, $2, $3, $4) ON CONFLICT (update_id) DO NOTHING",
      [reaction.updateId, reaction.messageId, reaction.emoji, reaction.oldEmoji],
    );
  }
  count(context, "reactions", reactions.length);
}
