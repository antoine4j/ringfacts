"use client";
// The agents' grouping calls (lib/agent-marks.ts), in violet so they never
// read as Anton's own marks: a line under a reading's headline, and on a
// claim the same-claim calls and a count. Each open call has confirm (saved
// as Anton's mark, app/agent-actions.ts) and deny; an answered call can be
// undone. Nothing here changes Anton's ✓ ✕, which stay the review.

import type { ReactNode } from "react";
import { answerAgentCall, confirmAgentCalls } from "../app/agent-actions.ts";
import type { AgentConfidence, CallState, ClaimAgentView, ReadingCallView, SameCallView } from "../lib/agent-marks.ts";
import { useSave } from "./ReviewControls.tsx";

/**
 * The line under a reading's headline: what the agent says about it, why, and the answer buttons.
 *
 * @param props.call  The agent's call on this reading in this claim.
 * @returns The line.
 */
export function AgentReadingLine({ call }: { call: ReadingCallView }) {
  return (
    <AgentLine callKey={call.key} state={call.state} confidence={call.confidence} why={call.why} differs={call.disagrees}>
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
  const unmarkedOpen = Object.values(view.readings).filter((call) => call.state === "open" && !call.disagrees);
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
    <AgentLine callKey={call.key} state={call.state} confidence={call.confidence} why={call.why} differs={false}>
      same claim as <a href={`/claims/${call.other_claim_id}`}>#{call.other_claim_id}</a>
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
function AgentLine({ callKey, state, confidence, why, differs, children }: { callKey: string; state: CallState; confidence: AgentConfidence; why: string; differs: boolean; children: ReactNode }) {
  const { run, saving, error } = useSave();
  const answer = (given: "confirmed" | "denied" | "cleared") => run(() => answerAgentCall({ call: callKey, answer: given }));
  return (
    <span className={`agent-line state-${state}`} title={state === "agrees" ? why : undefined}>
      <span className="agent-tag" title="An agent's call, not your review">
        agent
      </span>{" "}
      <span className="agent-says">{children}</span>
      <span className="agent-sure"> · {confidence}</span>
      {differs && <span className="agent-differs"> · differs from your mark</span>}
      {state === "agrees" ? null : <span className="agent-why"> · {why}</span>}{" "}
      {state === "open" && (
        <>
          <button type="button" className="agent-answer" disabled={saving} title="Agree: saves this call as your own mark" onClick={() => answer("confirmed")}>
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
    </span>
  );
}
