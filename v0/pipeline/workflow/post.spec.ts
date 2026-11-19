import { test } from "node:test";
import assert from "node:assert/strict";
import { newsLabel, tierOneMessage, postNewClaims, MAX_POST_AGE_HOURS } from "./post.ts";
import { FakeDatabase, makeContext } from "./fake-database.ts";
import { groupingText } from "../stations/grouping/grouping.ts";
import { newClaimLabel } from "../store/grouping.ts";

const ROW = { claim_id: 1, reading_id: 2, fighter: "Marko Testov", headline: "Testov booked", outlet: "Example <News>", url: "https://example.com/?a=1&b=2" };
const EXTRACT = { kind: "new_event" as const, claim: "Marko Testov will fight Ivan Rivalov at UFC 400.", occasion: "UFC announcement", actor: null, opponent: "Ivan Rivalov", event: "UFC 400", date: null };
const NO_CLAIM = { ...EXTRACT, kind: "restatement" as const, claim: "NO CLAIM", occasion: null };

test("a tier-1 post is the emoji, the underlined surname and the label, then the reading's own extract sentence and its link, escaped", () => {
  const message = tierOneMessage({ ...ROW, extract: EXTRACT, cell: "next_fight · official_or_done", outlets: 3 });
  assert.equal(
    message,
    '📅 <u>Testov</u> · Next fight · official\nMarko Testov will fight Ivan Rivalov at UFC 400.\n<a href="https://example.com/?a=1&amp;b=2">Example &lt;News&gt;</a> + 2 more outlets',
  );
});

test("the label names the kind and how firm it is; a result needs no firmness", () => {
  assert.deepEqual(newsLabel("result · official_or_done"), { emoji: "🏆", words: "Result" });
  assert.deepEqual(newsLabel("next_fight · reported"), { emoji: "📅", words: "Next fight · reported" });
  assert.deepEqual(newsLabel("health · none"), { emoji: "🩺", words: "Health" });
  assert.deepEqual(newsLabel(null), { emoji: "📰", words: "News" });
});

test("one outlet is not counted, and one other is singular", () => {
  assert.doesNotMatch(tierOneMessage({ ...ROW, extract: EXTRACT, cell: "result · official_or_done", outlets: 1 }), /more/);
  assert.match(tierOneMessage({ ...ROW, extract: EXTRACT, cell: "result · official_or_done", outlets: 2 }), /<\/a> \+ 1 more outlet$/);
});

test("a post with no claim sentence falls back to the headline", () => {
  assert.match(tierOneMessage({ ...ROW, extract: { claim: "NO CLAIM" } }), /\nTestov booked\n/);
});

test("the grouping text is occasion and claim, then headline and lead, as measured", () => {
  assert.equal(groupingText(EXTRACT, "Head", "Body " + "x".repeat(2000)).split("\n\n")[0], "UFC announcement: Marko Testov will fight Ivan Rivalov at UFC 400.");
  assert.equal(groupingText(EXTRACT, "Head", "x".repeat(2000)).length, "UFC announcement: Marko Testov will fight Ivan Rivalov at UFC 400.\n\nHead\n\n".length + 1500);
  assert.equal(groupingText(NO_CLAIM, "Head", "Body"), "Head\n\nBody");
});

test("a new claim is labelled by its first extract, or its headline when there is none", () => {
  assert.equal(newClaimLabel(EXTRACT, "Head"), EXTRACT.claim);
  assert.equal(newClaimLabel(NO_CLAIM, "Head"), "Head");
});

/**
 * A database whose "claims due to post" query returns some claims.
 *
 * @param claimIds  The due claims; each posts through the reading with ten times its id.
 * @returns The fake database.
 */
function dueDatabase(claimIds: number[]) {
  const database = new FakeDatabase();
  database.on(/WITH first_tier_one AS/, () => ({
    rows: claimIds.map((claimId) => ({ ...ROW, claim_id: claimId, reading_id: claimId * 10, extract: EXTRACT, cell: "result · official_or_done", outlets: 1 })),
  }));
  database.on(/^UPDATE (claims|readings)/, () => ({ rows: [], rowCount: 1 }));
  return database;
}

test("the claims due are looked up with the age limit, and a claim is posted once its message is sent", async () => {
  const database = dueDatabase([1]);
  const context = makeContext(database);
  const result = await postNewClaims(context);
  // News older than two days is not posted: the limit is 48 hours, whatever the constant is called.
  assert.equal(MAX_POST_AGE_HOURS, 48);
  assert.deepEqual(database.sent(/WITH first_tier_one AS/)[0].params, [48]);
  assert.deepEqual(result, { posted: 1 });
  assert.equal(context.messages.length, 1);
  assert.equal(context.tally.posted, 1);
});

test("a sent claim is marked on the claim and on its reading with the message id, claim first", async () => {
  const database = dueDatabase([1]);
  await postNewClaims(makeContext(database));
  const updates = database.queries.filter((query) => /^UPDATE (claims|readings)/.test(query.sql));
  assert.match(updates[0].sql, /^UPDATE claims SET posted_reading_id = \$1 WHERE id = \$2 AND posted_reading_id IS NULL/);
  assert.deepEqual(updates[0].params, [10, 1]);
  assert.match(updates[1].sql, /^UPDATE readings SET posted_at = now\(\), message_id = \$1/);
  assert.deepEqual(updates[1].params, [5000, 10]);
});

test("claims go out oldest first, each with its own message id", async () => {
  const database = dueDatabase([1, 2, 3]);
  const context = makeContext(database);
  await postNewClaims(context);
  const readingUpdates = database.sent(/^UPDATE readings SET posted_at/).map((query) => query.params);
  assert.deepEqual(readingUpdates, [[5000, 10], [5001, 20], [5002, 30]]);
});

test("nothing due posts nothing and counts zero", async () => {
  const database = dueDatabase([]);
  const context = makeContext(database);
  assert.deepEqual(await postNewClaims(context), { posted: 0 });
  assert.deepEqual(context.messages, []);
  assert.equal(context.tally.posted, 0);
});

test("a claim that only printed is counted as posted but left unmarked, so a real run can still post it", async () => {
  const database = dueDatabase([1]);
  const context = makeContext(database, { poster: async () => null });
  assert.deepEqual(await postNewClaims(context), { posted: 1 });
  assert.equal(database.sent(/^UPDATE/).length, 0);
});

test("a send that fails is counted, leaves that claim unmarked, and does not stop the next claim", async (testContext) => {
  testContext.mock.method(console, "error", () => {});
  const database = dueDatabase([1, 2]);
  let sent = 0;
  const context = makeContext(database, {
    poster: async () => {
      sent += 1;
      if (sent === 1) throw new Error("Telegram 502");
      return 6000;
    },
  });
  assert.deepEqual(await postNewClaims(context), { posted: 1 });
  assert.equal(context.tally.post_failed, 1);
  assert.deepEqual(database.sent(/^UPDATE claims/).map((query) => query.params), [[20, 2]]);
});

// The next two tests document a suspected hazard, they do not endorse it. A post
// is sent first and marked in two separate statements after, outside one
// transaction. If the first marking fails, the message is in the chat but the
// claim is not marked, so the next run posts it again. If only the second fails,
// the claim is marked posted but its reading has no posted_at or message id, so
// the launch bar's posts and thumbs-down share leave it out. Both need a database
// error at that moment; fixing them changes how v0 runs, so they are left for the maintainer.
test("[suspected hazard] a failure marking the claim after the send leaves it due, to be posted again next run", async (testContext) => {
  testContext.mock.method(console, "error", () => {});
  const database = dueDatabase([1]);
  database.on(/^UPDATE claims/, () => {
    throw new Error("connection reset");
  });
  const context = makeContext(database);
  await postNewClaims(context);
  assert.equal(context.messages.length, 1);
  assert.equal(context.tally.post_failed, 1);
  assert.equal(database.sent(/^UPDATE readings/).length, 0);
});

test("[suspected hazard] a failure marking the reading leaves the claim marked posted with no message id", async (testContext) => {
  testContext.mock.method(console, "error", () => {});
  const database = dueDatabase([1]);
  database.on(/^UPDATE readings/, () => {
    throw new Error("connection reset");
  });
  const context = makeContext(database);
  await postNewClaims(context);
  assert.equal(database.sent(/^UPDATE claims/).length, 1);
  assert.equal(context.messages.length, 1);
  assert.equal(context.tally.post_failed, 1);
});
