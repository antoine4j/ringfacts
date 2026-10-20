// One claim: both labels, its numbers, its marks and note, and its readings.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimNote } from "../../../components/ClaimNote.tsx";
import { ClaimReadings } from "../../../components/ClaimReadings.tsx";
import { SameClaimReview } from "../../../components/ReviewControls.tsx";
import { ReviewStatus } from "../../../components/ReviewStatus.tsx";
import { TierReview } from "../../../components/TierReview.tsx";
import { tierName } from "../../../components/bits.tsx";
import { query } from "../../../lib/db.ts";
import type { Params } from "../../../lib/filters.ts";
import { pacificTime, shortTime } from "../../../lib/format.ts";
import { bestTier } from "../../../lib/live-scores.ts";
import { claimMembers, claimNotesFor, claimReviews, tierMarksFor, type ClaimRow } from "../../../lib/queries.ts";
import { schemaFrom, schemaSuffix } from "../../../lib/schema.ts";
import { newestTierMarks, tierJudgement, tierToJudge } from "../../../lib/tier-marks.ts";

/**
 * The claim page.
 *
 * @param props.params  The claim id from the address.
 * @param props.searchParams  ?schema=replay, if any.
 * @returns The page.
 */
export default async function ClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  const schema = schemaFrom((await searchParams).schema);
  if (!/^\d+$/.test(id)) notFound();

  // The claim, its readings, and the note on it (live data only).
  const claims = await query<ClaimRow>(schema, "SELECT * FROM claim_now WHERE id = $1", [id]);
  const claim = claims[0];
  if (!claim) notFound();
  const members = await claimMembers(schema, [id]);
  const review = (await claimReviews(schema, members)).get(id);
  const note = schema === "public" ? ((await claimNotesFor([id])).get(id) ?? null) : null;

  // The claim's tier (its best reading's) and the tier mark on it, live data only.
  const tierNow = bestTier((members.get(id) ?? []).map((member) => member.tier));
  const tierMarks = schema === "public" && tierNow !== null ? await tierMarksFor([id]) : [];
  const judgement = tierJudgement(newestTierMarks(tierMarks).get(id), tierNow);
  const tierWaits = tierToJudge(review?.review.state === "reviewed", schema === "public" ? judgement : undefined, tierNow);

  return (
    <>
      <h1>Claim #{claim.id}</h1>
      <dl className="kv">
        <dt>current label</dt>
        <dd>
          {claim.current_label}{" "}
          {claim.current_label_reading_id && (
            <Link className="small" href={`/readings/${claim.current_label_reading_id}${schemaSuffix(schema)}`}>
              (from #{claim.current_label_reading_id})
            </Link>
          )}
        </dd>
        <dt>first label</dt>
        <dd>
          {claim.label}{" "}
          <Link className="small" href={`/readings/${claim.first_reading_id}${schemaSuffix(schema)}`}>
            (from #{claim.first_reading_id})
          </Link>
        </dd>
        <dt>fighter</dt>
        <dd>{claim.fighter}</dd>
        <dt>readings · outlets</dt>
        <dd>
          {claim.readings} · {claim.outlets}
        </dd>
        <dt>published</dt>
        <dd>
          {pacificTime(claim.first_published)} → {pacificTime(claim.last_published)}
        </dd>
        <dt>posted</dt>
        <dd>{claim.posted_reading_id ? `yes, reading #${claim.posted_reading_id}` : "no"}</dd>
        <dt>grouping version</dt>
        <dd>{claim.grouping_version}</dd>
        <dt>created</dt>
        <dd>{pacificTime(claim.created_at)}</dd>
        {tierNow !== null && (
          <>
            <dt>tier</dt>
            <dd className="review-line">
              <span>
                {tierNow} · {tierName(tierNow)}
              </span>
              {schema === "public" && <TierReview claimId={claim.id} tierNow={tierNow} judgement={judgement} />}
            </dd>
          </>
        )}
        {review && (
          <>
            <dt>review</dt>
            <dd className="review-line">
              <ReviewStatus view={review} showGroup={false} tierToJudge={tierWaits} />
              <SameClaimReview claimId={claim.id} group={review.group} />
            </dd>
          </>
        )}
        {schema === "public" && (
          <>
            <dt>note</dt>
            <dd>
              <ClaimNote claimId={claim.id} note={note?.note ?? ""} written={shortTime(note?.created_at)} />
            </dd>
          </>
        )}
      </dl>
      <h2>Readings</h2>
      <ClaimReadings rows={members.get(claim.id) ?? []} schema={schema} postedReadingId={claim.posted_reading_id} claimId={claim.id} review={review} />
    </>
  );
}
