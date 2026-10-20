"use client";
// The tier mark on an open claims-list card, kept to a line of text: "tier
// right? yes · no", where yes confirms the tier and no offers the other two.
// Once marked, the line says what the mark is; a tap reopens the choices. The
// claim page has the full control (TierReview); both save the same rows
// (app/review-actions.ts, scoreboard D3).

import { useRef, useState } from "react";
import { markTier } from "../app/review-actions.ts";
import type { TierJudgement } from "../lib/tier-marks.ts";
import { useCloseOnOutside, useSave } from "./ReviewControls.tsx";
import { tierName } from "./bits.tsx";

/**
 * The tier line.
 *
 * @param props.claimId  The claim.
 * @param props.tierNow  Its tier today, from its readings.
 * @param props.judgement  What the mark in force says.
 * @returns The line, or the choices while open.
 */
export function TierCheck({ claimId, tierNow, judgement }: { claimId: string; tierNow: number; judgement: TierJudgement }) {
  const { run, saving, error } = useSave();
  const [editing, setEditing] = useState(false);
  const [sayingNo, setSayingNo] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const close = () => {
    setEditing(false);
    setSayingNo(false);
  };
  const save = (tier: number | null) =>
    run(() => (tier === null ? markTier({ claimId, tierHad: tierNow, verdict: "cleared" }) : markTier({ claimId, tierHad: tierNow, verdict: tier === tierNow ? "right" : "wrong", shouldBe: tier === tierNow ? null : tier })), close);

  // While open, a tap outside the line, or Escape, closes it.
  const judged = judgement.state !== "not_judged";
  useCloseOnOutside(editing || sayingNo, boxRef, close);

  // Marked and closed: the mark in words, which reopens the choices.
  if (judged && !editing) {
    return (
      <span className="review tier-check" ref={boxRef}>
        <button type="button" className="link-button tier-check-line" title="Change or clear this tier mark" onClick={() => setEditing(true)}>
          {judgement.state === "right" ? "✓ tier right" : `tier should be ${tierName(judgement.shouldBe)}`}
        </button>
      </span>
    );
  }

  // Not marked, or reopened: yes, no, and after no the two other tiers; the choice in force is shown, not offered again.
  const otherTiers = [1, 2, 3].filter((tier) => tier !== tierNow);
  return (
    <span className="review tier-check" ref={boxRef}>
      <span className="tier-check-line">tier right?</span>
      <button type="button" className="link-button tier-check-choice" aria-pressed={judgement.state === "right"} disabled={saving || judgement.state === "right"} onClick={() => save(tierNow)}>
        yes
      </button>
      <span className="tier-check-line">·</span>
      <button type="button" className="link-button tier-check-choice" aria-pressed={judgement.state === "wrong" || sayingNo} disabled={saving} onClick={() => setSayingNo(!sayingNo)}>
        no
      </button>
      {sayingNo && (
        <>
          <span className="tier-check-line">should be</span>
          {otherTiers.map((tier, index) => (
            <span key={tier} className="tier-check-option">
              {index > 0 && <span className="tier-check-line">·</span>}
              <button type="button" className="link-button tier-check-choice" aria-pressed={judgement.state === "wrong" && judgement.shouldBe === tier} disabled={saving || (judgement.state === "wrong" && judgement.shouldBe === tier)} onClick={() => save(tier)}>
                {tierName(tier)}
              </button>
            </span>
          ))}
        </>
      )}
      {judged && (
        <button type="button" className="link-button tier-check-choice clear-mark" disabled={saving} onClick={() => save(null)}>
          clear
        </button>
      )}
      {saving && <span className="tier-check-line">saving…</span>}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
