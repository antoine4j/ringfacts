// Small pieces many pages use: a tier badge, a JSON block, an empty-table line.

import type { ReactNode } from "react";
import { percent } from "../lib/format.ts";
import { DOUBTFUL_BELOW, pickExplanation, type GroupingPick } from "../lib/pick.ts";

/**
 * "posted", with the reader's 👍 or 👎 when there is one.
 *
 * @param props.reaction  The latest reaction, or null.
 * @returns The badge.
 */
export function PostedTag({ reaction }: { reaction: string | null | undefined }) {
  return <span className={`tag ${reaction === "👎" ? "bad" : "good"}`}>posted{reaction ? ` ${reaction}` : ""}</span>;
}

/** What each tier does with a reading, for the badge's tooltip. */
const TIERS: Record<number, { name: string; does: string }> = {
  1: { name: "post", does: "posted to the chat as it arrives, and also in the weekly digest" },
  2: { name: "digest", does: "not posted on its own; it goes into the fighter's weekly digest" },
  3: { name: "drop", does: "neither posted nor in the digest" },
};

/**
 * A reading's tier as a coloured badge: the tier's number, a thin divider, its name.
 *
 * @param props.tier  1, 2, 3, or nothing when not decided yet.
 * @param props.note  A sentence added to the tooltip, if any.
 * @returns "1 | post", "2 | digest", "3 | drop", or "–".
 */
export function TierTag({ tier, note }: { tier: number | null | undefined; note?: string }) {
  if (tier === null || tier === undefined) return <span className="muted">–</span>;
  const known = TIERS[tier];
  return (
    <span className={`tag help tier-${tier}`} title={`${known ? `Tier ${tier} of 3, ${known.name}: ${known.does}.` : `Tier ${tier}`}${note ? ` ${note}` : ""}`}>
      <span className="tier-number">{tier}</span>
      {known?.name ?? ""}
    </span>
  );
}

/**
 * Semantic dedup's pick and its confidence, flagged when doubtful; the tooltip
 * says what the percentage is and what it nearly picked (lib/pick.ts).
 *
 * @param props.pick  The groupings.pick value: {claim, confidence, raw}.
 * @returns "joined 94%" or "new claim 69%"; on a warning background below 50%.
 */
export function PickTag({ pick }: { pick: GroupingPick | null | undefined }) {
  if (!pick) return <span className="muted">–</span>;
  const joined = pick.claim !== null && pick.claim !== undefined;
  const isDoubtful = typeof pick.confidence === "number" && pick.confidence < DOUBTFUL_BELOW;
  const what = joined ? "joined" : "new claim";
  return (
    <span className={`tag help ${isDoubtful ? "warn" : ""}`} title={pickExplanation(pick)}>
      {`${what} ${percent(pick.confidence)}${isDoubtful ? " ⚠" : ""}`}
    </span>
  );
}

/**
 * Any value as indented JSON.
 *
 * @param props.value  The value.
 * @returns A preformatted block.
 */
export function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

/**
 * A line shown in place of an empty table.
 *
 * @param props.children  What to say.
 * @returns The line.
 */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}
