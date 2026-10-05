// The readings of one claim, in date order, as the claims pages show them.

import Link from "next/link";
import { pacificTime } from "../lib/format.ts";
import type { MemberRow } from "../lib/queries.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { PickTag, TierTag } from "./bits.tsx";

/**
 * A table of a claim's readings: headline, outlet, date, tier, cell, pick and extract sentence.
 *
 * @param props.rows  The readings, oldest first.
 * @param props.schema  Kept on the links to each reading.
 * @param props.postedReadingId  The reading that was posted for the claim, if any.
 * @returns The table.
 */
export function ClaimReadings({ rows, schema, postedReadingId }: { rows: MemberRow[]; schema: Schema; postedReadingId: string | null }) {
  return (
    <table>
      <thead>
        <tr>
          <th>published</th>
          <th>outlet</th>
          <th>headline</th>
          <th>tier</th>
          <th>cell</th>
          <th>pick</th>
          <th>extract sentence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.reading_id}>
            <td className="nowrap">{pacificTime(row.published_at)}</td>
            <td>{row.outlet}</td>
            <td>
              <a href={row.url} target="_blank" rel="noreferrer">
                {row.headline}
              </a>{" "}
              <Link href={`/readings/${row.reading_id}${schemaSuffix(schema)}`} className="small">
                #{row.reading_id}
              </Link>
              {row.reading_id === postedReadingId && <span className="tag good">posted</span>}
            </td>
            <td>
              <TierTag tier={row.tier} />
            </td>
            <td className="small">{row.cell}</td>
            <td>
              <PickTag pick={row.pick} />
            </td>
            <td className="small">{row.sentence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
