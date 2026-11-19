// Covers workflow/feedback.ts: the step that stores the maintainer's messages and
// the five emoji put on v0's messages. The network is replaced and the database
// is the fake, so this checks what the step reads, what it sends to the database,
// and in what order, not the SQL itself. The point that matters most: a batch is
// stored first and confirmed to Telegram only by asking for the next batch, so a
// failed store loses nothing, and a friend's message is never stored.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { storeFeedback } from "./feedback.ts";
import { FakeDatabase, makeContext, stubNetwork } from "./fake-database.ts";

const CHAT = "-1009";
const ME = "4242";

let restoreNetwork = () => {};
afterEach(() => restoreNetwork());

/**
 * A message update as Telegram sends it.
 *
 * @param updateId  The update's id.
 * @param from  The sender's account id.
 * @param fields  Message fields to set over the defaults.
 * @returns The update.
 */
function message(updateId: number, from = 4242, fields: Record<string, unknown> = {}) {
  return { update_id: updateId, message: { message_id: updateId * 10, date: 1_700_000_000, chat: { id: -1009 }, from: { id: from }, text: `note ${updateId}`, ...fields } };
}

/**
 * A reaction update as Telegram sends it.
 *
 * @param updateId  The update's id.
 * @param emoji  The emoji now on the message, or none.
 * @param chat  The chat's id.
 * @returns The update.
 */
function reaction(updateId: number, emoji: string | null, chat = -1009) {
  return { update_id: updateId, message_reaction: { chat: { id: chat }, message_id: 77, user: { id: 4242 }, old_reaction: [], new_reaction: emoji ? [{ type: "emoji", emoji }] : [] } };
}

/**
 * Makes Telegram answer each getUpdates call with the next batch, then nothing.
 *
 * @param batches  What is waiting, one list per call.
 * @returns The requests seen.
 */
function waiting(...batches: unknown[][]) {
  let call = 0;
  const stub = stubNetwork(() => ({ body: { ok: true, result: batches[call++] ?? [] } }));
  restoreNetwork = stub.restore;
  return stub.requests;
}

test("without a bot token, a chat id or the maintainer's account the step reads nothing and confirms nothing", async () => {
  const requests = waiting([message(1)]);
  const database = new FakeDatabase();
  await storeFeedback(makeContext(database), undefined, CHAT, ME);
  await storeFeedback(makeContext(database), "bot-token", undefined, ME);
  await storeFeedback(makeContext(database), "", CHAT, ME);
  await storeFeedback(makeContext(database), "bot-token", "", ME);
  assert.equal(requests.length, 0);
  assert.equal(database.queries.length, 0);
});

test("with no maintainer account the step fails closed: it does not ask Telegram, so his messages wait there, and says so", async (testContext) => {
  testContext.mock.method(console, "error", () => {});
  const requests = waiting([message(1)]);
  const context = makeContext(new FakeDatabase());
  await storeFeedback(context, "bot-token", CHAT, undefined);
  await storeFeedback(makeContext(new FakeDatabase()), "bot-token", CHAT, "");
  assert.equal(requests.length, 0);
  assert.equal(context.tally.feedback_no_maintainer, 1);
});

test("his message is stored with the message it answers, its text, kind, link and time", async () => {
  const database = new FakeDatabase();
  waiting([message(1, 4242, { reply_to_message: { message_id: 101 }, text: "repeat of t.me/c/9/88" })]);
  await storeFeedback(makeContext(database), "bot-token", "-1009", ME);
  const stored = database.inserted.telegram_messages.map((row) => row.params);
  assert.deepEqual(stored, [[1, 10, 101, "repeat of t.me/c/9/88", null, "text", 88, new Date(1_700_000_000_000)]]);
  assert.match(database.sent(/INSERT INTO telegram_messages/)[0].sql, /ON CONFLICT DO NOTHING/);
});

test("a friend's message is never stored, though its update is still confirmed", async () => {
  const database = new FakeDatabase();
  const requests = waiting([message(1, 5555), message(2)]);
  await storeFeedback(makeContext(database), "bot-token", CHAT, ME);
  assert.deepEqual(database.inserted.telegram_messages.map((row) => row.params[0]), [2]);
  assert.equal(requests[1].body.offset, 3);
});

test("each emoji change is stored with its update id, message, emoji, the emoji it replaced and who reacted", async () => {
  const database = new FakeDatabase();
  const taken = { ...reaction(2, null), message_reaction: { ...reaction(2, null).message_reaction, message_id: 88, old_reaction: [{ type: "emoji", emoji: "👀" }] } };
  waiting([reaction(1, "🥱"), taken]);
  await storeFeedback(makeContext(database), "bot-token", CHAT, ME);
  assert.deepEqual(database.inserted.reactions.map((row) => row.params), [[1, 77, "🥱", null, 4242], [2, 88, null, "👀", 4242]]);
  assert.match(database.sent(/INSERT INTO reactions/)[0].sql, /ON CONFLICT \(update_id\) DO NOTHING/);
});

test("a batch is stored in one transaction, then the next read confirms it from one past its highest update id", async () => {
  const database = new FakeDatabase();
  const requests = waiting([message(41), reaction(49, "👍"), message(44)]);
  await storeFeedback(makeContext(database), "bot-token", CHAT, ME);
  assert.deepEqual(database.transactionLog, ["BEGIN", "COMMIT"]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.offset, undefined);
  assert.equal(requests[1].body.offset, 50);
});

test("every batch waiting is read, one after another, until none is left", async () => {
  const database = new FakeDatabase();
  const requests = waiting([message(1), message(2)], [message(3)], [message(4)]);
  const context = makeContext(database);
  await storeFeedback(context, "bot-token", CHAT, ME);
  assert.deepEqual(requests.map((request) => request.body.offset), [undefined, 3, 4, 5]);
  assert.equal(context.tally.telegram_messages, 4);
  assert.equal(context.tally.feedback_reads, 1);
});

test("a failed store rolls back and confirms nothing, so Telegram sends the batch again", async () => {
  const database = new FakeDatabase();
  database.on(/INSERT INTO reactions/, () => {
    throw new Error("connection reset");
  });
  const requests = waiting([message(1), reaction(2, "👎")], [message(3)]);
  await assert.rejects(storeFeedback(makeContext(database), "bot-token", CHAT, ME), /connection reset/);
  assert.deepEqual(database.transactionLog, ["BEGIN", "ROLLBACK"]);
  assert.equal(requests.length, 1);
});

test("the run counts the messages and the emoji kept, not the updates read", async () => {
  waiting([message(1), message(2, 5555), reaction(3, "👍"), reaction(4, "🔥"), reaction(5, "👎", -5), { update_id: 6 }]);
  const context = makeContext(new FakeDatabase());
  await storeFeedback(context, "bot-token", CHAT, ME);
  assert.equal(context.tally.telegram_messages, 1);
  assert.equal(context.tally.reactions, 1);
});

test("nothing waiting stores nothing, opens no transaction, and still counts the read", async () => {
  const database = new FakeDatabase();
  waiting([]);
  const context = makeContext(database);
  await storeFeedback(context, "bot-token", CHAT, ME);
  assert.equal(database.queries.length, 0);
  assert.equal(context.tally.feedback_reads, 1);
});

test("a batch of updates that hold nothing of his stores nothing but is still confirmed", async () => {
  const database = new FakeDatabase();
  const requests = waiting([message(1, 5555), reaction(2, "🔥")]);
  await storeFeedback(makeContext(database), "bot-token", CHAT, ME);
  assert.equal(database.queries.length, 0);
  assert.equal(requests[1].body.offset, 3);
});
