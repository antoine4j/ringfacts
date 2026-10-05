// Claims: every piece of news v0 grouped its readings into, newest activity
// first. Each claim opens to its readings in date order.

import Link from "next/link";
import { ClaimReadings } from "../components/ClaimReadings.tsx";
import { Empty } from "../components/bits.tsx";
import { FeedbackForm } from "../components/FeedbackForm.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { query } from "../lib/db.ts";
import { claimFilter, whereSql, type Params } from "../lib/filters.ts";
import { pacificTime } from "../lib/format.ts";
import { claimMembers, fighterNames, outletNames, type ClaimRow, type MemberRow } from "../lib/queries.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../lib/schema.ts";

/** The most claims one page shows. */
const LIMIT = 300;

/**
 * The claims page.
 *
 * @param props.searchParams  The filters from the address.
 * @returns The page.
 */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const schema = schemaFrom(params.schema);

  // The claims that match, then all their readings in one query.
  const filter = claimFilter(params);
  const claims = await query<ClaimRow>(
    schema,
    `SELECT cn.* FROM claim_now cn ${whereSql(filter)} ORDER BY cn.last_published DESC NULLS LAST, cn.id DESC LIMIT ${LIMIT}`,
    filter.values,
  );
  const members = await claimMembers(schema, claims.map((claim) => claim.id));
  const [fighters, outlets] = await Promise.all([fighterNames(schema), outletNames(schema)]);

  return (
    <>
      <h1>Claims</h1>
      <FilterBar path="/" params={params} schema={schema} fighters={fighters} outlets={outlets} />
      <p className="muted small">
        {claims.length} claim{claims.length === 1 ? "" : "s"}
        {claims.length === LIMIT ? ` (the first ${LIMIT})` : ""}. Dates, outlet and tier match a claim when any of its readings matches. A pick under 50% is
        flagged ⚠.
      </p>
      {claims.length === 0 && <Empty>No claims match.</Empty>}
      {claims.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} rows={members.get(claim.id) ?? []} schema={schema} />
      ))}
    </>
  );
}

/**
 * One claim, folded: its labels and numbers on top, its readings inside.
 *
 * @param props.claim  The claim.
 * @param props.rows  Its readings, oldest first.
 * @param props.schema  Kept on links.
 * @returns The card.
 */
function ClaimCard({ claim, rows, schema }: { claim: ClaimRow; rows: MemberRow[]; schema: Schema }) {
  // A join is doubtful when the pick that made it was under 50% sure.
  const doubtful = rows.filter((row) => typeof row.pick?.confidence === "number" && row.pick.confidence < 0.5).length;
  const labelChanged = claim.current_label !== claim.label;

  return (
    <details className="claim">
      <summary>
        <div className="label">{claim.current_label}</div>
        {labelChanged && <div className="small muted">first label: {claim.label}</div>}
        <div className="meta">
          <span>{claim.fighter}</span>
          <span>
            {claim.readings} readings · {claim.outlets} outlets
          </span>
          <span>
            {pacificTime(claim.first_published)} → {pacificTime(claim.last_published)}
          </span>
          {claim.posted_reading_id ? <span className="tag good">posted (#{claim.posted_reading_id})</span> : <span>not posted</span>}
          {doubtful > 0 && <span className="tag warn">{doubtful} doubtful join{doubtful === 1 ? "" : "s"} ⚠</span>}
          <Link href={`/claims/${claim.id}${schemaSuffix(schema)}`}>claim #{claim.id} →</Link>
        </div>
      </summary>
      <ClaimReadings rows={rows} schema={schema} postedReadingId={claim.posted_reading_id} />
      <FeedbackForm target="claim" id={claim.id} schema={schema} fields={["grouping", "label", "current_label", "claim"]} label="feedback on this claim" />
    </details>
  );
}
