// Reads what happened around v0's bot since the last run: the maintainer's
// messages and the emoji put on v0's messages. Updates are read one batch at a
// time, and a batch is confirmed to Telegram only by asking for the next one,
// which the caller does after storing it, so a failed store loses nothing.
// Telegram keeps unconfirmed updates for 24 hours, enough for an hourly job.
// Design: Launch Map task 9.13 (docs/launch-map.html).

import { postJson } from "../http.ts";
import type { Update } from "./feedback.ts";

/** What v0 asks Telegram to send; message_reaction needs the bot to be an admin of the chat. */
const ALLOWED_UPDATES = ["message", "my_chat_member", "message_reaction"];

/** The most updates Telegram gives in one answer. */
export const BATCH_SIZE = 100;

/**
 * Reads one batch of waiting updates, and confirms every update before it.
 *
 * @param token  The bot's token.
 * @param offset  One past the newest update already stored, or undefined for the first batch.
 * @returns The updates, oldest first; empty when none are waiting.
 */
export async function readBatch(token: string, offset?: number): Promise<Update[]> {
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const reply = await postJson(url, {}, { timeout: 0, limit: BATCH_SIZE, allowed_updates: ALLOWED_UPDATES, ...(offset === undefined ? {} : { offset }) }, 30_000, "Telegram getUpdates");
  return (reply.result ?? []) as Update[];
}
