// A claim's review on its folded card (D35): whether its readings are
// reviewed, how many arrived since, how many do not belong, the claims Anton
// said it is the same claim as, and readings marked as belonging here from
// another claim. Quiet on purpose: muted words, one warning tint.

import type { ClaimReviewView } from "../lib/reviews.ts";

/**
 * The review words on a claim's card, or nothing when there is nothing to say.
 *
 * @param props.view  The claim's review.
 * @param props.showGroup  Name the claims it is the same claim as; off where the controls list them.
 * @returns The words.
 */
export function ReviewStatus({ view, showGroup = true }: { view: ClaimReviewView | undefined; showGroup?: boolean }) {
  if (!view) return null;
  const { review, group, inbound } = view;
  const fromClaims = [...new Set(inbound.map((moved) => moved.fromClaimId))];
  return (
    <>
      {review.state === "reviewed" && <span className="review-state">✓ reviewed</span>}
      {review.state === "has_new" && (
        <span className="review-state has-new">
          ✓ reviewed · {review.newCount} new
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
