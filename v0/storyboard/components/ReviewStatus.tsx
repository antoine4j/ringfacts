// A claim's review on its folded card (D35): whether its readings are
// reviewed, how many arrived since, how many do not belong, the claims Anton
// said it is the same claim as, and readings marked as belonging here from
// another claim. Quiet on purpose: muted words, one warning tint.

import type { CSSProperties } from "react";
import type { ClaimReviewView } from "../lib/reviews.ts";

/**
 * The review circle at the right end of a folded claim's title row, after its
 * number, in the same place on every card so a glance down the list reads
 * them: an empty ring when nothing is reviewed, a pie filled by the share
 * reviewed when some readings are new, a full circle with a tick when all are reviewed.
 *
 * @param props.view  The claim's review; absent on the golden replay, which shows no circle.
 * @param props.readings  How many readings the claim has.
 * @returns The circle, with its counts as the tooltip.
 */
export function ReviewDot({ view, readings }: { view: ClaimReviewView | undefined; readings: number }) {
  if (!view || readings === 0) return null;
  const { state, newCount } = view.review;
  const reviewed = readings - newCount;
  const title = state === "none" ? "Not reviewed yet" : state === "reviewed" ? (readings === 1 ? "Reviewed: its one reading" : `Reviewed: all ${readings} readings`) : `${reviewed} of ${readings} readings reviewed; ${newCount} new`;
  const done = { "--done": `${Math.round((100 * reviewed) / readings)}%` } as CSSProperties;
  return <span className={`review-dot ${state}`} style={done} title={title} role="img" aria-label={title} />;
}

/**
 * The review words on a claim's card, or nothing when there is nothing to say.
 *
 * @param props.view  The claim's review.
 * @param props.showGroup  Name the claims it is the same claim as; off where the controls list them.
 * @param props.showDone  Say "✓ reviewed"; off where ReviewDot already says it.
 * @returns The words.
 */
export function ReviewStatus({ view, showGroup = true, showDone = true }: { view: ClaimReviewView | undefined; showGroup?: boolean; showDone?: boolean }) {
  if (!view) return null;
  const { review, group, inbound } = view;
  const fromClaims = [...new Set(inbound.map((moved) => moved.fromClaimId))];
  return (
    <>
      {review.state === "reviewed" && showDone && <span className="review-state">✓ reviewed</span>}
      {review.state === "has_new" && (
        <span className="review-state has-new">
          {showDone && "✓ reviewed · "}
          {review.newCount} new
        </span>
      )}
      {review.notBelonging > 0 && <span className="tag warn">{review.notBelonging === 1 ? "1 doesn't belong" : `${review.notBelonging} don't belong`}</span>}
      {showGroup && group.length > 0 && (
        <span className="review-state review-group">
          same claim as <ClaimLinks ids={group.map((other) => other.id)} />
        </span>
      )}
      {inbound.length > 0 && (
        <span className="review-state">
          +{inbound.length} reading{inbound.length === 1 ? "" : "s"} marked here, from <ClaimLinks ids={fromClaims} />
        </span>
      )}
    </>
  );
}

/**
 * Claim numbers as links, comma-separated.
 *
 * @param props.ids  The claims.
 * @returns "#419, #421", each a link.
 */
function ClaimLinks({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, index) => (
        <span key={id}>
          {index > 0 && ", "}
          <a href={`/claims/${id}`}>#{id}</a>
        </span>
      ))}
    </>
  );
}
