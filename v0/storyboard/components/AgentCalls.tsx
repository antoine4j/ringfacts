"use client";
// The agents' grouping calls (lib/agent-marks.ts), in violet so they never
// read as Anton's own marks: a line under a reading's headline, and on a
// claim the same-claim calls and a count. Each open call has confirm (saved
// as Anton's mark, app/agent-actions.ts) and deny; an answered call can be
// undone. Nothing here changes Anton's ✓ ✕, which stay the review.

import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentListing } from "../lib/queries.ts";
import { answerAgentCall, confirmAgentCalls } from "../app/agent-actions.ts";
import { agreementBadge, sameBadge, type AgentConfidence, type CallState, type ClaimAgentView, type ReadingCallView, type SamePanel, type SameCallView } from "../lib/agent-marks.ts";
import { useSave } from "./ReviewControls.tsx";

/**
 * The line under a reading's headline: what the agent says about it, why, and the answer buttons.
 *
 * @param props.call  The agent's call on this reading in this claim.
 * @returns The line.
 */
export function AgentReadingLine({ call }: { call: ReadingCallView }) {
  return (
    <AgentLine callKey={call.key} state={call.state} confidence={call.confidence} why={call.panel ? "" : call.why} differs={call.disagrees} canConfirm={call.verdict !== "split"} badge={agreementBadge(call)} panel={call.panel ? <JudgePanel calls={call.panel.calls} /> : null}>
      {call.verdict === "split" && "judges split: no majority call"}
      {call.verdict === "belongs" && "✓ belongs"}
      {call.verdict === "own_claim" && "✕ its own claim"}
      {call.verdict === "does_not_belong" &&
        (call.belongs_in_claim_id ? (
          <>
            ✕ belongs in <a href={`/claims/${call.belongs_in_claim_id}`}>#{call.belongs_in_claim_id}</a>
          </>
        ) : (
          "✕ doesn't belong"
        ))}
    </AgentLine>
  );
}

/**
 * The agents' calls on a claim as a whole: how many wait for an answer, how
 * many differ from Anton's marks, its same-claim calls, and one button that
 * confirms every open call on a reading he has not marked.
 *
 * @param props.claimId  The claim.
 * @param props.view  What the claim shows about the agents' calls.
 * @returns The bar.
 */
export function AgentClaimBar({ claimId, view }: { claimId: string; view: ClaimAgentView }) {
  const { run, saving, error } = useSave();
  const unmarkedOpen = Object.values(view.readings).filter((call) => call.state === "open" && !call.disagrees && call.verdict !== "split");
  return (
    <div className="agent-bar">
      <span className="agent-tag">agent</span>
      <span className="small">
        {view.open} to answer
        {view.disagrees > 0 && <span className="agent-differs"> · {view.disagrees} differ from your marks</span>}
      </span>
      {unmarkedOpen.length > 1 && (
        <button type="button" className="small" disabled={saving} title="Saves each of these calls as your own mark, as if confirmed one by one; calls that differ from a mark of yours are left for you" onClick={() => run(() => confirmAgentCalls({ claimId, calls: unmarkedOpen.map((call) => call.key) }))}>
          {saving ? "saving…" : `confirm the ${unmarkedOpen.length} calls on unmarked readings`}
        </button>
      )}
      {error && <span className="tag bad">{error}</span>}
      {view.same.map((call) => (
        <AgentSameLine key={call.key} call={call} />
      ))}
    </div>
  );
}

/**
 * The count on a folded claim's card, so a glance down the list finds the claims with calls to answer.
 *
 * @param props.view  The claim's agent view, if any.
 * @returns A violet pill, or nothing when no call is open.
 */
export function AgentCount({ view }: { view: ClaimAgentView | undefined }) {
  if (!view || view.open === 0) return null;
  const title = `${view.open} agent call${view.open === 1 ? "" : "s"} to answer${view.disagrees ? `; ${view.disagrees} differ from your marks` : ""}`;
  return (
    <span className="tag agent-tag help" title={title}>
      agent {view.open}
      {view.disagrees > 0 && " · ≠"}
    </span>
  );
}

/**
 * One same-claim call, from this claim's side.
 *
 * @param props.call  The call.
 * @returns The line.
 */
function AgentSameLine({ call }: { call: SameCallView }) {
  return (
    <AgentLine callKey={call.key} state={call.state} confidence={call.confidence} why={call.panel ? "" : call.why} differs={false} canConfirm badge={call.panel ? sameBadge(call.panel) : null} panel={call.panel ? <SameJudges panel={call.panel} /> : null}>
      same claim as <a href={`/claims/${call.other_claim_id}`}>#{call.other_claim_id}</a>
      {call.panel && <span className="agent-sure"> · made by {call.panel.calls.map((each) => each.judge).join(", ")}</span>}
    </AgentLine>
  );
}

/**
 * The shared shape of an agent call: what it says, how sure, why, and the answer buttons or the answer given.
 *
 * @param props.callKey  The call's key.
 * @param props.state  Where it stands.
 * @param props.confidence  How sure the agent was.
 * @param props.why  The agent's sentence.
 * @param props.differs  Anton's own mark says otherwise.
 * @param props.children  What the call says.
 * @returns The line.
 */
function AgentLine({ callKey, state, confidence, why, differs, canConfirm = true, badge = null, panel = null, children }: { callKey: string; state: CallState; confidence: AgentConfidence; why: string; differs: boolean; canConfirm?: boolean; badge?: string | null; panel?: ReactNode; children: ReactNode }) {
  const { run, saving, error } = useSave();
  const answer = (given: "confirmed" | "denied" | "cleared") => run(() => answerAgentCall({ call: callKey, answer: given }));
  return (
    <span className={`agent-line state-${state}`} title={state === "agrees" ? why : undefined}>
      <span className="agent-tag" title="An agent's call, not your review">
        agent
      </span>{" "}
      <span className="agent-says">{children}</span>
      {badge && <span className={`agent-badge${badge === "split" ? " split" : ""}`}> {badge}</span>}
      {!panel && <span className="agent-sure"> · {confidence}</span>}
      {differs && <span className="agent-differs"> · differs from your mark</span>}
      {state === "agrees" || !why ? null : <span className="agent-why"> · {why}</span>}{" "}
      {state === "open" && (
        <>
          <button type="button" className="agent-answer" disabled={saving || !canConfirm} title={canConfirm ? "Agree: saves this call as your own mark" : "The judges split, so there is no majority call to confirm; mark the reading yourself"} onClick={() => answer("confirmed")}>
            confirm
          </button>
          <button type="button" className="agent-answer" disabled={saving} title="Disagree: the call is set aside; mark the reading yourself" onClick={() => answer("denied")}>
            deny
          </button>
        </>
      )}
      {(state === "confirmed" || state === "denied") && (
        <>
          <span className="agent-answered">{state}</span>
          <button type="button" className="link-button small" disabled={saving} title="Clear your answer to this call (a mark it saved stays; change that with ✓ ✕)" onClick={() => answer("cleared")}>
            undo
          </button>
        </>
      )}
      {state === "agrees" && <span className="agent-answered">matches your mark</span>}
      {error && <span className="tag bad">{error}</span>}
      {panel}
    </span>
  );
}

/**
 * The judges' one-line reasons side by side, folded under the badge: judge, verdict, why, confidence.
 *
 * @param props.calls  Each judge's call.
 * @returns The folded table.
 */
export function JudgePanel({ calls }: { calls: { judge: string; verdict: string; belongs_in_claim_id: string | null; why: string; confidence: string }[] }) {
  return (
    <details className="agent-panel">
      <summary>the judges</summary>
      <div className="agent-judges">
        {calls.map((call) => (
          <div className="agent-judge" key={call.judge}>
            <b>{call.judge}</b>
            <span className="agent-says">{call.verdict === "does_not_belong" && call.belongs_in_claim_id ? `belongs in #${call.belongs_in_claim_id}` : call.verdict.replace(/_/g, " ")}</span>
            <span className="agent-why">{call.why}</span>
            <span className="agent-sure">{call.confidence}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * The judges who made a same-claim call, each with why.
 *
 * @param props.panel  The judges' same-claim calls.
 * @returns The folded table.
 */
function SameJudges({ panel }: { panel: SamePanel }) {
  return <JudgePanel calls={panel.calls.map((call) => ({ ...call, verdict: "same claim", belongs_in_claim_id: null }))} />;
}

/**
 * The flat page behind ?agent=disputed and ?agent=spot: each reading with its
 * outlet, headline and the judges' call, then (disputed) the same-claim pairs
 * not all judges made. The spot check counts how many of its sample Anton has
 * answered.
 *
 * @param props.listing  The readings and pairs to show.
 * @returns The page.
 */
export function AgentListingPage({ listing }: { listing: AgentListing }) {
  const title = listing.mode === "spot" ? "Spot check" : "Disputed";
  return (
    <>
      <h1>{title}</h1>
      <p className="small agent-filter">
        <span className="agent-tag">agent</span>{" "}
        {listing.mode === "spot"
          ? `A fixed random sample of ${listing.total} unanimous calls that propose a change (its own claim, or doesn't belong). Answered ${listing.answered} of ${listing.total}.`
          : `${listing.readings.length} reading${listing.readings.length === 1 ? "" : "s"} the judges did not all agree on (split first, then majority), and ${listing.same.length} same-claim pair${listing.same.length === 1 ? "" : "s"} not all of them made.`}{" "}
        <Link href="/">all claims</Link>
      </p>
      {listing.readings.map(({ call, row }) => (
        <div className="agent-list-item" key={call.key}>
          <div className="small muted">
            claim <a href={`/claims/${call.claim_id}`}>#{call.claim_id}</a> · reading #{call.reading_id}
            {row && (
              <>
                {" "}· {row.outlet} · <a href={row.url} target="_blank" rel="noreferrer">{row.headline}</a>
              </>
            )}
          </div>
          <AgentReadingLine call={call} />
        </div>
      ))}
      {listing.same.map(({ claim_id, call }) => (
        <div className="agent-list-item" key={call.key}>
          <div className="small muted">
            claims <a href={`/claims/${claim_id}`}>#{claim_id}</a> and <a href={`/claims/${call.other_claim_id}`}>#{call.other_claim_id}</a>
          </div>
          <AgentSameLine call={call} />
        </div>
      ))}
      {listing.readings.length === 0 && listing.same.length === 0 && <p className="muted">Nothing to show.</p>}
    </>
  );
}
