import { test } from "node:test";
import assert from "node:assert/strict";
import type { CareerEvent, ClaimFacts } from "./career-events.ts";
import { reviewViews, sameClaimGroups, type ReadingMark, type ReadingVerdict, type SameClaimMark } from "./reviews.ts";
import { claimTier, isThin, overMerge, overSplit, reopenedClaims, sealedClaims, summariseEvents, thumbsDownShare, tier1Repeats, versionsInForce } from "./scores.ts";

let nextId = 1;

/**
 * A review_readings row.
 *
 * @param claimId  The claim.
 * @param readingId  The reading.
 * @param verdict  The verdict.
 * @returns The row, with a fresh id so later rows win.
 */
function mark(claimId: string, readingId: string, verdict: ReadingVerdict): ReadingMark {
  nextId += 1;
  return { id: String(nextId), claim_id: claimId, reading_id: readingId, verdict, belongs_in_claim_id: null, note: "" };
}

/**
 * A review_same_claims row linking two claims.
 *
 * @param one  A claim.
 * @param other  A larger claim id.
 * @returns The row.
 */
function link(one: string, other: string): SameClaimMark {
  nextId += 1;
  return { id: String(nextId), claim_id: one, other_claim_id: other, verdict: "same_claim", note: "" };
}

// Claim 1: sealed, one of three readings ✕. Claim 2: sealed, own_claim on one of two, linked to 4.
// Claim 3: marked in part. Claim 4: sealed, all belong.
const READINGS = new Map([["1", ["11", "12", "13"]], ["2", ["21", "22"]], ["3", ["31", "32"]], ["4", ["41"]]]);
const MARKS = [
  mark("1", "11", "belongs"), mark("1", "12", "does_not_belong"), mark("1", "13", "belongs"),
  mark("2", "21", "belongs"), mark("2", "22", "own_claim"),
  mark("3", "31", "belongs"),
  mark("4", "41", "belongs"),
];
const LINKS = [link("2", "4")];
const VIEWS = reviewViews(READINGS, MARKS, LINKS);

test("a claim's tier is the best of its readings'", () => {
  assert.equal(claimTier([3, 2, null]), "digest");
  assert.equal(claimTier([3, 1]), "post");
  assert.equal(claimTier([3]), "drop");
  assert.equal(claimTier([null]), null);
});

test("sealed claims are the ones with every reading marked", () => {
  assert.deepEqual(sealedClaims(VIEWS).sort(), ["1", "2", "4"]);
});

test("over-merge counts ✕ readings, own_claim included, over the readings of sealed claims", () => {
  assert.deepEqual(overMerge(sealedClaims(VIEWS), VIEWS), { count: 2, of: 6 });
});

test("over-split counts sealed claims linked to another", () => {
  assert.deepEqual(overSplit(sealedClaims(VIEWS), VIEWS), { count: 2, of: 3 });
});

test("a claim joined after its last mark is reopened, not sealed; one marked in part is neither", () => {
  const views = reviewViews(new Map([["5", ["51", "52"]], ["3", ["31", "32"]]]), [mark("5", "51", "belongs"), mark("3", "31", "belongs")], []);
  const lastMarkAt = new Map([["5", new Date("2026-10-05")], ["3", new Date("2026-10-05")]]);
  const joinedAt = new Map([
    ["5", new Map([["51", new Date("2026-10-04")], ["52", new Date("2026-10-06")]])],
    ["3", new Map([["31", new Date("2026-10-04")], ["32", new Date("2026-10-04")]])],
  ]);
  assert.deepEqual(reopenedClaims(views, lastMarkAt, joinedAt), ["5"]);
  assert.deepEqual(sealedClaims(views), []);
});

test("a group of three posted claims holds two repeats, an earlier post outside the period included", () => {
  const groupOf = sameClaimGroups([link("1", "2"), link("2", "3")]).groupOf;
  const posts = [
    { claimId: "1", postedAt: new Date("2026-09-01") },
    { claimId: "2", postedAt: new Date("2026-10-02") },
    { claimId: "3", postedAt: new Date("2026-10-03") },
    { claimId: "9", postedAt: new Date("2026-10-03") },
  ];
  assert.deepEqual(tier1Repeats(posts.slice(1), posts, groupOf), { count: 2, of: 3 });
  assert.deepEqual(tier1Repeats(posts, posts, groupOf), { count: 2, of: 4 });
});

test("two linked claims posted at the same moment count one repeat", () => {
  const groupOf = sameClaimGroups([link("9", "10")]).groupOf;
  const moment = new Date("2026-10-03T10:00:00Z");
  const posts = [{ claimId: "9", postedAt: moment }, { claimId: "10", postedAt: moment }];
  assert.deepEqual(tier1Repeats(posts, posts, groupOf), { count: 1, of: 2 });
});

test("the 👎 share counts the latest reaction, and a removed reaction as none", () => {
  assert.deepEqual(thumbsDownShare([{ latest: "👎" }, { latest: "👍" }, { latest: null }, { latest: null }]), { count: 1, of: 4, unreacted: 2 });
});

test("career events: not posted is late plus missed, with each cause counted", () => {
  const event = (id: string, claimIds: number[]): CareerEvent => ({ id, fighter: "Ilia Topuria", kind: "booked", happened: "2026-10-04", what: "", first_report: "", claim_ids: claimIds, note: "" });
  const facts = new Map<number, ClaimFacts>([
    [1, { tier: "post", posted: true, inPostedDigest: true, digestStillDue: false }],
    [2, { tier: "digest", posted: false, inPostedDigest: true, digestStillDue: false }],
    [3, { tier: "drop", posted: false, inPostedDigest: false, digestStillDue: false }],
  ]);
  const summary = summariseEvents([event("a", [1]), event("b", [2]), event("c", [3]), event("d", [])], facts);
  assert.deepEqual(summary, { notPosted: { count: 3, of: 4 }, posted: 1, late: 1, missed: 2, causes: { tier_3_drop: 1, never_found: 1 } });
});

test("versions: the newest is in force; two among the readings are named with their first days", () => {
  const rows = [
    { classifier_version: "v7.6", grouping_version: "g1", settings_version: 3, readings: "4" },
    { classifier_version: "v7.7", grouping_version: "g1", settings_version: 3, readings: "9" },
  ];
  const firstUsed = [
    { station: "classifier" as const, version: "v7.6", first_used: new Date("2026-09-20") },
    { station: "classifier" as const, version: "v7.7", first_used: new Date("2026-10-03") },
    { station: "grouping" as const, version: "g1", first_used: new Date("2026-09-20") },
    { station: "settings" as const, version: "3", first_used: new Date("2026-10-01") },
  ];
  const versions = versionsInForce(rows, firstUsed);
  assert.deepEqual(versions.inForce, { classifier: "v7.7", grouping: "g1", settings: "3" });
  assert.equal(versions.mixed.length, 1);
  assert.equal(versions.mixed[0].station, "classifier");
  assert.deepEqual(versions.mixed[0].versions.map((one) => one.version), ["v7.6", "v7.7"]);
});

test("a slice under 30 is thin", () => {
  assert.ok(isThin({ count: 2, of: 29 }));
  assert.ok(!isThin({ count: 2, of: 30 }));
});
