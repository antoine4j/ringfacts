import { test } from "node:test";
import assert from "node:assert/strict";
import { reactionsIn } from "./reactions.ts";

const CHAT = "-1009";
const update = (id: number, chat: number, oldEmoji: string[], newEmoji: string[]) => ({
  update_id: id,
  message_reaction: {
    chat: { id: chat }, message_id: 77,
    old_reaction: oldEmoji.map((emoji) => ({ type: "emoji", emoji })),
    new_reaction: newEmoji.map((emoji) => ({ type: "emoji", emoji })),
  },
});

test("a thumbs up or down in v0's chat is kept; other emoji and other chats are not", () => {
  const kept = reactionsIn([update(1, -1009, [], ["👍"]), update(2, -1009, [], ["🔥"]), update(3, -5, [], ["👎"])], CHAT);
  assert.deepEqual(kept, [{ updateId: 1, messageId: 77, emoji: "👍", oldEmoji: null }]);
});

test("taking a thumb back is kept as a change to nothing", () => {
  assert.deepEqual(reactionsIn([update(4, -1009, ["👎"], [])], CHAT), [{ updateId: 4, messageId: 77, emoji: null, oldEmoji: "👎" }]);
});

test("updates that are not reactions are passed over", () => {
  assert.deepEqual(reactionsIn([{ update_id: 5 }], CHAT), []);
});
