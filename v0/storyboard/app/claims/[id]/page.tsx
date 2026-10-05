// One claim: both labels, its numbers, its readings, and feedback on it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimReadings } from "../../../components/ClaimReadings.tsx";
import { FeedbackForm } from "../../../components/FeedbackForm.tsx";
import { FeedbackList } from "../../../components/FeedbackList.tsx";
import { query } from "../../../lib/db.ts";
import type { Params } from "../../../lib/filters.ts";
import { pacificTime } from "../../../lib/format.ts";
import { claimMembers, feedbackOn, type ClaimRow } from "../../../lib/queries.ts";
import { schemaFrom, schemaSuffix } from "../../../lib/schema.ts";

/** The answers a note on a claim can be about. */
const CLAIM_FIELDS = ["grouping", "label", "current_label", "posted_reading", "claim"];

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

  // The claim, its readings and the feedback on it.
  const claims = await query<ClaimRow>(schema, "SELECT * FROM claim_now WHERE id = $1", [id]);
  const claim = claims[0];
  if (!claim) notFound();
  const members = await claimMembers(schema, [id]);
  const feedback = await feedbackOn(schema, "claim", id);

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
      </dl>
      <FeedbackForm target="claim" id={claim.id} schema={schema} fields={CLAIM_FIELDS} label="feedback on this claim" />
      <h2>Readings</h2>
      <ClaimReadings rows={members.get(claim.id) ?? []} schema={schema} postedReadingId={claim.posted_reading_id} />
      <h2>Feedback</h2>
      <FeedbackList rows={feedback} />
    </>
  );
}
