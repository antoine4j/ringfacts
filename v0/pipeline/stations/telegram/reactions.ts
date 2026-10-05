// Reactions (10.4): each run asks Telegram for what happened around v0's bot
// since the last run, keeps the 👍 and 👎 put on messages in v0's chat, and
// confirms what it read so Telegram does not send it again. Telegram keeps
// undelivered updates for 24 hours, enough for an hourly job.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 10 (D13).

import { postJson } from "../http.ts";

const COUNTED = new Set(["👍", "👎"]);
const ALLOWED_UPDATES = ["message", "my_chat_member", "message_reaction"];

/** One reaction change, as v0 stores it. */
export type Reaction = { updateId: number; messageId: number; emoji: string | null; oldEmoji: string | null };

/** A Telegram update, the parts read here. */
type Update = {
  update_id: number;
  message_reaction?: {
    chat: { id: number };
    message_id: number;
    old_reaction: { type: string; emoji?: string }[];
    new_reaction: { type: string; emoji?: string }[];
  };
};

/**
 * The counted emoji in a reaction list, if any.
 *
 * @param list  Telegram's reaction list.
 * @returns 👍, 👎 or null.
 */
function countedEmoji(list: { type: string; emoji?: string }[]): string | null {
  const found = list.find((reaction) => reaction.type === "emoji" && reaction.emoji && COUNTED.has(reaction.emoji));
  return found?.emoji ?? null;
}

/**
 * The 👍 and 👎 changes in v0's chat among a batch of updates.
 *
 * @param updates  What getUpdates returned.
 * @param chatId  v0's chat.
 * @returns One entry per change that involves a counted emoji.
 */
export function reactionsIn(updates: Update[], chatId: string): Reaction[] {
  const reactions: Reaction[] = [];
  for (const update of updates) {
    const change = update.message_reaction;
    if (!change || String(change.chat.id) !== chatId) continue;
    const emoji = countedEmoji(change.new_reaction);
    const oldEmoji = countedEmoji(change.old_reaction);
    if (emoji === null && oldEmoji === null) continue;
    reactions.push({ updateId: update.update_id, messageId: change.message_id, emoji, oldEmoji });
  }
  return reactions;
}

/**
 * Reads every waiting update, then confirms them so they are not sent again.
 *
 * @param token  The bot's token.
 * @returns The updates.
 */
export async function readUpdates(token: string): Promise<Update[]> {
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const reply = await postJson(url, {}, { timeout: 0, allowed_updates: ALLOWED_UPDATES }, 30_000, "Telegram getUpdates");
  const updates: Update[] = reply.result ?? [];

  // Asking again from past the last one confirms everything read so far.
  if (updates.length > 0) {
    const next = Math.max(...updates.map((update) => update.update_id)) + 1;
    await postJson(url, {}, { offset: next, limit: 1, timeout: 0, allowed_updates: ALLOWED_UPDATES }, 30_000, "Telegram getUpdates");
  }
  return updates;
}
