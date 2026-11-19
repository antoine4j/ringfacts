// Covers the Telegram reactions station: which updates become stored
// reactions (only a 👍 or 👎 in v0's own chat), and how a batch of updates is
// read and then confirmed. The network is replaced, so nothing leaves the
// machine. The thumbs-down share of the launch bar is counted from what this
// file lets through, so a wrong emoji or chat here changes the bar unseen.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { reactionsIn, readUpdates } from "./reactions.ts";
import { stubNetwork } from "../../workflow/fake-database.ts";

const CHAT = "-1009";
const update = (id: number, chat: number, oldEmoji: string[], newEmoji: string[]) => ({
  update_id: id,
  message_reaction: {
    chat: { id: chat }, message_id: 77,
    old_reaction: oldEmoji.map((emoji) => ({ type: "emoji", emoji })),
    new_reaction: newEmoji.map((emoji) => ({ type: "emoji", emoji })),
  },
});

let restoreNetwork = () => {};
afterEach(() => restoreNetwork());

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

test("changing a thumbs up to a thumbs down is one change carrying both", () => {
  assert.deepEqual(reactionsIn([update(6, -1009, ["👍"], ["👎"])], CHAT), [{ updateId: 6, messageId: 77, emoji: "👎", oldEmoji: "👍" }]);
});

test("swapping a thumb for another emoji is kept as the thumb taken back", () => {
  // The latest reaction then reads as none, so the message stops counting as 👎.
  assert.deepEqual(reactionsIn([update(7, -1009, ["👎"], ["🔥"])], CHAT), [{ updateId: 7, messageId: 77, emoji: null, oldEmoji: "👎" }]);
});

test("a thumb among other emoji is found wherever it stands in the list", () => {
  assert.deepEqual(reactionsIn([update(8, -1009, ["🔥", "❤"], ["🔥", "👎"])], CHAT), [{ updateId: 8, messageId: 77, emoji: "👎", oldEmoji: null }]);
});

test("only the 👍 and 👎 emoji count, not look-alikes", () => {
  assert.deepEqual(reactionsIn([update(9, -1009, [], ["👌"]), update(10, -1009, [], ["🖕"]), update(11, -1009, [], ["❤"])], CHAT), []);
});

test("a custom or paid reaction is not an emoji and is passed over, even with an emoji field", () => {
  const custom = { update_id: 12, message_reaction: { chat: { id: -1009 }, message_id: 77, old_reaction: [], new_reaction: [{ type: "custom_emoji", emoji: "👍" }, { type: "paid" }] } };
  assert.deepEqual(reactionsIn([custom], CHAT), []);
});

test("the chat is compared as text, so a chat whose number only ends alike is another chat", () => {
  assert.deepEqual(reactionsIn([update(13, -10090, [], ["👍"]), update(14, -100, [], ["👍"]), update(15, 1009, [], ["👍"])], CHAT), []);
});

test("every kept change carries its own update id and message, in the order read", () => {
  const first = update(20, -1009, [], ["👍"]);
  const second = { ...update(21, -1009, [], ["👎"]), message_reaction: { ...update(21, -1009, [], ["👎"]).message_reaction, message_id: 88 } };
  const kept = reactionsIn([first, second], CHAT);
  assert.deepEqual(kept.map((reaction) => [reaction.updateId, reaction.messageId]), [[20, 77], [21, 88]]);
});

test("a batch of no updates is no reactions", () => {
  assert.deepEqual(reactionsIn([], CHAT), []);
});

test("the waiting updates are asked for with reactions allowed, and returned as Telegram sent them", async () => {
  const waiting = [update(30, -1009, [], ["👍"]), update(31, -1009, [], ["👎"])];
  const stub = stubNetwork(() => ({ body: { ok: true, result: waiting } }));
  restoreNetwork = stub.restore;
  const read = await readUpdates("bot-token");
  assert.deepEqual(read, waiting);
  assert.equal(stub.requests[0].url, "https://api.telegram.org/botbot-token/getUpdates");
  assert.deepEqual(stub.requests[0].body, { timeout: 0, allowed_updates: ["message", "my_chat_member", "message_reaction"] });
});

test("what was read is confirmed by asking again from one past the highest update id, whatever the order", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true, result: [update(41, -1009, [], ["👍"]), update(49, -1009, [], ["👎"]), update(44, -1009, [], ["👍"])] } }));
  restoreNetwork = stub.restore;
  await readUpdates("bot-token");
  assert.equal(stub.requests.length, 2);
  assert.equal(stub.requests[1].body.offset, 50);
  assert.equal(stub.requests[1].body.limit, 1);
  assert.equal(stub.requests[1].url, stub.requests[0].url);
});

test("with nothing waiting there is nothing to confirm", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true, result: [] } }));
  restoreNetwork = stub.restore;
  assert.deepEqual(await readUpdates("bot-token"), []);
  assert.equal(stub.requests.length, 1);
});

test("a reply with no result list is read as no updates", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true } }));
  restoreNetwork = stub.restore;
  assert.deepEqual(await readUpdates("bot-token"), []);
  assert.equal(stub.requests.length, 1);
});

test("a refusal from Telegram is thrown, and nothing is confirmed", async () => {
  const stub = stubNetwork(() => ({ status: 401, body: { ok: false } }));
  restoreNetwork = stub.restore;
  await assert.rejects(readUpdates("bot-token"), /Telegram getUpdates 401/);
  assert.equal(stub.requests.length, 1);
});
