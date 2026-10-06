// Claims: every piece of news v0 grouped its readings into, newest activity
// first (or newest claim, or most outlets). Each claim says whether it was
// posted, went out in a digest, or neither, and opens to its readings.

import Link from "next/link";
import { ClaimReadings } from "../components/ClaimReadings.tsx";
import { SameClaimReview } from "../components/ReviewControls.tsx";
import { ReviewDot, ReviewStatus } from "../components/ReviewStatus.tsx";
import { Empty, isDoubtfulPick, tierName, tierTitle } from "../components/bits.tsx";
import { FeedbackForm } from "../components/FeedbackForm.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { query } from "../lib/db.ts";
import { claimFilter, claimOrder, whereSql, type Params } from "../lib/filters.ts";
import { dayAndClock, shortTime } from "../lib/format.ts";
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
        {claims.length === LIMIT ? ` (the first ${LIMIT})` : ""}. Dates, outlet and tier match a claim when any of its readings matches. A grouping under 50%
        sure shows as "doubtful join".
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
  // A join is doubtful when the pick that made it was under 50% sure; Anton's mark on the reading, either way, settles it.
  const doubtful = rows.filter((row) => isDoubtfulPick(row.pick));
  const unsettled = doubtful.filter((row) => !review?.marks[row.reading_id]).length;
  const tier = claimTier(rows);
  const labelChanged = claim.current_label !== claim.label;

  return (
    <details className={`claim${review?.review.state === "reviewed" ? " is-reviewed" : ""}`}>
      <summary>
        <div className="label-row">
          <span className="label">{claim.current_label}</span>
          <Link className="claim-id" href={`/claims/${claim.id}${schemaSuffix(schema)}`} title="Open this claim's page">
            #{claim.id}
          </Link>
          <ReviewDot view={review} readings={rows.length} />
        </div>
        {labelChanged && <div className="small muted">first label: {claim.label}</div>}
        {/* Facts on the left, each in a column of its own; the verdict on the right, under the number. */}
        <div className="meta">
          <span className="meta-fighter">{claim.fighter}</span>
          <span className="meta-counts">
            {claim.readings} reading{Number(claim.readings) === 1 ? "" : "s"} · {claim.outlets} outlet{Number(claim.outlets) === 1 ? "" : "s"}
          </span>
          <span className="meta-times">{firstAndLatest(claim.first_published, claim.last_published)}</span>
          <span className="meta-flags">
            {doubtful.length > 0 && (
              <span
                className={`tag help ${unsettled > 0 ? "note-doubt" : "note-settled"}`}
                title={`The grouping was under 50% sure when it joined ${doubtful.length === 1 ? "this reading" : "these readings"} to this claim: ${doubtful.length - unsettled} reviewed, ${unsettled} not yet.`}
              >
                {doubtful.length} doubtful join{doubtful.length === 1 ? "" : "s"}
              </span>
            )}
            <ReviewStatus view={review} showDone={false} />
          </span>
          <ClaimVerdict claim={claim} tier={tier} digest={digest} schema={schema} />
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
 * A claim's tier as the digest writer counts it: its best reading's tier, decided or not sent yet.
 *
 * @param rows  The claim's readings.
 * @returns The best tier, and a tooltip sentence when its readings' tiers differ; null when none is decided.
 */
function claimTier(rows: MemberRow[]): { best: number; note?: string } | null {
  const tiers = rows.map((row) => row.tier).filter((tier): tier is number => tier !== null && tier !== undefined);
  if (tiers.length === 0) return null;
  const best = Math.min(...tiers);

  // Readings in more than one tier: say how many in each.
  const names: Record<number, string> = { 1: "post", 2: "digest", 3: "drop" };
  const counts = [1, 2, 3].map((tier) => ({ tier, count: tiers.filter((each) => each === tier).length })).filter((entry) => entry.count > 0);
  if (counts.length === 1) return { best };
  return { best, note: `The claim takes its best reading's tier; its readings: ${counts.map((entry) => `${entry.count} ${names[entry.tier]}`).join(", ")}.` };
}

/**
 * When a claim's readings were published: the first, and the latest when later; the latest's day only when it differs.
 *
 * @param first  The first reading's time.
 * @param latest  The latest reading's time.
 * @returns Such as "first 24 Sep 5:00 AM · latest 11:40 AM".
 */
function firstAndLatest(first: Date | string | null, latest: Date | string | null): string {
  const text = `first ${shortTime(first)}`;
  if (!latest || String(latest) === String(first)) return text;
  const [firstDay] = dayAndClock(first);
  const [latestDay, latestClock] = dayAndClock(latest);
  return `${text} · latest ${latestDay === firstDay ? latestClock : `${latestDay} ${latestClock}`}`;
}

/**
 * The claim's verdict as one pill in its tier's colour, like a reading's tier badge: the
 * tier's name, a thin divider, then where it went; the pill ends at the card's right edge.
 *
 * @param props.claim  The claim.
 * @param props.tier  Its tier, from claimTier, or null when no reading is decided.
 * @param props.digest  The latest posted digest that used it, or null.
 * @param props.schema  Kept on the digest link.
 * @returns Such as "digest | not sent", "post | posted", "digest | sent · week to 5 Oct", or "drop".
 */
function ClaimVerdict({ claim, tier, digest, schema }: { claim: ClaimRow; tier: { best: number; note?: string } | null; digest: InDigest | null; schema: Schema }) {
  // Where it went: its own post, a posted digest, or nowhere yet (said only when it was meant to go somewhere).
  let outcome = null;
  if (claim.posted_reading_id) outcome = <span>posted</span>;
  else if (digest) {
    outcome = (
      <Link href={`/digests?fighter=${encodeURIComponent(claim.fighter)}${schema === "replay" ? "&schema=replay" : ""}#digest-${digest.digest_id}`}>
        sent · week to {dayAndClock(digest.period_end)[0]}
      </Link>
    );
  } else if (tier && tier.best < 3) outcome = <span>not sent</span>;

  if (!tier) {
    return (
      <span className="meta-verdict" title="No reading decided yet">
        undecided
      </span>
    );
  }
  return (
    <span className={`meta-verdict tag help tier-${tier.best}`} title={tierTitle(tier.best, tier.note)}>
      <span className={`verdict-tier${outcome ? " divided" : ""}`}>{tierName(tier.best)}</span>
      {outcome}
    </span>
  );
}
