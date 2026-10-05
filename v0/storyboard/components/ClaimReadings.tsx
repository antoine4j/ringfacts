// The readings of one claim, in date order, as the claims pages show them.
// Three separate judgements sit on each reading: Anton's review (✓ belongs,
// ✕ does not, D35), grouping (did it join this claim, and how sure was the
// pick) and the decision (its tier, and the classifier answers behind it).
// On a wide screen a table, the headline and the extract sentence widest; on
// a phone each reading stacks: review, date, outlet and the grouping, then
// the headline, the sentence, and the decision (globals.css, .readings).

import Link from "next/link";
import { pacificTime } from "../lib/format.ts";
import type { MemberRow } from "../lib/queries.ts";
import type { ClaimReviewView } from "../lib/reviews.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { PickTag, PostedTag } from "./bits.tsx";
import { Decision } from "./Decision.tsx";
import { ReadingReview } from "./ReviewControls.tsx";

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
        const [day, time] = pacificTime(row.published_at).split(" ");
        const mark = review?.marks[row.reading_id] ?? null;
        const isNew = review !== undefined && review.review.state !== "none" && !mark;
        const isOff = mark !== null && mark.verdict !== "belongs";
        return (
          <div className={`reading${isNew ? " is-new" : ""}${isOff ? " is-off" : ""}`} key={row.reading_id}>
            <span className="reviewed">{review ? <ReadingReview claimId={claimId} readingId={row.reading_id} current={mark} /> : <span className="muted">–</span>}</span>
            <span className="when">
              {day} <br />
              {time}
            </span>
            <span className="outlet">{row.outlet}</span>
            <span className="headline">
              <a href={row.url} target="_blank" rel="noreferrer">
                {row.headline}
              </a>{" "}
              <Link href={`/readings/${row.reading_id}${schemaSuffix(schema)}`} className="small">
                #{row.reading_id}
              </Link>
              {row.reading_id === postedReadingId && <PostedTag reaction={row.reaction} />}
              {isOff && mark && <MarkNote verdict={mark.verdict} belongsIn={mark.belongs_in_claim_id} note={mark.note} />}
              {isNew && <span className="new-tag">new since review</span>}
            </span>
            <span className="sentence">{row.sentence}</span>
            <span className="grouping">
              <PickTag pick={row.pick} />
            </span>
            <span className="decision-cell">
              <Decision tier={row.tier} cell={row.cell} centrality={row.centrality} schema={schema} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where a reading marked ✕ belongs, and the note, if any.
 *
 * @param props.verdict  does_not_belong or own_claim.
 * @param props.belongsIn  The claim it belongs in, when named.
 * @param props.note  Anton's note.
 * @returns A quiet line.
 */
function MarkNote({ verdict, belongsIn, note }: { verdict: string; belongsIn: string | null; note: string }) {
  const where = verdict === "own_claim" ? "its own claim" : belongsIn ? null : "doesn't belong";
  return (
    <span className="mark-note">
      {where ?? (
        <>
          belongs in <a href={`/claims/${belongsIn}`}>#{belongsIn}</a>
        </>
      )}
      {note && <span className="mark-why"> · {note}</span>}
    </span>
  );
}
