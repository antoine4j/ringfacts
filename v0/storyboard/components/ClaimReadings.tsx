// The readings of one claim, in date order, as the claims pages show them.
// On a wide screen a table, the headline and the extract sentence side by side
// and widest; on a phone each reading stacks: date, outlet and tags, then the
// headline, then the sentence (globals.css, .readings).

import Link from "next/link";
import { pacificTime } from "../lib/format.ts";
import type { MemberRow } from "../lib/queries.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { PickTag, TierTag, PostedTag } from "./bits.tsx";

/**
 * A claim's readings: published, outlet, headline, extract sentence, tier, cell and pick.
 *
 * @param props.rows  The readings, oldest first.
 * @param props.schema  Kept on the links to each reading.
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
        <span className="tags">tier · cell · pick</span>
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
            <span className="tags">
              <TierTag tier={row.tier} />
              {row.cell && <span className="small muted">{row.cell}</span>}
              <PickTag pick={row.pick} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
