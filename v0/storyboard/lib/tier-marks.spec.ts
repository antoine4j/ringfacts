import { test } from "node:test";
import assert from "node:assert/strict";
import { newestTierMarks, tierJudgement, tierJudgements, tierToJudge, type TierMark, type TierVerdict } from "./tier-marks.ts";

/**
 * A review_tiers row.
 *
 * @param id  Its id; a larger id is newer.
 * @param tierHad  The tier the claim showed when marked (1 post, 2 digest, 3 drop).
 * @param verdict  Right, wrong or cleared.
 * @param shouldBe  The tier it should have had, for "wrong".
 * @param claimId  The claim.
 * @returns The row.
 */
function mark(id: number, tierHad: number, verdict: TierVerdict, shouldBe: number | null = null, claimId = "7"): TierMark {
  return { id: String(id), claim_id: claimId, tier_had: tierHad, verdict, should_be_tier: shouldBe, note: "" };
}

test("a claim with no mark is not judged", () => {
  assert.deepEqual(tierJudgement(undefined, 1), { state: "not_judged", staleMark: null });
});

test("a right mark on the tier shown means the tier was right", () => {
  assert.equal(tierJudgement(mark(1, 2, "right"), 2).state, "right");
});

test("the newest mark is in force, by id rather than by order", () => {
  assert.equal(newestTierMarks([mark(10, 1, "right"), mark(9, 1, "wrong", 3)]).get("7")?.id, "10");
});

test("a cleared mark leaves the claim not judged", () => {
  const newest = newestTierMarks([mark(1, 1, "wrong", 3), mark(2, 1, "cleared")]).get("7");
  assert.deepEqual(tierJudgement(newest, 1), { state: "not_judged", staleMark: null });
});

test("a mark made when the claim showed another tier is stale", () => {
  const stale = mark(1, 2, "wrong", 3);
  assert.deepEqual(tierJudgement(stale, 1), { state: "not_judged", staleMark: stale });
  assert.equal(tierJudgement(stale, null).state, "not_judged");
});

test("Post or Digest that should have been dropped is junk, and promoted", () => {
  for (const shown of [1, 2]) {
    const judgement = tierJudgement(mark(1, shown, "wrong", 3), shown);
    assert.equal(judgement.state === "wrong" && judgement.junk, true);
    assert.equal(judgement.state === "wrong" && judgement.promoted, true);
  }
});

test("a Digest claim posted as Post is over-promoted: wrong, but not junk", () => {
  const judgement = tierJudgement(mark(1, 1, "wrong", 2), 1);
  assert.equal(judgement.state, "wrong");
  assert.equal(judgement.state === "wrong" && judgement.shouldBe, 2);
  assert.equal(judgement.state === "wrong" && judgement.junk, false);
  assert.equal(judgement.state === "wrong" && judgement.promoted, true);
});

test("a dropped claim that should have posted is wrong, neither junk nor promoted", () => {
  const judgement = tierJudgement(mark(1, 3, "wrong", 1), 3);
  assert.equal(judgement.state === "wrong" && judgement.junk, false);
  assert.equal(judgement.state === "wrong" && judgement.promoted, false);
});

test("judgements cover every claim given, marked or not", () => {
  const judgements = tierJudgements([mark(1, 1, "wrong", 2, "7")], new Map<string, number | null>([["7", 1], ["8", 2]]));
  assert.equal(judgements.get("7")?.state, "wrong");
  assert.equal(judgements.get("8")?.state, "not_judged");
});

test("a claim waits for its tier only once its readings are reviewed and it has a tier", () => {
  const notJudged = tierJudgement(undefined, 2);
  assert.equal(tierToJudge(true, notJudged, 2), true);
  assert.equal(tierToJudge(false, notJudged, 2), false);
  assert.equal(tierToJudge(true, tierJudgement(undefined, null), null), false);
});

test("either answer judges the tier, and a stale mark does not", () => {
  assert.equal(tierToJudge(true, tierJudgement(mark(1, 2, "right"), 2), 2), false);
  assert.equal(tierToJudge(true, tierJudgement(mark(1, 2, "wrong", 1), 2), 2), false);
  assert.equal(tierToJudge(true, tierJudgement(mark(1, 3, "right"), 2), 2), true);
});

test("where no tier marks are kept, nothing waits for one", () => {
  assert.equal(tierToJudge(true, undefined, 2), false);
});
