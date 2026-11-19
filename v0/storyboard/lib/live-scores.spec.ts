// Covers lib/live-scores.ts: every live number of the scores page for one
// period, and so the launch bar's three inputs (career events, repeats in
// tier 1, the 👎 share). The database is a fake pool: these specs check which
// questions are asked for which days, and that what comes back reaches the
// right number. The counting itself is covered by scores.spec.ts.
//
// The career events are read from the committed list, which a spec cannot swap,
// so the events summary is checked against that list, not against made-up events.
// The fake pool answers the list's claims query itself (by default: no such
// claims), so no spec depends on which events the list holds.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { careerEvents } from "./career-events.ts";
import { bestTier, liveScores } from "./live-scores.ts";
import { FakePool } from "./fake-pool.ts";

let pool: FakePool | undefined;
afterEach(() => pool?.restore());

const NOW = new Date("2026-10-20T20:00:00Z");
const RANGE = { from: "2026-10-13", to: "2026-10-19" };

/**
 * A pool that answers the scores page's questions for a small fortnight: two
 * claims, the first sealed and judged a wrong tier, three posts (one of them a
 * repeat of an older, linked one) and two digests.
 *
 * @returns The installed pool.
 */
function fortnight(): FakePool {
  const onDay = (day: string) => new Date(`${day}T18:00:00Z`);
  const allPosts = [
    { claim_id: "4", posted_at: onDay("2026-10-01"), latest: "👍" },
    { claim_id: "1", posted_at: onDay("2026-10-15"), latest: "👎" },
    { claim_id: "3", posted_at: onDay("2026-10-16"), latest: null },
  ];
  return new FakePool().install()
    .on(/DISTINCT ON \(g\.claim_id/, [
      { claim_id: "1", reading_id: "11", tier: 2, published_at: onDay("2026-10-14") },
      { claim_id: "1", reading_id: "12", tier: 1, published_at: onDay("2026-10-15") },
      { claim_id: "2", reading_id: "21", tier: null, published_at: onDay("2026-10-16") },
    ])
    .on(/SELECT id, reading_id, claim_id/, [
      { id: "1", reading_id: "11", claim_id: "1", verdict: "belongs", belongs_in_claim_id: null, note: "" },
      { id: "2", reading_id: "12", claim_id: "1", verdict: "belongs", belongs_in_claim_id: null, note: "" },
    ])
    .on(/FROM review_same_claims/, [{ id: "1", claim_id: "3", other_claim_id: "4", verdict: "same_claim", note: "" }])
    .on(/FROM review_tiers/, [{ id: "1", claim_id: "1", tier_had: 1, verdict: "wrong", should_be_tier: 2, note: "" }])
    .on(/max\(created_at\) AS at FROM review_readings/, [{ claim_id: "1", at: onDay("2026-10-17") }])
    .on(/min\(created_at\) AS at FROM groupings/, [{ claim_id: "1", reading_id: "11", at: onDay("2026-10-14") }, { claim_id: "1", reading_id: "12", at: onDay("2026-10-15") }])
    .on(/FROM reading_now WHERE claim_id/, [{ classifier_version: "v7.7", grouping_version: "g1", settings_version: 3, readings: "3" }])
    .on(/UNION ALL/, [])
    .on(/FROM claims c JOIN readings r/, (values) => (values.length === 0 ? allPosts : allPosts.filter((post) => post.claim_id !== "4")))
    .on(/SELECT d\.id,/, [{ id: "1", latest: "👎" }, { id: "2", latest: "👍" }])
    .on(/^SELECT cn\.id FROM claim_now cn/, [{ id: "1" }, { id: "2" }])
    .on(/CROSS JOIN LATERAL/, []);
}

/**
 * What the database says about one claim the career events name: the shape
 * lib/score-queries.ts reads, with the answers a spec wants.
 *
 * @param id  The claim's id.
 * @param facts  What differs from a story that was never posted and never judged a tier.
 * @returns The row.
 */
function claimRow(id: number, facts: { posted?: boolean; best_tier?: number | null; in_posted_digest?: boolean; digest_still_due?: boolean } = {}) {
  return { id: String(id), posted: false, best_tier: null, in_posted_digest: false, digest_still_due: false, ...facts };
}

/**
 * The first day of the committed list that names a claim, with that day's events.
 *
 * @returns The day and the events that happened on it.
 */
function aDayWithEvents() {
  const list = careerEvents();
  const first = list.events.find((event) => event.claim_ids.length > 0);
  assert.ok(first, "the committed career-events list names no claim, so the launch bar's events path has nothing to run on");
  return { day: first.happened, events: list.events.filter((event) => event.happened === first.happened) };
}

test("the best tier of a story's readings is the lowest one decided", () => {
  assert.equal(bestTier([3, 2, null]), 2);
  assert.equal(bestTier([null, 1, 3]), 1);
  assert.equal(bestTier([3]), 3);
});

test("a story with no decided reading has no tier", () => {
  assert.equal(bestTier([]), null);
  assert.equal(bestTier([null, null]), null);
});

test("the stories of the period are counted, with the sealed ones and each station's share", async () => {
  fortnight();
  const scores = await liveScores(RANGE, NOW);
  assert.equal(scores.claims, 2);
  assert.equal(scores.sealed, 1);
  assert.equal(scores.reopened, 0);
  assert.deepEqual(scores.overMerge, { count: 0, of: 2 });
  assert.deepEqual(scores.overSplit, { count: 0, of: 1 });
});

test("a tier mark is judged against the story's best tier today, so a wrong mark on a claim whose tier is 1 counts", async () => {
  fortnight();
  const scores = await liveScores(RANGE, NOW);
  assert.deepEqual(scores.wrongTier, { count: 1, of: 1, unjudged: 0, overPromoted: 1, junk: 0 });
});

test("a tier mark made when the claim showed another tier no longer counts", async () => {
  fortnight().on(/FROM review_tiers/, [{ id: "1", claim_id: "1", tier_had: 2, verdict: "wrong", should_be_tier: 3, note: "" }]);
  const scores = await liveScores(RANGE, NOW);
  assert.deepEqual(scores.wrongTier, { count: 0, of: 0, unjudged: 1, overPromoted: 0, junk: 0 });
});

test("the 👎 share is counted over the period's posts and digests together, a message nobody reacted to included", async () => {
  fortnight();
  const scores = await liveScores(RANGE, NOW);
  // Two posts (👎, none) and two digests (👎, 👍).
  assert.deepEqual(scores.thumbsDown, { count: 2, of: 4, unreacted: 1 });
});

test("a repeat is a post of a story linked to one the group had already been sent, even from before the period", async () => {
  fortnight();
  const scores = await liveScores(RANGE, NOW);
  // Claim 3 (posted in the period) is linked to claim 4 (posted 1 October, outside it).
  assert.deepEqual(scores.repeats, { count: 1, of: 2 });
});

test("the period's posts are asked for with its days, and every post ever with none", async () => {
  const database = fortnight();
  await liveScores(RANGE, NOW);
  const askedFor = database.sent(/FROM claims c JOIN readings r/).map((query) => query.values);
  assert.equal(askedFor.length, 2);
  assert.ok(askedFor.some((values) => values.length === 0));
  assert.ok(askedFor.some((values) => values.length === 2 && values[0] === "2026-10-13" && values[1] === "2026-10-19"));
});

test("the digests are asked for with the period's days", async () => {
  const database = fortnight();
  await liveScores(RANGE, NOW);
  assert.deepEqual(database.sent(/SELECT d\.id,/)[0].values, ["2026-10-13", "2026-10-19"]);
});

test("all time asks for no days anywhere", async () => {
  const database = fortnight();
  await liveScores(null, NOW);
  for (const query of database.sent(/FROM claims c JOIN readings r|SELECT d\.id,|SELECT cn\.id/)) assert.deepEqual(query.values, []);
});

test("the versions in force come from the period's readings", async () => {
  fortnight();
  const scores = await liveScores(RANGE, NOW);
  assert.deepEqual(scores.versions.inForce, { classifier: "v7.7", grouping: "g1", settings: "3" });
});

test("a period without career events asks nothing about claims, and its events are none", async () => {
  const database = fortnight();
  const scores = await liveScores({ from: "2000-01-01", to: "2000-01-02" }, NOW);
  assert.deepEqual(scores.events.notPosted, { count: 0, of: 0 });
  assert.equal(database.sent(/CROSS JOIN LATERAL/).length, 0);
});

test("events in the period are asked about by the claims they name, and a tier 1 post counts them as heard", async () => {
  const { day, events } = aDayWithEvents();
  const database = fortnight().on(/CROSS JOIN LATERAL/, (values) => (values[0] as number[]).map((id) => claimRow(id, { posted: true, best_tier: 1 })));
  const scores = await liveScores({ from: day, to: day }, NOW);
  assert.deepEqual(scores.events.notPosted, { count: 0, of: events.length });
  assert.equal(scores.events.posted, events.length);
  assert.deepEqual(database.sent(/CROSS JOIN LATERAL/).map((query) => query.values), [[[...new Set(events.flatMap((event) => event.claim_ids))]]]);
});

test("events whose claims were never posted are counted as not posted, with the furthest stage their claims reached as the cause", async () => {
  const { day, events } = aDayWithEvents();
  fortnight().on(/CROSS JOIN LATERAL/, (values) => (values[0] as number[]).map((id) => claimRow(id, { best_tier: 3 })));
  const scores = await liveScores({ from: day, to: day }, NOW);
  assert.deepEqual(scores.events.notPosted, { count: events.length, of: events.length });
  assert.equal(scores.events.missed, events.length);
  assert.deepEqual(scores.events.causes, { tier_3_drop: events.length });
});

test("an event none of whose claims exist in the database was never found", async () => {
  const { day, events } = aDayWithEvents();
  fortnight();
  const scores = await liveScores({ from: day, to: day }, NOW);
  assert.deepEqual(scores.events.causes, { never_found: events.length });
});

test("all time counts every event on the committed list", async () => {
  const database = fortnight().on(/CROSS JOIN LATERAL/, []);
  const scores = await liveScores(null, NOW);
  const list = careerEvents();
  assert.equal(scores.events.notPosted.of, list.events.length);
  assert.equal(scores.events.missed + scores.events.late + scores.events.posted, list.events.length);
  assert.equal(scores.events.checked, list.checked);
  const claimIds = new Set(list.events.flatMap((event) => event.claim_ids));
  assert.equal(database.sent(/CROSS JOIN LATERAL/).length, claimIds.size > 0 ? 1 : 0);
});

test("the list is behind when it was last checked before the period's last day", async () => {
  fortnight();
  const list = careerEvents();
  const dayAfter = new Date(new Date(`${list.checked}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  assert.equal((await liveScores({ from: "2000-01-01", to: dayAfter }, NOW)).events.listIsBehind, true);
  assert.equal((await liveScores({ from: "2000-01-01", to: list.checked }, NOW)).events.listIsBehind, false);
});

test("an open period is compared with today, Pacific time: checked today is up to date, checked yesterday is behind", async () => {
  fortnight();
  const list = careerEvents();
  const noonOnCheckedDay = new Date(`${list.checked}T20:00:00Z`);
  const noonNextDay = new Date(noonOnCheckedDay.getTime() + 86_400_000);
  assert.equal((await liveScores(null, noonOnCheckedDay)).events.listIsBehind, false);
  assert.equal((await liveScores(null, noonNextDay)).events.listIsBehind, true);
  assert.equal((await liveScores({ from: "2000-01-01", to: null }, noonNextDay)).events.listIsBehind, true);
});

test("just after midnight in Greenwich it is still yesterday in Pacific time, so the list is not yet behind", async () => {
  fortnight();
  const list = careerEvents();
  const justAfterUtcMidnight = new Date(new Date(`${list.checked}T00:00:00Z`).getTime() + 86_400_000 + 60_000);
  assert.equal((await liveScores(null, justAfterUtcMidnight)).events.listIsBehind, false);
});

test("a period with no stories counts zero everywhere and still reads the messages sent", async () => {
  fortnight().on(/^SELECT cn\.id FROM claim_now cn/, []);
  const scores = await liveScores(RANGE, NOW);
  assert.equal(scores.claims, 0);
  assert.equal(scores.sealed, 0);
  assert.deepEqual(scores.overMerge, { count: 0, of: 0 });
  assert.deepEqual(scores.thumbsDown, { count: 2, of: 4, unreacted: 1 });
});
