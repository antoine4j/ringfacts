// Anton's grouping reviews (D35), turned into what the storyboard shows: the
// mark in force on each reading of a claim, the claim's review status, and
// which claims Anton said are one claim. Nothing here is stored; it is worked
// out from the review rows each time a page loads.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 11, "Reviewing claims".

/** A verdict on a reading in a claim; "cleared" undoes the one before it. */
export type ReadingVerdict = "belongs" | "does_not_belong" | "own_claim" | "cleared";

/** One row of review_readings. */
export type ReadingMark = {
  id: string;
  reading_id: string;
  claim_id: string;
  verdict: ReadingVerdict;
  belongs_in_claim_id: string | null;
  note: string;
};

/** One row of review_same_claims: two claims, smaller id first. */
export type SameClaimMark = { id: string; claim_id: string; other_claim_id: string; verdict: "same_claim" | "cleared"; note: string };

/** A claim's review status: none reviewed, all reviewed, or some reviewed and some new. */
export type ReviewState = "none" | "reviewed" | "has_new";

/** What a claim shows about its review. */
export type ClaimReview = { state: ReviewState; newCount: number; notBelonging: number };

/**
 * The key of a reading in a claim.
 *
 * @param claimId  The claim.
 * @param readingId  The reading.
 * @returns "claim:reading".
 */
export function markKey(claimId: string, readingId: string): string {
  return `${claimId}:${readingId}`;
}

/**
 * The mark in force for each reading in each claim: the newest row, unless it
 * was a "cleared".
 *
 * @param marks  review_readings rows, in any order.
 * @returns markKey → the mark in force.
 */
export function marksInForce(marks: ReadingMark[]): Map<string, ReadingMark> {
  const newest = new Map<string, ReadingMark>();
  for (const mark of marks) {
    const key = markKey(mark.claim_id, mark.reading_id);
    const before = newest.get(key);
    if (!before || BigInt(mark.id) > BigInt(before.id)) newest.set(key, mark);
  }

  // A cleared mark means no mark.
  for (const [key, mark] of newest) if (mark.verdict === "cleared") newest.delete(key);
  return newest;
}

/**
 * A claim's review status, from its readings and the marks in force.
 *
 * @param claimId  The claim.
 * @param readingIds  Its readings.
 * @param inForce  From marksInForce.
 * @returns The state, how many readings are not yet reviewed, and how many do not belong.
 */
export function claimReview(claimId: string, readingIds: string[], inForce: Map<string, ReadingMark>): ClaimReview {
  const marks = readingIds.map((readingId) => inForce.get(markKey(claimId, readingId)));
  const reviewed = marks.filter(Boolean).length;
  const notBelonging = marks.filter((mark) => mark && mark.verdict !== "belongs").length;
  const newCount = readingIds.length - reviewed;

  // None reviewed shows nothing; all reviewed is done; anything between has new readings.
  const state: ReviewState = reviewed === 0 ? "none" : newCount === 0 ? "reviewed" : "has_new";
  return { state, newCount, notBelonging };
}

/**
 * The two claims of a "same claim" mark in their stored order, smaller id first.
 *
 * @param one  A claim.
 * @param other  The other claim.
 * @returns [smaller, larger].
 */
export function pairOrder(one: string, other: string): [string, string] {
  return BigInt(one) < BigInt(other) ? [one, other] : [other, one];
}

/**
 * Which claims are one claim, by Anton's links: the newest mark for each pair
 * decides whether the link is on, and the links chain.
 *
 * @param marks  review_same_claims rows, in any order.
 * @returns The links in force (as "a:b"), and claim → every other claim in its group, sorted.
 */
export function sameClaimGroups(marks: SameClaimMark[]): { links: Set<string>; groupOf: Map<string, string[]> } {
  // The newest mark for each pair.
  const newest = new Map<string, SameClaimMark>();
  for (const mark of marks) {
    const key = `${mark.claim_id}:${mark.other_claim_id}`;
    const before = newest.get(key);
    if (!before || BigInt(mark.id) > BigInt(before.id)) newest.set(key, mark);
  }
  const links = new Set([...newest].filter(([, mark]) => mark.verdict === "same_claim").map(([key]) => key));

  // Follow the links: each claim joins the group of every claim it is linked to.
  const parent = new Map<string, string>();
  const root = (claim: string): string => {
    let top = claim;
    while (parent.get(top) && parent.get(top) !== top) top = parent.get(top)!;
    parent.set(claim, top);
    return top;
  };
  for (const link of links) {
    const [one, other] = link.split(":");
    if (!parent.has(one)) parent.set(one, one);
    if (!parent.has(other)) parent.set(other, other);
    parent.set(root(one), root(other));
  }

  // Each claim, with the others in its group.
  const members = new Map<string, string[]>();
  for (const claim of parent.keys()) {
    const group = members.get(root(claim)) ?? [];
    group.push(claim);
    members.set(root(claim), group);
  }
  const groupOf = new Map<string, string[]>();
  for (const group of members.values()) {
    const sorted = [...group].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    for (const claim of group) groupOf.set(claim, sorted.filter((other) => other !== claim));
  }
  return { links, groupOf };
}

/**
 * Whether two claims are joined by a link of their own (which can be cleared
 * from either), rather than only through other claims of the group.
 *
 * @param links  From sameClaimGroups.
 * @param one  A claim.
 * @param other  The other claim.
 * @returns True when a mark between exactly these two is in force.
 */
export function directlyLinked(links: Set<string>, one: string, other: string): boolean {
  return links.has(pairOrder(one, other).join(":"));
}

/** Everything a claim shows about its review. */
export type ClaimReviewView = {
  review: ClaimReview;
  marks: Record<string, { verdict: ReadingVerdict; belongs_in_claim_id: string | null; note: string }>;
  group: { id: string; direct: boolean }[];
  inbound: { readingId: string; fromClaimId: string }[];
};

/**
 * What each claim shows: its status, the mark on each of its readings, the
 * claims Anton linked it with, and readings marked as belonging here from
 * other claims.
 *
 * @param readingsOf  Claim → its readings.
 * @param readingMarks  From reviewsFor.
 * @param sameMarks  From reviewsFor.
 * @returns Claim → its view.
 */
export function reviewViews(readingsOf: Map<string, string[]>, readingMarks: ReadingMark[], sameMarks: SameClaimMark[]): Map<string, ClaimReviewView> {
  const inForce = marksInForce(readingMarks);
  const { links, groupOf } = sameClaimGroups(sameMarks);
  const views = new Map<string, ClaimReviewView>();
  for (const [claimId, readingIds] of readingsOf) {
    // Its readings' marks.
    const marks: ClaimReviewView["marks"] = {};
    for (const readingId of readingIds) {
      const mark = inForce.get(markKey(claimId, readingId));
      if (mark) marks[readingId] = { verdict: mark.verdict, belongs_in_claim_id: mark.belongs_in_claim_id, note: mark.note };
    }

    // Its group, and readings from elsewhere marked as belonging here.
    const group = (groupOf.get(claimId) ?? []).map((id) => ({ id, direct: directlyLinked(links, claimId, id) }));
    const inbound = [...inForce.values()]
      .filter((mark) => mark.verdict === "does_not_belong" && mark.belongs_in_claim_id === claimId)
      .map((mark) => ({ readingId: mark.reading_id, fromClaimId: mark.claim_id }));
    views.set(claimId, { review: claimReview(claimId, readingIds, inForce), marks, group, inbound });
  }
  return views;
}
