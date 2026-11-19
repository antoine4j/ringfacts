// Covers lib/queries.ts: the questions more than one page asks. The database
// is a fake pool, so these specs check the values sent and how the rows come
// back (grouped under their claims, a cleared note dropped), not the SQL's
// own selection. The latest reaction on a message is what the launch bar's
// thumbs-down share reads, so how it is written matters here.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { claimMembers, claimNotesFor, claimReviews, latestHisEmoji, latestReaction, LOOKS_WRONG_NOTE, reviewsFor, tierMarksFor, type MemberRow } from "./queries.ts";
import { FakePool } from "./fake-pool.ts";

let pool: FakePool;
afterEach(() => pool?.restore());

/**
 * A reading of a claim as the members query returns it.
 *
 * @param claimId  The claim.
 * @param readingId  The reading.
 * @returns The row.
 */
function member(claimId: string, readingId: string): MemberRow {
  return {
    claim_id: claimId, reading_id: readingId, pick: null, headline: `Headline ${readingId}`, url: "https://example.com", outlet: "Example",
    published_at: new Date("2026-10-05T12:00:00Z"), tier: 1, cell: null, centrality: null, sentence: null, posted_at: null, reaction: null,
  };
}

test("the latest reaction is the newest update of that message, and it names the message's own table", () => {
  const expression = latestReaction("r.message_id");
  assert.match(expression, /FROM reactions re WHERE re\.message_id = r\.message_id ORDER BY re\.update_id DESC LIMIT 1/);
});

test("a message column without its table name is refused, since it would name the reaction's own", () => {
  assert.throws(() => latestReaction("message_id"), /needs a qualified column/);
});

test("no claims asks nothing and holds nothing", async () => {
  pool = new FakePool().install();
  assert.deepEqual([...await claimMembers("public", [])], []);
  assert.deepEqual(await tierMarksFor([]), []);
  assert.deepEqual(await reviewsFor("public", []), { readingMarks: [], sameMarks: [] });
  assert.deepEqual([...await claimNotesFor([])], []);
  assert.equal(pool.queries.length, 0);
});

test("the readings come back grouped under their claims, in the order the query returned them", async () => {
  pool = new FakePool().install().on(/FROM groupings g/, [member("1", "11"), member("2", "21"), member("1", "12")]);
  const byClaim = await claimMembers("public", ["1", "2"]);
  assert.deepEqual([...byClaim.keys()], ["1", "2"]);
  assert.deepEqual(byClaim.get("1")?.map((row) => row.reading_id), ["11", "12"]);
  assert.deepEqual(byClaim.get("2")?.map((row) => row.reading_id), ["21"]);
  assert.deepEqual(pool.queries[0].values, [["1", "2"]]);
});

test("a reading is taken from the claim's newest grouping of it, so a re-grouped reading shows once", async () => {
  pool = new FakePool().install().on(/FROM groupings g/, []);
  await claimMembers("public", ["1"]);
  assert.match(pool.queries[0].sql, /DISTINCT ON \(g\.claim_id, g\.reading_id\)/);
  assert.match(pool.queries[0].sql, /ORDER BY g\.claim_id, g\.reading_id, g\.id DESC/);
});

test("the readings' reactions are the latest reaction on each reading's own message", async () => {
  pool = new FakePool().install().on(/FROM groupings g/, []);
  await claimMembers("public", ["1"]);
  assert.match(pool.queries[0].sql, /re\.message_id = rn\.message_id/);
});

test("tier marks are asked for by claim and returned as they are", async () => {
  const marks = [{ id: "1", claim_id: "5", tier_had: 1, verdict: "wrong", should_be_tier: 2, note: "" }];
  pool = new FakePool().install().on(/FROM review_tiers/, marks);
  assert.deepEqual(await tierMarksFor(["5"]), marks);
  assert.deepEqual(pool.queries[0].values, [["5"], ""]);
});

test("a 🥱 on a claim's posted message is a wrong-tier mark at once, only for a tier-1 claim, and only when no later mark of his on the storyboard overrides it", async () => {
  pool = new FakePool().install().on(/FROM review_tiers/, []);
  await tierMarksFor(["5"]);
  const sql = pool.queries[0].sql;
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /last\.emoji = '🥱'/);
  assert.match(sql, /'wrong'::text, 2::smallint/);
  assert.match(sql, /tn\.tier = 1/);
  assert.match(sql, /t\.created_at > last\.received_at/);
  assert.match(sql, /9000000000000 \+ c\.id/);
});

test("his account comes from the setting, and an unset setting counts any account", async () => {
  const saved = process.env.TELEGRAM_MAINTAINER_ID;
  try {
    process.env.TELEGRAM_MAINTAINER_ID = "4242";
    pool = new FakePool().install().on(/FROM review_tiers/, []);
    await tierMarksFor(["5"]);
    assert.deepEqual(pool.queries[0].values, [["5"], "4242"]);
    delete process.env.TELEGRAM_MAINTAINER_ID;
    await tierMarksFor(["5"]);
    assert.deepEqual(pool.queries[1].values, [["5"], ""]);
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_MAINTAINER_ID; else process.env.TELEGRAM_MAINTAINER_ID = saved;
  }
});

test("the newest emoji of his on a message is asked for by its newest update, over his account or an unset one", () => {
  const sql = latestHisEmoji("r.message_id", "$2");
  assert.match(sql, /re\.message_id = r\.message_id AND \(\$2 = '' OR re\.user_id IS NULL OR re\.user_id::text = \$2\) ORDER BY re\.update_id DESC LIMIT 1/);
  assert.throws(() => latestHisEmoji("message_id", "$2"), /needs a qualified column/);
});

test("a note is kept for the claim's newest row, and a cleared note leaves the claim without one", async () => {
  const written = new Date("2026-10-06T10:00:00Z");
  pool = new FakePool().install().on(/FROM review_claim_notes/, [
    { claim_id: "1", note: "check this", created_at: written },
    { claim_id: "2", note: "", created_at: written },
  ]).on(/last\.received_at AS at/, []);
  const notes = await claimNotesFor(["1", "2"]);
  assert.deepEqual([...notes], [["1", { note: "check this", created_at: written }]]);
  assert.match(pool.queries[0].sql, /ORDER BY claim_id, id DESC/);
});

test("a 🤔 on a claim's posted message is a looks-wrong note at once, in front of a note already there, and a note written after it wins", async () => {
  const earlier = new Date("2026-10-06T10:00:00Z");
  const emoji = new Date("2026-10-07T10:00:00Z");
  pool = new FakePool().install()
    .on(/FROM review_claim_notes/, [{ claim_id: "1", note: "check this", created_at: earlier }])
    .on(/last\.received_at AS at/, [{ claim_id: "1", at: emoji }, { claim_id: "3", at: emoji }]);
  const notes = await claimNotesFor(["1", "3"]);
  assert.deepEqual([...notes], [["1", { note: `${LOOKS_WRONG_NOTE}. check this`, created_at: emoji }], ["3", { note: LOOKS_WRONG_NOTE, created_at: emoji }]]);
  const sql = pool.sent(/last\.received_at AS at/)[0].sql;
  assert.match(sql, /last\.emoji = '🤔'/);
  assert.match(sql, /k\.created_at > last\.received_at/);
});

test("reviews ask for every same-claim link, since a group can reach a claim through others", async () => {
  pool = new FakePool().install().on(/FROM review_readings/, []).on(/FROM review_same_claims/, [{ id: "1", claim_id: "1", other_claim_id: "9", verdict: "same_claim", note: "" }]);
  const { sameMarks } = await reviewsFor("public", ["1"]);
  assert.equal(sameMarks.length, 1);
  assert.deepEqual(pool.sent(/FROM review_same_claims/)[0].values, []);
  assert.deepEqual(pool.sent(/FROM review_readings/)[0].values, [["1"]]);
});

test("the golden replay has no reviews, and the query is not even sent", async () => {
  pool = new FakePool().install();
  const views = await claimReviews("replay", new Map([["1", [member("1", "11")]]]));
  assert.equal(views.size, 0);
  assert.equal(pool.queries.length, 0);
});

test("a claim whose readings all carry a mark in force is reviewed; one with none is not", async () => {
  pool = new FakePool().install()
    .on(/FROM review_readings/, [{ id: "1", reading_id: "11", claim_id: "1", verdict: "belongs", belongs_in_claim_id: null, note: "" }])
    .on(/FROM review_same_claims/, []);
  const views = await claimReviews("public", new Map([["1", [member("1", "11")]], ["2", [member("2", "21")]]]));
  assert.equal(views.get("1")?.review.state, "reviewed");
  assert.equal(views.get("2")?.review.state, "none");
});
