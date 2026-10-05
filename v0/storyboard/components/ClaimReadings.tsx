// The readings of one claim, in date order, as the claims pages show them.
// Two separate judgements sit on each reading: grouping (did it belong in this
// claim, and how sure was the pick) and the decision (its tier, and the
// classifier answers behind it). On a wide screen a table, the headline and the
// extract sentence widest; on a phone each reading stacks: date, outlet and the
// grouping, then the headline, the sentence, and the decision (globals.css,
// .readings).

import Link from "next/link";
import { pacificTime } from "../lib/format.ts";
import type { MemberRow } from "../lib/queries.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { PickTag, PostedTag } from "./bits.tsx";
import { Decision } from "./Decision.tsx";

/**
 * A claim's readings: published, outlet, headline, extract sentence, grouping and decision.
 *
 * @param props.rows  The readings, oldest first.
 * @param props.schema  Kept on the links to each reading and to the settings.
 * @param props.postedReadingId  The reading that was posted for the claim, if any.
 * @returns The list.
 */
export function ClaimReadings({ rows, schema, postedReadingId }: { rows: MemberRow[]; schema: Schema; postedReadingId: string | null }) {
  return (
    <div className="readings">
      <div className="reading head" aria-hidden="true">
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
        return (
          <div className="reading" key={row.reading_id}>
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
