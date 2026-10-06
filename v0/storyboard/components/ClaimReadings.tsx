// The readings of one claim, in date order, as the claims pages show them.
// Three separate judgements sit on each reading: Anton's review (✓ belongs,
// ✕ does not, D35; its note and where a ✕ reading belongs show under the
// headline), grouping (did it join this claim, and how sure was the
// pick) and the decision (its tier, and the classifier answers behind it).
// On a wide screen a table, the headline and the extract sentence widest; on
// a phone each reading stacks: review, date, outlet and the grouping, then
// the headline, the sentence, and the decision (globals.css, .readings).

import Link from "next/link";
import { dayAndClock } from "../lib/format.ts";
import type { MemberRow } from "../lib/queries.ts";
import type { ClaimReviewView } from "../lib/reviews.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { PickTag, PostedTag } from "./bits.tsx";
import { Decision } from "./Decision.tsx";
import { MarkLine, ReadingReview, ReviewRow } from "./ReviewControls.tsx";

/**
 * A claim's readings: review, published, outlet, headline, extract sentence, grouping and decision.
 *
 * @param props.rows  The readings, oldest first.
 * @param props.schema  Kept on the links to each reading and to the settings.
 * @param props.postedReadingId  The reading that was posted for the claim, if any.
 * @param props.claimId  The claim.
 * @param props.review  Its review (D35); absent on the golden replay, where nothing is reviewed here.
 * @returns The list.
 */
export function ClaimReadings({ rows, schema, postedReadingId, claimId, review }: { rows: MemberRow[]; schema: Schema; postedReadingId: string | null; claimId: string; review?: ClaimReviewView }) {
  return (
    <div className="readings">
      <div className="reading head" aria-hidden="true">
        <span className="reviewed" title="Your review: ✓ belongs in this claim, ✕ does not">
          review
        </span>
        <span className="when">published</span>
        <span className="outlet">outlet</span>
        <span className="headline">headline</span>
        <span className="sentence">extract sentence</span>
        <span className="grouping" title="Grouping: whether this article joined the claim or started it, and how sure the pick was">
          grouping
        </span>
        <span className="decision-cell" title="Decision: the tier, and the classifier answers that gave it">
          decision
        </span>
      </div>
      {rows.map((row) => {
        const [day, time] = dayAndClock(row.published_at);
        const cells = (
          <>
            <span className="reviewed">{review ? <ReadingReview /> : <span className="muted">–</span>}</span>
            <span className="when">
              {day} <br />
              {time}{" "}
              <Link href={`/readings/${row.reading_id}${schemaSuffix(schema)}`} className="reading-id" title="This reading's page: every station's answer">
                #{row.reading_id}
              </Link>
            </span>
            <span className="outlet">{row.outlet}</span>
            <span className="headline">
              <a href={row.url} target="_blank" rel="noreferrer">
                {row.headline}
              </a>
              {row.reading_id === postedReadingId && <PostedTag reaction={row.reaction} />}
              {review && <MarkLine />}
            </span>
            <span className="sentence">{row.sentence}</span>
            <span className="grouping">
              <PickTag pick={row.pick} reviewed={Boolean(review?.marks[row.reading_id])} />
            </span>
            <span className="decision-cell">
              <Decision tier={row.tier} cell={row.cell} centrality={row.centrality} schema={schema} />
            </span>
          </>
        );

        // A reviewed claim's row shares its mark between the ✓ ✕ cell and the line under the headline.
        return review ? (
          <ReviewRow key={row.reading_id} claimId={claimId} readingId={row.reading_id} current={review.marks[row.reading_id] ?? null}>
            {cells}
          </ReviewRow>
        ) : (
          <div className="reading" key={row.reading_id}>
            {cells}
          </div>
        );
      })}
    </div>
  );
}

