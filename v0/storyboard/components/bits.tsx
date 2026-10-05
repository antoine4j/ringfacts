// Small pieces many pages use: a tier badge, a JSON block, an empty-table line.

import type { ReactNode } from "react";
import { percent } from "../lib/format.ts";

/**
 * "posted", with the reader's 👍 or 👎 when there is one.
 *
 * @param props.reaction  The latest reaction, or null.
 * @returns The badge.
 */
export function PostedTag({ reaction }: { reaction: string | null | undefined }) {
  return <span className={`tag ${reaction === "👎" ? "bad" : "good"}`}>posted{reaction ? ` ${reaction}` : ""}</span>;
}

/**
 * A reading's tier as a coloured badge.
 *
 * @param props.tier  1, 2, 3, or nothing when not decided yet.
 * @returns "1 post", "2 digest", "3 drop", or "–".
 */
export function TierTag({ tier }: { tier: number | null | undefined }) {
  if (tier === null || tier === undefined) return <span className="muted">–</span>;
  const names: Record<number, string> = { 1: "post", 2: "digest", 3: "drop" };
  return <span className={`tag tier-${tier}`}>{`${tier} ${names[tier] ?? ""}`}</span>;
}

/**
 * Semantic dedup's pick confidence, flagged when the join is doubtful.
 *
 * @param props.pick  The groupings.pick value: {claim, confidence}.
 * @returns The percentage; on a warning background below 50% when it joined a claim.
 */
export function PickTag({ pick }: { pick: { claim?: number | null; confidence?: number } | null | undefined }) {
  if (!pick) return <span className="muted">–</span>;
  const joined = pick.claim !== null && pick.claim !== undefined;
  const isDoubtful = typeof pick.confidence === "number" && pick.confidence < 0.5;
  const what = joined ? "joined" : "new claim";
  return (
    <span className={`tag ${isDoubtful ? "warn" : ""}`} title={isDoubtful ? "low confidence: check this grouping" : ""}>
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
