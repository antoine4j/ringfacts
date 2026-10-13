// Anton's tier marks (scoreboard D3), turned into a judgement per claim: not
// yet judged, right, or wrong with the tier it should have had. Nothing here
// is stored; it is worked out from review_tiers rows each time a page loads.
// Tiers are numbers, as the decisions table has them: 1 post, 2 digest, 3 drop.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §4.

/** A verdict on a claim's tier; "cleared" undoes the one before it. */
export type TierVerdict = "right" | "wrong" | "cleared";

/** One row of review_tiers. */
export type TierMark = { id: string; claim_id: string; tier_had: number; verdict: TierVerdict; should_be_tier: number | null; note: string };

/**
 * What the mark in force says about a claim's tier. A claim is "not judged"
 * until marked; a mark made when the claim showed another tier is stale and
 * leaves it not judged again, as a new reading reopens a sealed claim.
 */
export type TierJudgement =
  | { state: "not_judged"; staleMark: TierMark | null }
  | { state: "right"; mark: TierMark }
  | { state: "wrong"; mark: TierMark; shouldBe: number; junk: boolean; promoted: boolean };

/** The drop tier: a claim the group should not have seen at all. */
const DROP = 3;

/**
 * The newest mark for each claim.
 *
 * @param marks  review_tiers rows, in any order.
 * @returns Claim id → its newest mark.
 */
export function newestTierMarks(marks: TierMark[]): Map<string, TierMark> {
  const newest = new Map<string, TierMark>();
  for (const mark of marks) {
    const before = newest.get(mark.claim_id);
    if (!before || BigInt(mark.id) > BigInt(before.id)) newest.set(mark.claim_id, mark);
  }
  return newest;
}

/**
 * The judgement on one claim's tier.
 *
 * @param newest  The claim's newest mark, or undefined when it has none.
 * @param tierNow  The tier the claim shows today (its best reading's); null when none is decided.
 * @returns Not judged, right, or wrong with the tier it should have had.
 */
export function tierJudgement(newest: TierMark | undefined, tierNow: number | null): TierJudgement {
  // No mark, or a mark taken back.
  if (!newest || newest.verdict === "cleared") return { state: "not_judged", staleMark: null };

  // A mark about a tier the claim no longer shows says nothing about today's.
  if (newest.tier_had !== tierNow) return { state: "not_judged", staleMark: newest };
  if (newest.verdict === "right" || newest.should_be_tier === null) return { state: "right", mark: newest };

  // Promoted: shown more prominently than it deserved (a lower tier number).
  // Junk is the part of that the group should not have seen at all (G2);
  // a Digest claim posted as Post is promoted, wrong, but not junk.
  const shouldBe = newest.should_be_tier;
  const promoted = newest.tier_had < shouldBe;
  const junk = shouldBe === DROP && newest.tier_had < DROP;
  return { state: "wrong", mark: newest, shouldBe, junk, promoted };
}

/**
 * The judgement on every claim given.
 *
 * @param marks  review_tiers rows for those claims, in any order.
 * @param tierOf  Claim id → the tier it shows today.
 * @returns Claim id → its judgement.
 */
export function tierJudgements(marks: TierMark[], tierOf: Map<string, number | null>): Map<string, TierJudgement> {
  const newest = newestTierMarks(marks);
  return new Map([...tierOf].map(([claimId, tierNow]) => [claimId, tierJudgement(newest.get(claimId), tierNow)]));
}
