// Covers lib/telegram.ts: how the maintainer's Telegram notes come back grouped
// under their claims and digests, what the inbox and the waiting marks ask the
// database for, and the two small pure rules (when a read is too old to trust,
// how a note's post is named). The database is a fake pool, so these check the
// values sent and the shape of what comes back, not the SQL's own selection.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { emojiMarksInForce, inboxNotes, isStale, lastFeedbackRead, notesForClaims, notesForDigests, postWords, STALE_AFTER_HOURS, type TelegramNote } from "./telegram.ts";
import { FakePool } from "./fake-pool.ts";

let pool: FakePool;
afterEach(() => pool?.restore());

/**
 * A note as the notes query returns it.
 *
 * @param fields  Fields to set over the defaults: message 140, answering post 101 of claim 7.
 * @returns The row.
 */
function note(fields: Partial<TelegramNote> = {}): TelegramNote {
  return {
    message_id: "140", text: "wrong fight", quote: null, kind: "text", sent_at: new Date("2026-11-19T12:00:00Z"), reply_to_message_id: "101",
    post_message_id: "101", post_kind: "post", post_reading_id: "70", post_digest_id: null, post_part: 1, repeats_message_id: null, repeats_kind: null,
    repeats_claim_id: null, claim_id: "7", claim_label: "Topuria booked", digest_fighter: null, digest_period_end: null, ...fields,
  };
}

test("no claims and no digests ask nothing", async () => {
  pool = new FakePool().install();
  assert.deepEqual([...await notesForClaims([])], []);
  assert.deepEqual([...await notesForDigests([])], []);
  assert.equal(pool.queries.length, 0);
});

test("notes come back grouped under their claims, in the order the query returned them, and a note with no claim is left out", async () => {
  pool = new FakePool().install().on(/FROM telegram_notes/, [note({ message_id: "1", claim_id: "7" }), note({ message_id: "2", claim_id: "8" }), note({ message_id: "3", claim_id: "7" }), note({ message_id: "4", claim_id: null })]);
  const byClaim = await notesForClaims(["7", "8"]);
  assert.deepEqual([...byClaim.keys()], ["7", "8"]);
  assert.deepEqual(byClaim.get("7")?.map((row) => row.message_id), ["1", "3"]);
  assert.deepEqual(pool.queries[0].values, [["7", "8"]]);
  assert.match(pool.queries[0].sql, /ORDER BY n\.sent_at, n\.message_id/);
});

test("a claim's notes are the ones that end at its posted reading", async () => {
  pool = new FakePool().install().on(/FROM telegram_notes/, []);
  await notesForClaims(["7"]);
  assert.match(pool.queries[0].sql, /LEFT JOIN claims c ON c\.posted_reading_id = n\.post_reading_id/);
  assert.match(pool.queries[0].sql, /WHERE c\.id = ANY\(\$1::bigint\[\]\)/);
});

test("notes come back grouped under their digests, whichever part they were on", async () => {
  pool = new FakePool().install().on(/FROM telegram_notes/, [note({ message_id: "5", post_kind: "digest", post_digest_id: "3", post_part: 2, claim_id: null }), note({ message_id: "6", post_kind: "digest", post_digest_id: "3", post_part: 1, claim_id: null })]);
  const byDigest = await notesForDigests(["3"]);
  assert.deepEqual(byDigest.get("3")?.map((row) => row.post_part), [2, 1]);
  assert.match(pool.queries[0].sql, /WHERE n\.post_digest_id = ANY\(\$1::bigint\[\]\)/);
});

test("the inbox puts notes that reach no post first, then newest first, and stops at its limit", async () => {
  pool = new FakePool().install().on(/FROM telegram_notes/, []);
  await inboxNotes();
  assert.match(pool.queries[0].sql, /ORDER BY \(n\.post_message_id IS NULL\) DESC, n\.sent_at DESC/);
  assert.match(pool.queries[0].sql, /LIMIT 200/);
});

test("the emoji in force are his newest on a message, only the two that mark a claim, and take his account from the setting", async () => {
  pool = new FakePool().install().on(/WITH newest AS/, []);
  await emojiMarksInForce("4242");
  assert.deepEqual(pool.queries[0].values, ["4242"]);
  assert.match(pool.queries[0].sql, /DISTINCT ON \(re\.message_id, re\.user_id\)/);
  assert.match(pool.queries[0].sql, /ORDER BY re\.message_id, re\.user_id, re\.update_id DESC/);
  assert.match(pool.queries[0].sql, /nw\.emoji IN \('🥱', '🤔'\)/);
  assert.match(pool.queries[0].sql, /sm\.kind = 'post'/);
  assert.match(pool.queries[0].sql, /\$1 = '' OR re\.user_id IS NULL OR re\.user_id::text = \$1/);
  assert.doesNotMatch(pool.queries[0].sql, /review_tiers|review_claim_notes/);
});

test("the last read is the newest run that counted a read, or none", async () => {
  pool = new FakePool().install().on(/FROM runs/, [{ finished_at: new Date("2026-11-19T10:00:00Z") }]);
  assert.deepEqual(await lastFeedbackRead(), new Date("2026-11-19T10:00:00Z"));
  assert.match(pool.queries[0].sql, /counts \? 'feedback_reads'/);
  pool.on(/FROM runs/, []);
  assert.equal(await lastFeedbackRead(), null);
});

test("a read older than the limit, or none at all, is stale; exactly the limit is not", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  assert.equal(isStale(null, now), true);
  assert.equal(isStale(new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000 - 1), now), true);
  assert.equal(isStale(new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000), now), false);
  assert.equal(isStale(new Date(now.getTime() - 60_000), now), false);
});

test("a note's post is named by what it is", () => {
  assert.equal(postWords(note()), "claim #7 · Topuria booked");
  assert.equal(postWords(note({ claim_label: null })), "claim #7");
  assert.equal(postWords(note({ post_kind: "digest", post_digest_id: "3", digest_fighter: "Ilia Topuria", post_part: 2, claim_id: null })), "digest #3 (Ilia Topuria), part 2");
  assert.equal(postWords(note({ post_kind: "digest", post_digest_id: "3", digest_fighter: null, post_part: 1, claim_id: null })), "digest #3");
  assert.equal(postWords(note({ post_kind: "daily", claim_id: null })), "the daily counts");
  assert.equal(postWords(note({ post_message_id: null, post_kind: null, claim_id: null })), "no post reached");
});
