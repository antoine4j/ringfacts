// Telegram (9): sends v0's messages through its own bot, @ringfacts_bot, to
// its own chat. Development never posts: without a chat id, or with DRY_RUN
// set, a message is printed instead.

import type { Poster } from "../../workflow/context.ts";

/**
 * Makes text safe inside a Telegram HTML message.
 *
 * @param text  Any text.
 * @returns The text with &, < and > escaped.
 */
export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Sends one HTML message.
 *
 * @param token  The bot's token.
 * @param chatId  The chat.
 * @param text  The message, in Telegram's HTML.
 * @returns The message's id.
 */
export async function sendMessage(token: string, chatId: string, text: string): Promise<number> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(30_000),
  });
  const reply = await response.json();
  if (!reply.ok) throw new Error(`Telegram ${response.status}: ${reply.description ?? "unknown error"}`);
  return reply.result.message_id;
}

/**
 * The run's way of posting: to v0's chat, or to the console.
 *
 * @param token  The bot's token, if any.
 * @param chatId  v0's chat id, if any.
 * @param dryRun  True to print whatever the settings.
 * @returns A poster, and whether it really sends.
 */
export function makePoster(token: string | undefined, chatId: string | undefined, dryRun: boolean): { poster: Poster; sends: boolean } {
  const sends = Boolean(token && chatId) && !dryRun;
  if (!sends) {
    const poster: Poster = async (text) => {
      console.log(`--- would post ---\n${text}\n------------------`);
      return null;
    };
    return { poster, sends };
  }
  const poster: Poster = (text) => sendMessage(token as string, chatId as string, text);
  return { poster, sends };
}
