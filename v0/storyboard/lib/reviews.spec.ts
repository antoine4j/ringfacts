import { test } from "node:test";
import assert from "node:assert/strict";
import { claimReview, directlyLinked, marksInForce, pairOrder, reviewViews, sameClaimGroups, type ReadingMark, type SameClaimMark } from "./reviews.ts";

let nextId = 1;

/** A review_readings row, ids in the order the marks were made. */
function mark(claim: string, reading: string, verdict: ReadingMark["verdict"], belongsIn: string | null = null): ReadingMark {
  return { id: String(nextId++), claim_id: claim, reading_id: reading, verdict, belongs_in_claim_id: belongsIn, note: "" };
}

/** A review_same_claims row between two claims, stored smaller id first. */
function link(one: string, other: string, verdict: SameClaimMark["verdict"] = "same_claim"): SameClaimMark {
  const [claim, otherClaim] = pairOrder(one, other);
  return { id: String(nextId++), claim_id: claim, other_claim_id: otherClaim, verdict, note: "" };
}

test("a claim with no marks shows nothing; all marked is reviewed; a reading after the review is new", () => {
  assert.equal(claimReview("1", ["10", "11"], marksInForce([])).state, "none");
  const marks = [mark("1", "10", "belongs"), mark("1", "11", "belongs")];
  assert.deepEqual(claimReview("1", ["10", "11"], marksInForce(marks)), { state: "reviewed", newCount: 0, notBelonging: 0 });
  assert.deepEqual(claimReview("1", ["10", "11", "12", "13"], marksInForce(marks)), { state: "has_new", newCount: 2, notBelonging: 0 });
});

test("a reading that does not belong is reviewed, and counted", () => {
  const marks = [mark("1", "10", "belongs"), mark("1", "11", "does_not_belong", "7"), mark("1", "12", "own_claim")];
  assert.deepEqual(claimReview("1", ["10", "11", "12"], marksInForce(marks)), { state: "reviewed", newCount: 0, notBelonging: 2 });
});

test("the newest mark wins, and a cleared mark is no mark", () => {
  const marks = [mark("1", "10", "does_not_belong"), mark("1", "10", "belongs")];
  assert.equal(marksInForce(marks).get("1:10")?.verdict, "belongs");
  assert.equal(claimReview("1", ["10"], marksInForce([...marks, mark("1", "10", "cleared")])).state, "none");
});

test("a mark is of a reading in one claim: the same reading in another claim is new there", () => {
  const marks = [mark("1", "10", "belongs")];
  assert.equal(claimReview("1", ["10"], marksInForce(marks)).state, "reviewed");
  assert.equal(claimReview("2", ["10"], marksInForce(marks)).state, "none");
});

test("same-claim links chain, in any order, and each claim lists the others", () => {
  const { groupOf } = sameClaimGroups([link("2", "1"), link("3", "2")]);
  assert.deepEqual(groupOf.get("1"), ["2", "3"]);
  assert.deepEqual(groupOf.get("2"), ["1", "3"]);
  assert.deepEqual(groupOf.get("3"), ["1", "2"]);
  assert.equal(groupOf.get("4"), undefined);
});

test("linking #3 to #1 instead of #2 gives the same group", () => {
  assert.deepEqual(sameClaimGroups([link("2", "1"), link("3", "1")]).groupOf.get("3"), ["1", "2"]);
});

test("clearing the only link between two parts splits the group; a direct link is clearable", () => {
  const marks = [link("1", "2"), link("2", "3")];
  const { links, groupOf } = sameClaimGroups([...marks, link("3", "2", "cleared")]);
  assert.deepEqual(groupOf.get("1"), ["2"]);
  assert.equal(groupOf.get("3"), undefined);
  assert.equal(directlyLinked(links, "2", "1"), true);
  assert.equal(directlyLinked(sameClaimGroups(marks).links, "1", "3"), false);
});

test("a pair has one stored form whichever way it was marked", () => {
  assert.deepEqual(pairOrder("421", "419"), ["419", "421"]);
  assert.deepEqual(pairOrder("9", "10"), ["9", "10"]);
});

test("a claim's view: its marks, its group, and readings moved in from another claim", () => {
  const readingsOf = new Map([
    ["401", ["20"]],
    ["425", ["30", "31"]],
  ]);
  const readingMarks = [mark("425", "30", "belongs"), mark("425", "31", "does_not_belong", "401")];
  const views = reviewViews(readingsOf, readingMarks, [link("401", "390")]);
  assert.deepEqual(views.get("401")?.inbound, [{ readingId: "31", fromClaimId: "425" }]);
  assert.deepEqual(views.get("401")?.group, [{ id: "390", direct: true }]);
  assert.equal(views.get("425")?.marks["31"]?.belongs_in_claim_id, "401");
  assert.deepEqual(views.get("425")?.review, { state: "reviewed", newCount: 0, notBelonging: 1 });

  // Undoing the move takes it off the other claim too.
  const undone = reviewViews(readingsOf, [...readingMarks, mark("425", "31", "cleared")], []);
  assert.deepEqual(undone.get("401")?.inbound, []);
  assert.equal(undone.get("425")?.review.state, "has_new");
});
