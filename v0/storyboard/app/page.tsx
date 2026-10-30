// Claims: every piece of news v0 grouped its readings into, newest activity
// first (or newest claim, or most outlets). Each claim says whether it was
// posted, went out in a digest, or neither, and opens to its readings.

import Link from "next/link";
import { Suspense } from "react";
import { AgentClaimBar, AgentCount } from "../components/AgentCalls.tsx";
import { ClaimNote } from "../components/ClaimNote.tsx";
import { ClaimReadings } from "../components/ClaimReadings.tsx";
import { SameClaimReview } from "../components/ReviewControls.tsx";
import { ReviewDot, ReviewStatus } from "../components/ReviewStatus.tsx";
import { ScoreStrip } from "../components/ScoreStrip.tsx";
import { TierCheck } from "../components/TierCheck.tsx";
import { Empty, isDoubtfulPick, tierName, tierTitle } from "../components/bits.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { query } from "../lib/db.ts";
import { claimFilter, claimOrder, whereSql, type Params } from "../lib/filters.ts";
import { dayAndClock, shortTime } from "../lib/format.ts";
import { bestTier } from "../lib/live-scores.ts";
import { claimAgentViews, claimMembers, claimNotesFor, claimReviews, fighterNames, outletNames, tierMarksFor, type ClaimNoteRow, type ClaimRow, type MemberRow } from "../lib/queries.ts";
import type { ClaimAgentView } from "../lib/agent-marks.ts";
import type { ClaimReviewView } from "../lib/reviews.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../lib/schema.ts";
import { tierJudgements, tierToJudge, type TierJudgement } from "../lib/tier-marks.ts";

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
  const matching = await query<ClaimRow>(
    schema,
    `SELECT cn.* FROM claim_now cn ${whereSql(filter)} ORDER BY ${claimOrder(params)} LIMIT ${LIMIT}`,
    filter.values,
  );

  // The agents' calls, when loaded; ?agent=open or ?agent=differs keeps the claims with such calls.
  const agentViews = await claimAgentViews(schema, matching.map((claim) => claim.id));
  const claims = matching.filter((claim) => agentKept(params.agent, agentViews.get(claim.id)));
  const members = await claimMembers(schema, claims.map((claim) => claim.id));
  const reviews = await claimReviews(schema, members);
  const notes = schema === "public" ? await claimNotesFor(claims.map((claim) => claim.id)) : new Map<string, ClaimNoteRow>();

  // Each claim's tier today and the tier mark on it, live data only.
  const tierOf = new Map([...members].map(([claimId, rows]) => [claimId, bestTier(rows.map((row) => row.tier))]));
  const judgements = schema === "public" ? tierJudgements(await tierMarksFor(claims.map((claim) => claim.id)), tierOf) : new Map<string, TierJudgement>();

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
      {schema === "public" && (
        <Suspense fallback={<p className="score-strip small muted">Scores, all time: counting…</p>}>
          <ScoreStrip />
        </Suspense>
      )}
      <FilterBar path="/" params={params} schema={schema} fighters={fighters} outlets={outlets} claimOptions />
      <p className="muted small">
        {claims.length} claim{claims.length === 1 ? "" : "s"}
        {claims.length === LIMIT ? ` (the first ${LIMIT})` : ""}. Dates, outlet and tier match a claim when any of its readings matches. A grouping under 50%
        sure shows as "doubtful join".
      </p>
      {agentViews.size > 0 && <AgentFilterLine params={params} views={agentViews} />}
      {claims.length === 0 && <Empty>No claims match.</Empty>}
      {claims.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} rows={members.get(claim.id) ?? []} digest={digestOf.get(claim.id) ?? null} schema={schema} review={reviews.get(claim.id)} note={notes.get(claim.id) ?? null} tierMark={judgements.get(claim.id)} agent={agentViews.get(claim.id)} />
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
 * @param props.note  Anton's note on it and when he wrote it; null when none.
 * @param props.tierMark  What the tier mark on it says; absent on the golden replay.
 * @param props.agent  The agents' calls on it; absent when none are loaded.
 * @returns The card.
 */
function ClaimCard({ claim, rows, digest, schema, review, note, tierMark, agent }: { claim: ClaimRow; rows: MemberRow[]; digest: InDigest | null; schema: Schema; review?: ClaimReviewView; note: ClaimNoteRow | null; tierMark?: TierJudgement; agent?: ClaimAgentView }) {
  // A join is doubtful when the pick that made it was under 50% sure; Anton's mark on the reading, either way, settles it.
  const doubtful = rows.filter((row) => isDoubtfulPick(row.pick));
  const unsettled = doubtful.filter((row) => !review?.marks[row.reading_id]).length;
  const tier = claimTier(rows);
  const labelChanged = claim.current_label !== claim.label;

  // Green once every reading is reviewed and the tier is judged; in between while the tier waits.
  const readingsReviewed = review?.review.state === "reviewed";
  const tierWaits = tierToJudge(readingsReviewed, tierMark, tier?.best ?? null);

  return (
    <details className={`claim${readingsReviewed && !tierWaits ? " is-reviewed" : ""}`}>
      <summary>
        <div className="label-row">
          <span className="label">{claim.current_label}</span>
          <Link className="claim-id" href={`/claims/${claim.id}${schemaSuffix(schema)}`} title="Open this claim's page">
            #{claim.id}
          </Link>
          <ReviewDot view={review} readings={rows.length} tierToJudge={tierWaits} />
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
            <AgentCount view={agent} />
          </span>
          <ClaimVerdict claim={claim} tier={tier} digest={digest} schema={schema} />
        </div>
      </summary>
      {review && (
        <div className="review-bar">
          <SameClaimReview claimId={claim.id} group={review.group} />
          <ClaimNote claimId={claim.id} note={note?.note ?? ""} written={shortTime(note?.created_at)} />
          {tier && tierMark && <TierCheck claimId={claim.id} tierNow={tier.best} judgement={tierMark} />}
        </div>
      )}
      {agent && <AgentClaimBar claimId={claim.id} view={agent} />}
      <ClaimReadings rows={rows} schema={schema} postedReadingId={claim.posted_reading_id} claimId={claim.id} review={review} agent={agent} />
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

/**
 * Whether a claim stays in the list under the agent filter.
 *
 * @param filter  ?agent: "open" (a call to answer), "changes" (an open call to split or merge), "differs" (a call that differs from Anton's mark), or absent.
 * @param view  The claim's agent view, if any.
 * @returns True when the claim is shown.
 */
function agentKept(filter: string | string[] | undefined, view: ClaimAgentView | undefined): boolean {
  if (filter === "open") return Boolean(view && view.open > 0);
  if (filter === "changes") return Boolean(view && view.changes > 0);
  if (filter === "differs") return Boolean(view && view.disagrees > 0);
  return true;
}

/**
 * The line that says agent calls are loaded, with links that keep only the claims that need an answer.
 *
 * @param props.params  The filters from the address.
 * @param props.views  The agent views of the claims shown.
 * @returns The line.
 */
function AgentFilterLine({ params, views }: { params: Params; views: Map<string, ClaimAgentView> }) {
  const open = [...views.values()].filter((view) => view.open > 0).length;
  const differs = [...views.values()].filter((view) => view.disagrees > 0).length;
  const changes = [...views.values()].filter((view) => view.changes > 0).length;
  const link = (agent: string | null) => {
    const kept = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (key === "agent" || value === undefined ? [] : [[key, String(value)]])));
    if (agent) kept.set("agent", agent);
    return `/?${kept}`;
  };
  return (
    <p className="small agent-filter">
      <span className="agent-tag">agent</span> calls are loaded (not your reviews; they never count as them): {open} claim{open === 1 ? "" : "s"} with calls to answer,{" "}
      {changes} where they propose a split or merge, {differs} with calls that differ from your marks. Show <Link href={link("changes")}>split or merge</Link> · <Link href={link("open")}>to answer</Link> ·{" "}
      <Link href={link("differs")}>differing</Link> ·{" "}
      <Link href={link(null)}>all</Link>
    </p>
  );
}
