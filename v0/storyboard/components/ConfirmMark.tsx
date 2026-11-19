"use client";
// A mark read from his emoji, waiting for his Confirm: 🥱 becomes a tier mark
// ("wrong, should have been the digest"), 🤔 becomes a note on the claim. Both
// use the actions the claim page already has, so a confirmed mark is exactly
// one he would have made by hand.

import { markTier, noteClaim } from "../app/review-actions.ts";
import { useSave } from "./ReviewControls.tsx";

/** The longest note the server accepts. */
const NOTE_MAX = 1000;

/** The marker a confirmed 🤔 note starts with; the page looks for it to stop asking. */
export const LOOKS_WRONG_NOTE = "🤔 looks wrong (from Telegram)";

/**
 * The Confirm button for one emoji mark.
 *
 * @param props.claimId  The claim the post belongs to.
 * @param props.emoji  "🥱" or "🤔".
 * @param props.tierNow  The claim's tier now; a 🥱 needs it to say what tier the mark is against.
 * @param props.note  The note now on the claim; a confirmed 🤔 keeps it after its own marker, since a claim has one note in force.
 * @returns The button, and any error.
 */
export function ConfirmMark({ claimId, emoji, tierNow, note }: { claimId: string; emoji: "🥱" | "🤔"; tierNow: number | null; note: string }) {
  const { run, saving, error } = useSave();
  const confirm = () => {
    if (emoji === "🥱") return run(() => markTier({ claimId, tierHad: tierNow ?? 1, verdict: "wrong", shouldBe: 2, note: "🥱 in Telegram: belongs in the digest" }));
    return run(() => noteClaim({ claimId, note: note.trim() === "" ? LOOKS_WRONG_NOTE : `${LOOKS_WRONG_NOTE}. ${note}`.slice(0, NOTE_MAX) }));
  };
  return (
    <span className="review">
      <button type="button" className="primary" disabled={saving} onClick={confirm}>
        {saving ? "saving…" : "Confirm"}
      </button>
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
