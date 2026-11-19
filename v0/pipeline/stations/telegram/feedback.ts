// Feedback in the chat: what the maintainer wrote and which emoji were put on
// v0's messages, read out of a batch of Telegram updates. Pure functions: no
// database, no network, so the rules that keep other people's words out of
// the database can be tested with recorded updates.
// Design: Launch Map task 9.13 (docs/launch-map.html).

/** The five emoji that mean something here. */
export const COUNTED_EMOJI = ["👍", "👎", "🥱", "👀", "🤔"] as const;

/** A Telegram message, the parts read here. */
export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number };
  from?: { id: number; is_bot?: boolean };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  quote?: { text?: string };
  photo?: unknown;
  voice?: unknown;
  video?: unknown;
  video_note?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
  animation?: unknown;
};

/** One reaction as Telegram lists it. */
type ReactionType = { type: string; emoji?: string };

/** A Telegram update, the parts read here. */
export type Update = {
  update_id: number;
  message?: TelegramMessage;
  message_reaction?: {
    chat: { id: number };
    message_id: number;
    user?: { id: number };
    old_reaction: ReactionType[];
    new_reaction: ReactionType[];
  };
};

/** One of the maintainer's messages, as v0 stores it. */
export type MaintainerMessage = {
  updateId: number;
  messageId: number;
  replyToMessageId: number | null;
  text: string;
  quote: string | null;
  kind: string;
  linkMessageId: number | null;
  sentAt: Date;
};

/** One change of reaction, as v0 stores it. */
export type Reaction = { updateId: number; messageId: number; emoji: string | null; oldEmoji: string | null; userId: number | null };

// The kinds of message that are not plain text, in the order they are looked for.
const MEDIA_KINDS = ["photo", "voice", "video", "video_note", "audio", "document", "sticker", "animation"] as const;

/**
 * The number of the message a Telegram message link points at.
 *
 * A link to a message in a supergroup reads t.me/c/<chat>/<message>, or
 * t.me/c/<chat>/<topic>/<message> inside a topic. The chat in the link is the
 * chat's id without its -100 prefix. A link to any other chat names no message
 * here, so it is passed over; the first link that matches wins.
 *
 * @param text  A message's text.
 * @param chatId  v0's chat id, such as -1001234567890.
 * @returns The message id, or null when the text links to no message in this chat.
 */
export function linkedMessageId(text: string, chatId: string): number | null {
  // Only a supergroup's id has the -100 prefix that links drop.
  const prefix = "-100";
  if (!chatId.startsWith(prefix)) return null;
  const linkChat = chatId.slice(prefix.length);
  const pattern = /(?:https?:\/\/)?t\.me\/c\/(\d+)\/(\d+)(?:\/(\d+))?/g;
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== linkChat) continue;

    // With a topic number in the middle the message is the last one.
    return Number(match[3] ?? match[2]);
  }
  return null;
}

/**
 * What kind of message this is, by what it carries.
 *
 * @param message  The message.
 * @returns "text", or the media it carries ("photo", "voice", ...), or "other" when it has no text.
 */
function kindOf(message: TelegramMessage): string {
  for (const kind of MEDIA_KINDS) {
    if (message[kind] !== undefined) return kind;
  }
  return message.text === undefined ? "other" : "text";
}

/**
 * The maintainer's messages in v0's chat among a batch of updates.
 *
 * Anything from another account is dropped here, before it can be stored: the
 * friends will be in the chat after launch and their words are never kept.
 *
 * @param updates  What getUpdates returned.
 * @param chatId  v0's chat.
 * @param maintainerId  The maintainer's Telegram account id.
 * @returns One entry per message of his, in the order received.
 */
export function maintainerMessagesIn(updates: Update[], chatId: string, maintainerId: string): MaintainerMessage[] {
  const kept: MaintainerMessage[] = [];
  for (const update of updates) {
    const message = update.message;
    if (!message || String(message.chat.id) !== chatId) continue;
    if (!message.from || message.from.is_bot || String(message.from.id) !== maintainerId) continue;
    const text = message.text ?? message.caption ?? "";
    kept.push({
      updateId: update.update_id,
      messageId: message.message_id,
      replyToMessageId: message.reply_to_message?.message_id ?? null,
      text,
      quote: message.quote?.text ?? null,
      kind: kindOf(message),
      linkMessageId: linkedMessageId(text, chatId),
      sentAt: new Date(message.date * 1000),
    });
  }
  return kept;
}

/**
 * The counted emoji in a reaction list, if any.
 *
 * @param list  Telegram's reaction list.
 * @returns The first counted emoji, or null.
 */
function countedEmoji(list: ReactionType[]): string | null {
  const found = list.find((reaction) => reaction.type === "emoji" && reaction.emoji && (COUNTED_EMOJI as readonly string[]).includes(reaction.emoji));
  return found?.emoji ?? null;
}

/**
 * The changes to the five counted emoji in v0's chat among a batch of updates, by anyone.
 *
 * Who reacted is kept, so one person's emoji never stands for another's.
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
    reactions.push({ updateId: update.update_id, messageId: change.message_id, emoji, oldEmoji, userId: change.user?.id ?? null });
  }
  return reactions;
}
