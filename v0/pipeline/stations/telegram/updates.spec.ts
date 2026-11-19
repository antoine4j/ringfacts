// Covers reading Telegram's updates a batch at a time. The network is replaced.
// What matters: a batch is asked for with the five-emoji list allowed, the next
// batch is asked for from one past the stored one (which is what confirms it),
// and a refusal from Telegram throws, so the caller stores nothing and confirms
// nothing.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readBatch } from "./updates.ts";
import { stubNetwork } from "../../workflow/fake-database.ts";

let restoreNetwork = () => {};
afterEach(() => restoreNetwork());

test("the first batch is asked for with messages and reactions allowed, up to 100, and returned as Telegram sent it", async () => {
  const waiting = [{ update_id: 30 }, { update_id: 31 }];
  const stub = stubNetwork(() => ({ body: { ok: true, result: waiting } }));
  restoreNetwork = stub.restore;
  assert.deepEqual(await readBatch("bot-token"), waiting);
  assert.equal(stub.requests[0].url, "https://api.telegram.org/botbot-token/getUpdates");
  assert.deepEqual(stub.requests[0].body, { timeout: 0, limit: 100, allowed_updates: ["message", "my_chat_member", "message_reaction"] });
});

test("a later batch is asked for from the offset given, which confirms everything before it", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true, result: [] } }));
  restoreNetwork = stub.restore;
  await readBatch("bot-token", 50);
  assert.equal(stub.requests[0].body.offset, 50);
});

test("an offset of zero is still sent", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true, result: [] } }));
  restoreNetwork = stub.restore;
  await readBatch("bot-token", 0);
  assert.equal(stub.requests[0].body.offset, 0);
});

test("a reply with no result list is read as no updates", async () => {
  const stub = stubNetwork(() => ({ body: { ok: true } }));
  restoreNetwork = stub.restore;
  assert.deepEqual(await readBatch("bot-token"), []);
});

test("a refusal from Telegram is thrown", async () => {
  const stub = stubNetwork(() => ({ status: 401, body: { ok: false } }));
  restoreNetwork = stub.restore;
  await assert.rejects(readBatch("bot-token"), /Telegram getUpdates 401/);
  assert.equal(stub.requests.length, 1);
});
