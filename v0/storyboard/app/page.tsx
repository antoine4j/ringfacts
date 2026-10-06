// Claims: every piece of news v0 grouped its readings into, newest activity
// first (or newest claim, or most outlets). Each claim says whether it was
// posted, went out in a digest, or neither, and opens to its readings.

import Link from "next/link";
import { ClaimReadings } from "../components/ClaimReadings.tsx";
import { SameClaimReview } from "../components/ReviewControls.tsx";
import { ReviewDot, ReviewStatus } from "../components/ReviewStatus.tsx";
import { Empty } from "../components/bits.tsx";
import { FeedbackForm } from "../components/FeedbackForm.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { query } from "../lib/db.ts";
import { claimFilter, claimOrder, whereSql, type Params } from "../lib/filters.ts";
import { shortTime } from "../lib/format.ts";
import { claimMembers, claimReviews, fighterNames, outletNames, type ClaimRow, type MemberRow } from "../lib/queries.ts";
import type { ClaimReviewView } from "../lib/reviews.ts";
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
    `SELECT cn.* FROM claim_now cn ${whereSql(filter)} ORDER BY ${claimOrder(params)} LIMIT ${LIMIT}`,
    filter.values,
  );
  const members = await claimMembers(schema, claims.map((claim) => claim.id));
  const reviews = await claimReviews(schema, members);

  // The latest posted digest that used each claim.
  const digested = await query<InDigest>(
    schema,
    `SELECT DISTINCT ON (dc.claim_id) dc.claim_id, d.id AS digest_id, d.period_end
     FROM digest_claims dc JOIN digests d ON d.id = dc.digest_id
     WHERE dc.used AND d.posted_at IS NOT NULL AND dc.claim_id = ANY($1::bigint[])
     ORDER BY dc.claim_id, d.period_end DESC`,
    [claims.map((claim) => claim.id)],
  );
  const digestOf = new Map(digested.map((row) => [row.claim_id, row]));
  const [fighters, outlets] = await Promise.all([fighterNames(schema), outletNames(schema)]);

  return (
    <>
      <h1>Claims</h1>
      <FilterBar path="/" params={params} schema={schema} fighters={fighters} outlets={outlets} claimOptions />
      <p className="muted small">
        {claims.length} claim{claims.length === 1 ? "" : "s"}
        {claims.length === LIMIT ? ` (the first ${LIMIT})` : ""}. Dates, outlet and tier match a claim when any of its readings matches. A pick under 50% is
        flagged ⚠.
      </p>
      {claims.length === 0 && <Empty>No claims match.</Empty>}
      {claims.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} rows={members.get(claim.id) ?? []} digest={digestOf.get(claim.id) ?? null} schema={schema} review={reviews.get(claim.id)} />
      ))}
    </>
  );
}

/** The latest posted digest that used a claim. */
type InDigest = { claim_id: string; digest_id: string; period_end: Date };

/**
 * One claim, folded: its labels and numbers on top, its readings inside.
 *
 * @param props.claim  The claim.
 * @param props.rows  Its readings, oldest first.
 * @param props.digest  The latest posted digest that used it, or null.
 * @param props.schema  Kept on links.
 * @param props.review  Its review (D35); absent on the golden replay.
 * @returns The card.
 */
function ClaimCard({ claim, rows, digest, schema, review }: { claim: ClaimRow; rows: MemberRow[]; digest: InDigest | null; schema: Schema; review?: ClaimReviewView }) {
  // A join is doubtful when the pick that made it was under 50% sure.
  const doubtful = rows.filter((row) => typeof row.pick?.confidence === "number" && row.pick.confidence < 0.5).length;
  const labelChanged = claim.current_label !== claim.label;

  return (
    <details className={`claim${review?.review.state === "reviewed" ? " is-reviewed" : ""}`}>
      <summary>
        <div className="label-row">
          <ReviewDot view={review} readings={rows.length} />
          <span className="label">{claim.current_label}</span>
          <Link className="claim-id" href={`/claims/${claim.id}${schemaSuffix(schema)}`} title="Open this claim's page">
            #{claim.id}
          </Link>
        </div>
        {labelChanged && <div className="small muted">first label: {claim.label}</div>}
        <div className="meta">
          <span>{claim.fighter}</span>
          <span>
            {claim.readings} reading{Number(claim.readings) === 1 ? "" : "s"} · {claim.outlets} outlet{Number(claim.outlets) === 1 ? "" : "s"}
          </span>
          <span>
            first {shortTime(claim.first_published)}
            {claim.last_published && String(claim.last_published) !== String(claim.first_published) ? ` · latest ${shortTime(claim.last_published)}` : ""}
          </span>
          <ClaimStatus claim={claim} digest={digest} schema={schema} />
          {doubtful > 0 && <span className="tag warn">{doubtful} doubtful join{doubtful === 1 ? "" : "s"} ⚠</span>}
          <ReviewStatus view={review} showDone={false} />
        </div>
      </summary>
      {review && (
        <div className="review-bar">
          <SameClaimReview claimId={claim.id} group={review.group} />
        </div>
      )}
      <ClaimReadings rows={rows} schema={schema} postedReadingId={claim.posted_reading_id} claimId={claim.id} review={review} />
      <FeedbackForm target="claim" id={claim.id} schema={schema} fields={["grouping", "label", "current_label", "claim"]} label="feedback on this claim" />
    </details>
  );
}

/**
 * Where a claim went: its own post, a digest, or neither.
 *
 * @param props.claim  The claim.
 * @param props.digest  The latest posted digest that used it, or null.
 * @param props.schema  Kept on the link.
 * @returns A tag.
 */
function ClaimStatus({ claim, digest, schema }: { claim: ClaimRow; digest: InDigest | null; schema: Schema }) {
  if (claim.posted_reading_id) return <span className="tag good">posted</span>;
  if (digest) {
    return (
      <Link className="tag" href={`/digests?fighter=${encodeURIComponent(claim.fighter)}${schema === "replay" ? "&schema=replay" : ""}#digest-${digest.digest_id}`}>
        in digest · week to {shortTime(digest.period_end).split(" ").slice(0, 2).join(" ")}
      </Link>
    );
  }
  return <span className="muted">not sent</span>;
}
