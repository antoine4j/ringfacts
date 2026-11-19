// Covers workflow/reactions.ts: the step that stores the 👍 and 👎 put on v0's
// messages. The network is replaced and the database is the fake, so this
// checks what the step reads, what it sends to the database, and in what
// order, not the SQL itself (the unique update id that makes a second read of
// the same update harmless is the database's, and is only pinned here as text).
// The launch bar's thumbs-down share is counted from the rows this step writes.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { storeReactions } from "./reactions.ts";
import { FakeDatabase, makeContext, stubNetwork } from "./fake-database.ts";

const CHAT = "-1009";

let restoreNetwork = () => {};
afterEach(() => restoreNetwork());

/**
 * A reaction update as Telegram sends it.
 *
 * @param updateId  The update's id.
 * @param chat  The chat's id.
 * @param emoji  The emoji now on the message, or none.
 * @param messageId  The message reacted to.
 * @returns The update.
 */
function reactionUpdate(updateId: number, chat: number, emoji: string | null, messageId = 77) {
  return {
    update_id: updateId,
    message_reaction: { chat: { id: chat }, message_id: messageId, old_reaction: [], new_reaction: emoji ? [{ type: "emoji", emoji }] : [] },
  };
}

/**
 * Makes Telegram answer getUpdates with some updates.
 *
 * @param updates  What is waiting.
 * @returns The requests seen.
 */
function waiting(updates: unknown[]) {
  const stub = stubNetwork(() => ({ body: { ok: true, result: updates } }));
  restoreNetwork = stub.restore;
  return stub.requests;
}

test("without a bot token the step reads and stores nothing", async () => {
  const database = new FakeDatabase();
  const requests = waiting([reactionUpdate(1, -1009, "👍")]);
  const context = makeContext(database);
  await storeReactions(context, undefined, CHAT);
  assert.equal(requests.length, 0);
  assert.equal(database.queries.length, 0);
  assert.deepEqual(context.tally, {});
});

test("without a chat id the step does not even ask Telegram, so the update that names the chat is not confirmed away", async () => {
  const database = new FakeDatabase();
  const requests = waiting([reactionUpdate(1, -1009, "👍")]);
  const context = makeContext(database);
  await storeReactions(context, "bot-token", undefined);
  assert.equal(requests.length, 0);
  assert.equal(database.queries.length, 0);
});

test("an empty token or chat id counts as not configured", async () => {
  const requests = waiting([]);
  await storeReactions(makeContext(new FakeDatabase()), "", CHAT);
  await storeReactions(makeContext(new FakeDatabase()), "bot-token", "");
  assert.equal(requests.length, 0);
});

test("each kept reaction is stored with its update id, message, emoji and the emoji it replaced, in that order", async () => {
  const database = new FakeDatabase();
  const taken = reactionUpdate(2, -1009, null, 88);
  taken.message_reaction.old_reaction = [{ type: "emoji", emoji: "👎" }];
  waiting([reactionUpdate(1, -1009, "👍"), taken]);
  await storeReactions(makeContext(database), "bot-token", CHAT);
  const stored = database.inserted.reactions.map((row) => row.params);
  assert.deepEqual(stored, [[1, 77, "👍", null], [2, 88, null, "👎"]]);
});

test("a reaction already stored is skipped by the database, not stored twice", async () => {
  const database = new FakeDatabase();
  waiting([reactionUpdate(1, -1009, "👍")]);
  await storeReactions(makeContext(database), "bot-token", CHAT);
  const insert = database.sent(/INSERT INTO reactions/)[0].sql;
  assert.match(insert, /ON CONFLICT \(update_id\) DO NOTHING/);
});

test("reactions in other chats and other emoji are not stored, but their updates are still confirmed", async () => {
  const database = new FakeDatabase();
  const requests = waiting([reactionUpdate(1, -5, "👎"), reactionUpdate(2, -1009, "🔥")]);
  const context = makeContext(database);
  await storeReactions(context, "bot-token", CHAT);
  assert.equal(database.sent(/INSERT INTO reactions/).length, 0);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.offset, 3);
  assert.equal(context.tally.reactions, 0);
});

test("the run counts the reactions kept, not the updates read", async () => {
  waiting([reactionUpdate(1, -1009, "👍"), reactionUpdate(2, -5, "👍"), reactionUpdate(3, -1009, "👎"), { update_id: 4 }]);
  const context = makeContext(new FakeDatabase());
  await storeReactions(context, "bot-token", CHAT);
  assert.equal(context.tally.reactions, 2);
});

test("nothing waiting stores nothing and counts zero", async () => {
  const database = new FakeDatabase();
  waiting([]);
  const context = makeContext(database);
  await storeReactions(context, "bot-token", CHAT);
  assert.equal(database.queries.length, 0);
  assert.equal(context.tally.reactions, 0);
});

// Documents a suspected data-loss hazard, not a promise: readUpdates confirms a
// batch to Telegram before any row is written, so a database error while storing
// leaves the rest of the batch gone for good (Telegram will not send it again).
test("[suspected hazard] a failed write loses the reactions of the batch, which were already confirmed to Telegram", async () => {
  const database = new FakeDatabase();
  database.on(/INSERT INTO reactions/, () => {
    throw new Error("connection reset");
  });
  const requests = waiting([reactionUpdate(1, -1009, "👎"), reactionUpdate(2, -1009, "👎")]);
  await assert.rejects(storeReactions(makeContext(database), "bot-token", CHAT), /connection reset/);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.offset, 3);
});
