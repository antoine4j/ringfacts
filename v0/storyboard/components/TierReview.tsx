"use client";
// The tier mark on a claim (scoreboard D3): was the claim's tier right, or
// should it have been Post, Digest or Drop? One tap saves: the claim's own
// tier saves "right", another tier saves "wrong" with that tier; "clear"
// takes the mark back. Each save adds one row (app/review-actions.ts).
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §4.

import { markTier } from "../app/review-actions.ts";
import type { TierJudgement } from "../lib/tier-marks.ts";
import { useSave } from "./ReviewControls.tsx";

/** The three tiers, as the tap targets name them. */
const TIERS = [
  { tier: 1, name: "Post" },
  { tier: 2, name: "Digest" },
  { tier: 3, name: "Drop" },
];

/**
 * The tier the mark in force points at: the claim's own when right, the named one when wrong.
 *
 * @param judgement  The claim's tier judgement.
 * @param tierNow  The claim's tier today.
 * @returns The tier to tint, or null when not judged.
 */
function chosenTier(judgement: TierJudgement, tierNow: number): number | null {
  if (judgement.state === "right") return tierNow;
  if (judgement.state === "wrong") return judgement.shouldBe;
  return null;
}

/**
 * The tier control.
 *
 * @param props.claimId  The claim.
 * @param props.tierNow  Its tier today, from its readings.
 * @param props.judgement  What the mark in force says.
 * @returns The row of three tiers, a clear link, and any stale mark or error.
 */
export function TierReview({ claimId, tierNow, judgement }: { claimId: string; tierNow: number; judgement: TierJudgement }) {
  const { run, saving, error } = useSave();
  const chosen = chosenTier(judgement, tierNow);
  const save = (tier: number) => run(() => markTier({ claimId, tierHad: tierNow, verdict: tier === tierNow ? "right" : "wrong", shouldBe: tier === tierNow ? null : tier }));

  return (
    <span className="review tier-review">
      <span className="small muted">should be:</span>
      {TIERS.map(({ tier, name }) => (
        <button key={tier} type="button" className="small option short" aria-pressed={chosen === tier} disabled={saving} onClick={() => save(tier)}>
          {name}
          {tier === tierNow ? " (as is)" : ""}
        </button>
      ))}
      {chosen !== null && (
        <button type="button" className="link-button small" disabled={saving} onClick={() => run(() => markTier({ claimId, tierHad: tierNow, verdict: "cleared" }))}>
          clear
        </button>
      )}
      {judgement.state === "not_judged" && judgement.staleMark && (
        <span className="small muted">An earlier mark was made when this claim was tier {judgement.staleMark.tier_had}; it no longer counts.</span>
      )}
      {saving && <span className="small muted">saving…</span>}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
