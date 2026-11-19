// Covers lib/score-queries.ts: the questions the scores page asks. The database
// is a fake pool, so these specs check the values sent (the Pacific-day range
// in the right order and numbering) and how the rows become the shapes
// lib/scores.ts counts: a post's claim and time, a claim's facts for a career
// event, which readings joined when. The SQL's own selection is not run here
// and is only pinned where a wrong word would change a launch-bar number.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { claimFacts, claimsInPeriod, claimsMarkedRepeatByLink, digestsInPeriod, firstUsedRows, latestDigestReaction, postsInPeriod, reviewTimes, sameClaimMarks, versionRows } from "./score-queries.ts";
import { FakePool } from "./fake-pool.ts";

let pool: FakePool;
afterEach(() => pool?.restore());

const POSTED_AT = new Date("2026-10-05T18:00:00Z");

test("every post ever sent is asked for with no days, and each row becomes a claim, a time and the latest reaction", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, [{ claim_id: "7", posted_at: POSTED_AT, latest: "👎", noted: false }, { claim_id: "8", posted_at: POSTED_AT, latest: null, noted: true }]);
  const posts = await postsInPeriod(null);
  assert.deepEqual(posts, [{ claimId: "7", postedAt: POSTED_AT, latest: "👎", noted: false }, { claimId: "8", postedAt: POSTED_AT, latest: null, noted: true }]);
  assert.deepEqual(pool.queries[0].values, []);
  assert.doesNotMatch(pool.queries[0].sql, /::date/);
});

test("a post is a claim's posted reading with a post time, and its reaction is on that reading's message", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, []);
  await postsInPeriod(null);
  const sql = pool.queries[0].sql;
  assert.match(sql, /JOIN readings r ON r\.id = c\.posted_reading_id/);
  assert.match(sql, /WHERE r\.posted_at IS NOT NULL/);
  assert.match(sql, /re\.message_id = r\.message_id/);
});

test("a period's first and last day are sent in that order and compared as Pacific days, both ends included", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, []);
  await postsInPeriod({ from: "2026-10-01", to: "2026-10-07" });
  const { sql, values } = pool.queries[0];
  assert.deepEqual(values, ["2026-10-01", "2026-10-07"]);
  assert.match(sql, /\(r\.posted_at AT TIME ZONE 'America\/Los_Angeles'\)::date >= \$1::date/);
  assert.match(sql, /\(r\.posted_at AT TIME ZONE 'America\/Los_Angeles'\)::date <= \$2::date/);
});

test("a period open at the start sends one value, numbered $1", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, []);
  await postsInPeriod({ from: null, to: "2026-10-07" });
  assert.deepEqual(pool.queries[0].values, ["2026-10-07"]);
  assert.match(pool.queries[0].sql, /<= \$1::date/);
  assert.doesNotMatch(pool.queries[0].sql, />= \$/);
});

test("a period open at the end sends one value too", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, []);
  await postsInPeriod({ from: "2026-10-01", to: null });
  assert.deepEqual(pool.queries[0].values, ["2026-10-01"]);
  assert.match(pool.queries[0].sql, />= \$1::date/);
  assert.doesNotMatch(pool.queries[0].sql, /<= \$/);
});

test("a post is noted when a reply of his ends at its reading", async () => {
  pool = new FakePool().install().on(/FROM claims c JOIN readings r/, []);
  await postsInPeriod(null);
  assert.match(pool.queries[0].sql, /EXISTS \(SELECT 1 FROM telegram_notes n WHERE n\.post_reading_id = r\.id\) AS noted/);
});

test("digests are the ones sent and not history, each with the latest emoji over all its parts and whether a reply of his reached it", async () => {
  pool = new FakePool().install().on(/FROM digests d/, [{ id: "3", latest: "👍", noted: false }]);
  assert.deepEqual(await digestsInPeriod({ from: "2026-10-01", to: "2026-10-07" }), [{ id: "3", latest: "👍", noted: false }]);
  const { sql, values } = pool.queries[0];
  assert.deepEqual(values, ["2026-10-01", "2026-10-07"]);
  assert.match(sql, /d\.posted_at IS NOT NULL AND NOT d\.backfill/);
  assert.match(sql, /sm\.digest_id = d\.id/);
  assert.match(sql, /EXISTS \(SELECT 1 FROM telegram_notes n WHERE n\.post_digest_id = d\.id\) AS noted/);
  assert.match(sql, /\(d\.posted_at AT TIME ZONE 'America\/Los_Angeles'\)::date >= \$1::date/);
});

test("no career events means no question about claims", async () => {
  pool = new FakePool().install();
  assert.equal((await claimFacts([])).size, 0);
  assert.equal(pool.queries.length, 0);
});

test("a claim's facts are keyed by its number, with its best tier as a word", async () => {
  const row = (id: string, bestTier: number | null, changes = {}) => ({ id, posted: false, best_tier: bestTier, in_posted_digest: false, digest_still_due: false, ...changes });
  pool = new FakePool().install().on(/FROM claims c/, [
    row("1", 1, { posted: true, in_posted_digest: true }), row("2", 2, { digest_still_due: true }), row("3", 3), row("4", null),
  ]);
  const facts = await claimFacts([1, 2, 3, 4, 99]);
  assert.deepEqual(pool.queries[0].values, [[1, 2, 3, 4, 99]]);
  assert.deepEqual(facts.get(1), { tier: "post", posted: true, inPostedDigest: true, digestStillDue: false });
  assert.deepEqual(facts.get(2), { tier: "digest", posted: false, inPostedDigest: false, digestStillDue: true });
  assert.deepEqual(facts.get(3), { tier: "drop", posted: false, inPostedDigest: false, digestStillDue: false });
  assert.equal(facts.get(4)?.tier, null);
  assert.equal(facts.has(99), false);
});

test("a best tier that arrives as text is still read as its number", async () => {
  pool = new FakePool().install().on(/FROM claims c/, [{ id: "5", posted: false, best_tier: "1", in_posted_digest: false, digest_still_due: false }]);
  assert.equal((await claimFacts([5])).get(5)?.tier, "post");
});

test("a claim counts as posted by its posted reading, and as in a digest only when a posted digest used it", async () => {
  pool = new FakePool().install().on(/FROM claims c/, []);
  await claimFacts([1]);
  const sql = pool.queries[0].sql;
  assert.match(sql, /c\.posted_reading_id IS NOT NULL AS posted/);
  assert.match(sql, /dc\.used AND d\.posted_at IS NOT NULL/);
  assert.match(sql, /d\.posted_at IS NOT NULL\s+AND d\.period_end >/);
});

test("the versions behind no claims are none, without a question", async () => {
  pool = new FakePool().install();
  assert.deepEqual(await versionRows([]), []);
  assert.equal(pool.queries.length, 0);
});

test("the versions of some claims are asked for by claim and returned as they are", async () => {
  const rows = [{ classifier_version: "v7.7", grouping_version: "g1", settings_version: 3, readings: "9" }];
  pool = new FakePool().install().on(/FROM reading_now WHERE claim_id/, rows);
  assert.deepEqual(await versionRows(["1", "2"]), rows);
  assert.deepEqual(pool.queries[0].values, [["1", "2"]]);
});

test("when each version was first used is returned as it is", async () => {
  const rows = [{ station: "classifier", version: "v7.7", first_used: POSTED_AT }];
  pool = new FakePool().install().on(/FROM classifications/, rows);
  assert.deepEqual(await firstUsedRows(), rows);
});

test("no claims has no review times, without a question", async () => {
  pool = new FakePool().install();
  const times = await reviewTimes([]);
  assert.equal(times.lastMarkAt.size, 0);
  assert.equal(times.joinedAt.size, 0);
  assert.equal(pool.queries.length, 0);
});

test("review times give each claim its newest mark and every reading's join time under it", async () => {
  const early = new Date("2026-10-04T10:00:00Z");
  const late = new Date("2026-10-06T10:00:00Z");
  pool = new FakePool().install()
    .on(/FROM review_readings/, [{ claim_id: "1", at: late }, { claim_id: "2", at: early }])
    .on(/FROM groupings/, [
      { claim_id: "1", reading_id: "11", at: early }, { claim_id: "1", reading_id: "12", at: late }, { claim_id: "2", reading_id: "21", at: early },
    ]);
  const times = await reviewTimes(["1", "2"]);
  assert.deepEqual([...times.lastMarkAt], [["1", late], ["2", early]]);
  assert.deepEqual([...(times.joinedAt.get("1") ?? [])], [["11", early], ["12", late]]);
  assert.deepEqual([...(times.joinedAt.get("2") ?? [])], [["21", early]]);
});

test("a reading's join time is its first grouping into the claim, not a later one", async () => {
  pool = new FakePool().install().on(/FROM review_readings/, []).on(/FROM groupings/, []);
  await reviewTimes(["1"]);
  assert.match(pool.sent(/FROM groupings/)[0].sql, /min\(created_at\) AS at FROM groupings/);
});

test("the same-claim marks are every row, left to lib/reviews.ts to read", async () => {
  const marks = [{ id: "1", claim_id: "1", other_claim_id: "2", verdict: "same_claim", note: "" }];
  pool = new FakePool().install().on(/FROM review_same_claims/, marks);
  assert.deepEqual(await sameClaimMarks(), marks);
});

test("all time asks for every claim and passes no days", async () => {
  pool = new FakePool().install().on(/SELECT cn\.id FROM claim_now cn/, [{ id: "1" }, { id: "2" }]).on(/FROM groupings g/, []).on(/FROM review_/, []);
  const period = await claimsInPeriod(null);
  assert.deepEqual(period.ids, ["1", "2"]);
  assert.deepEqual(pool.sent(/SELECT cn\.id/)[0].values, []);
  assert.doesNotMatch(pool.sent(/SELECT cn\.id/)[0].sql, /WHERE/);
});

test("a period asks for the claims with a reading published in it, by Pacific day", async () => {
  pool = new FakePool().install().on(/SELECT cn\.id FROM claim_now cn/, []);
  await claimsInPeriod({ from: "2026-10-01", to: "2026-10-07" });
  const { sql, values } = pool.sent(/SELECT cn\.id/)[0];
  assert.deepEqual(values, ["2026-10-01", "2026-10-07"]);
  assert.match(sql, /published_at AT TIME ZONE 'America\/Los_Angeles'\)::date >= /);
  assert.match(sql, /published_at AT TIME ZONE 'America\/Los_Angeles'\)::date <= /);
});

test("a period open at one end filters on the other end only", async () => {
  pool = new FakePool().install().on(/SELECT cn\.id FROM claim_now cn/, []);
  await claimsInPeriod({ from: null, to: "2026-10-07" });
  assert.deepEqual(pool.sent(/SELECT cn\.id/)[0].values, ["2026-10-07"]);
});

test("a period with no claims asks nothing more", async () => {
  pool = new FakePool().install().on(/SELECT cn\.id FROM claim_now cn/, []);
  const period = await claimsInPeriod({ from: "2026-10-01", to: "2026-10-07" });
  assert.deepEqual(period.ids, []);
  assert.equal(period.members.size, 0);
  assert.equal(period.views.size, 0);
  assert.equal(pool.queries.length, 1);
});

test("a period's claims come with their readings and review views", async () => {
  pool = new FakePool().install()
    .on(/SELECT cn\.id FROM claim_now cn/, [{ id: "1" }])
    .on(/FROM groupings g/, [{ claim_id: "1", reading_id: "11", tier: 1, published_at: POSTED_AT }])
    .on(/FROM review_readings/, [{ id: "1", reading_id: "11", claim_id: "1", verdict: "belongs", belongs_in_claim_id: null, note: "" }])
    .on(/FROM review_same_claims/, []);
  const period = await claimsInPeriod(null);
  assert.deepEqual(period.members.get("1")?.map((row) => row.reading_id), ["11"]);
  assert.equal(period.views.get("1")?.review.state, "reviewed");
});

test("a 👎 on any part of a digest is the digest's emoji; otherwise the newest emoji on any part", () => {
  const expression = latestDigestReaction("d.id");
  assert.match(expression, /CASE WHEN bool_or\(part\.emoji = '👎'\) THEN '👎' ELSE \(array_agg\(part\.emoji ORDER BY part\.update_id DESC\)\)\[1\] END/);
  assert.match(expression, /DISTINCT ON \(re\.message_id\)/);
  assert.match(expression, /JOIN sent_messages sm ON sm\.message_id = re\.message_id/);
});

test("a digest column without its table name is refused", () => {
  assert.throws(() => latestDigestReaction("id"), /needs a qualified column/);
});

test("the claims marked a repeat by a link are those with a note naming another post, never the post it replies to", async () => {
  pool = new FakePool().install().on(/FROM telegram_notes n JOIN claims c/, [{ claim_id: "7" }, { claim_id: "9" }, { claim_id: "7" }]);
  assert.deepEqual([...await claimsMarkedRepeatByLink()], ["7", "9"]);
  assert.match(pool.queries[0].sql, /n\.repeats_message_id IS NOT NULL AND n\.repeats_message_id <> n\.post_message_id/);
});
