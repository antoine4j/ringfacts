// Covers the pure rules of feedback in the chat: whose messages are kept, how a
// message link names a post, which emoji count, and who reacted. Nothing here
// touches a database or the network. The rule that matters most is the first:
// the friends will be in the chat after launch, and nothing they write may be
// kept, so the filter has a test for each way a message could slip past it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedMessageId, maintainerMessagesIn, reactionsIn, type Update } from "./feedback.ts";

const CHAT = "-1001234567890";
const ME = "4242";

/**
 * A message update as Telegram sends it.
 *
 * @param updateId  The update's id.
 * @param fields  Message fields to set over the defaults: the maintainer, in v0's chat, text "hello".
 * @returns The update.
 */
function messageUpdate(updateId: number, fields: Record<string, unknown> = {}): Update {
  return { update_id: updateId, message: { message_id: updateId * 10, date: 1_700_000_000, chat: { id: -1001234567890 }, from: { id: 4242 }, text: "hello", ...fields } } as Update;
}

/**
 * A reaction update as Telegram sends it.
 *
 * @param updateId  The update's id.
 * @param oldEmoji  Emoji before.
 * @param newEmoji  Emoji after.
 * @param fields  Fields to set over the defaults: message 77, in v0's chat, by user 4242.
 * @returns The update.
 */
function reactionUpdate(updateId: number, oldEmoji: string[], newEmoji: string[], fields: Record<string, unknown> = {}): Update {
  const list = (emoji: string[]) => emoji.map((value) => ({ type: "emoji", emoji: value }));
  return { update_id: updateId, message_reaction: { chat: { id: -1001234567890 }, message_id: 77, user: { id: 4242 }, old_reaction: list(oldEmoji), new_reaction: list(newEmoji), ...fields } } as Update;
}

test("a message link names the message at its end", () => {
  assert.equal(linkedMessageId("repeat of https://t.me/c/1234567890/412", CHAT), 412);
  assert.equal(linkedMessageId("repeat of t.me/c/1234567890/412", CHAT), 412);
  assert.equal(linkedMessageId("http://t.me/c/1234567890/412?single", CHAT), 412);
});

test("a link with a topic number in the middle still names the last number", () => {
  assert.equal(linkedMessageId("https://t.me/c/1234567890/5/412", CHAT), 412);
});

test("a link to another chat, a public link, or no link names no message", () => {
  assert.equal(linkedMessageId("https://t.me/c/999/412", CHAT), null);
  assert.equal(linkedMessageId("https://t.me/somegroup/412", CHAT), null);
  assert.equal(linkedMessageId("no link here", CHAT), null);
  assert.equal(linkedMessageId("", CHAT), null);
});

test("a chat whose link number only starts or ends like ours is another chat", () => {
  assert.equal(linkedMessageId("https://t.me/c/12345678901/412", CHAT), null);
  assert.equal(linkedMessageId("https://t.me/c/234567890/412", CHAT), null);
});

test("with several links the first one to this chat wins, and a chat without the -100 prefix links nothing", () => {
  assert.equal(linkedMessageId("https://t.me/c/999/1 and https://t.me/c/1234567890/2 and https://t.me/c/1234567890/3", CHAT), 2);
  assert.equal(linkedMessageId("https://t.me/c/1234567890/412", "-55"), null);
});

test("the maintainer's text message is kept with what it answers, its quote and its time", () => {
  const kept = maintainerMessagesIn([messageUpdate(1, { reply_to_message: { message_id: 101 }, quote: { text: "a paragraph" }, text: "wrong fight" })], CHAT, ME);
  assert.deepEqual(kept, [{
    updateId: 1, messageId: 10, replyToMessageId: 101, text: "wrong fight", quote: "a paragraph", kind: "text", linkMessageId: null,
    sentAt: new Date(1_700_000_000_000),
  }]);
});

test("a message that replies to nothing has no parent and no quote", () => {
  const [kept] = maintainerMessagesIn([messageUpdate(2)], CHAT, ME);
  assert.equal(kept.replyToMessageId, null);
  assert.equal(kept.quote, null);
});

test("a link in the text is parsed into its own field", () => {
  const [kept] = maintainerMessagesIn([messageUpdate(3, { text: "repeat of t.me/c/1234567890/88" })], CHAT, ME);
  assert.equal(kept.linkMessageId, 88);
});

test("a message from anyone else is dropped, whatever it says", () => {
  assert.deepEqual(maintainerMessagesIn([messageUpdate(4, { from: { id: 5555 } })], CHAT, ME), []);
});

test("an account whose number only starts or ends like the maintainer's is someone else", () => {
  assert.deepEqual(maintainerMessagesIn([messageUpdate(5, { from: { id: 42420 } }), messageUpdate(6, { from: { id: 424 } })], CHAT, ME), []);
});

test("a message with no sender, or from a bot, is dropped", () => {
  assert.deepEqual(maintainerMessagesIn([messageUpdate(7, { from: undefined }), messageUpdate(8, { from: { id: 4242, is_bot: true } })], CHAT, ME), []);
});

test("his message in another chat is dropped", () => {
  assert.deepEqual(maintainerMessagesIn([messageUpdate(9, { chat: { id: -1005 } })], CHAT, ME), []);
});

test("updates that are not messages are passed over", () => {
  assert.deepEqual(maintainerMessagesIn([{ update_id: 10 }, reactionUpdate(11, [], ["👍"])], CHAT, ME), []);
});

test("a photo or voice note is kept as its kind, with its caption as the text", () => {
  const kept = maintainerMessagesIn([
    messageUpdate(12, { text: undefined, caption: "the page", photo: [{}] }),
    messageUpdate(13, { text: undefined, voice: {} }),
    messageUpdate(14, { text: undefined, sticker: {} }),
    messageUpdate(15, { text: undefined }),
  ], CHAT, ME);
  assert.deepEqual(kept.map((message) => [message.kind, message.text]), [["photo", "the page"], ["voice", ""], ["sticker", ""], ["other", ""]]);
});

test("each of the five emoji is kept, with the user who put it there", () => {
  for (const emoji of ["👍", "👎", "🥱", "👀", "🤔"]) {
    assert.deepEqual(reactionsIn([reactionUpdate(20, [], [emoji])], CHAT), [{ updateId: 20, messageId: 77, emoji, oldEmoji: null, userId: 4242 }]);
  }
});

test("another emoji, a custom emoji, and another chat are not kept", () => {
  const custom = reactionUpdate(21, [], [], { new_reaction: [{ type: "custom_emoji", emoji: "👀" }] });
  assert.deepEqual(reactionsIn([reactionUpdate(22, [], ["🔥"]), custom, reactionUpdate(23, [], ["👀"], { chat: { id: -5 } })], CHAT), []);
});

test("someone else's emoji is kept with their id, so it cannot stand for the maintainer's", () => {
  assert.deepEqual(reactionsIn([reactionUpdate(24, [], ["👎"], { user: { id: 5555 } })], CHAT), [{ updateId: 24, messageId: 77, emoji: "👎", oldEmoji: null, userId: 5555 }]);
});

test("an anonymous reaction has no user id", () => {
  assert.equal(reactionsIn([reactionUpdate(25, [], ["👍"], { user: undefined })], CHAT)[0].userId, null);
});

test("taking an emoji off, and swapping it for an uncounted one, are kept as the old emoji taken back", () => {
  assert.deepEqual(reactionsIn([reactionUpdate(26, ["👀"], [])], CHAT), [{ updateId: 26, messageId: 77, emoji: null, oldEmoji: "👀", userId: 4242 }]);
  assert.deepEqual(reactionsIn([reactionUpdate(27, ["👎"], ["🔥"])], CHAT), [{ updateId: 27, messageId: 77, emoji: null, oldEmoji: "👎", userId: 4242 }]);
});

test("swapping one counted emoji for another is one change carrying both", () => {
  assert.deepEqual(reactionsIn([reactionUpdate(28, ["👍"], ["🥱"])], CHAT), [{ updateId: 28, messageId: 77, emoji: "🥱", oldEmoji: "👍", userId: 4242 }]);
});

test("the chat is compared as text, so a chat whose number only ends alike is another chat", () => {
  assert.deepEqual(reactionsIn([reactionUpdate(29, [], ["👍"], { chat: { id: -10012345678901 } })], CHAT), []);
});
