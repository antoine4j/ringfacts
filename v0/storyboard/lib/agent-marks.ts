// Agents' grouping calls, shown beside Anton's marks and never counted as
// them. An agent's call is the same kind of mark Anton makes (a reading
// belongs, does not belong and where, is its own claim; two claims are one),
// with a sentence saying why. The calls come from a local file named by
// AGENT_MARKS_FILE; Anton's answer to each call (confirmed, denied, or the
// answer cleared) is appended to a file beside it. Neither file is the
// database: unset the variable and the storyboard is as it was. Confirming a
// call also saves it as Anton's own mark (agent-actions.ts), which is the only
// way an agent's call reaches review_readings or review_same_claims.
// Machinery and week: research/experiments/2026-10-30-agent-grouping/README.md.

import { readFileSync } from "node:fs";
import { markKey, pairOrder, type ReadingMark } from "./reviews.ts";

/** How sure the agent was. */
export type AgentConfidence = "high" | "medium" | "low";

/** An agent's call on one reading in one claim. */
export type AgentReadingCall = {
  claim_id: string;
  reading_id: string;
  verdict: "belongs" | "does_not_belong" | "own_claim";
  belongs_in_claim_id: string | null;
  why: string;
  confidence: AgentConfidence;
};

/** An agent's call that two claims are one claim. */
export type AgentSameCall = { claim_id: string; other_claim_id: string; why: string; confidence: AgentConfidence };

/** The agents' calls file. */
export type AgentFile = { week: string; made_by: string; readings: AgentReadingCall[]; same_claims: AgentSameCall[] };

/** Anton's answer to one call; the newest for a call is in force, and "cleared" undoes it. */
export type AgentAnswer = { at: string; call: string; answer: "confirmed" | "denied" | "cleared" };

/** Where a call stands: waiting for Anton, answered by him, or already matching his own mark. */
export type CallState = "open" | "confirmed" | "denied" | "agrees";

/** A reading call as a page shows it. */
export type ReadingCallView = AgentReadingCall & { key: string; state: CallState; disagrees: boolean };

/** A same-claim call as a claim shows it: the other claim, from this claim's side. */
export type SameCallView = { key: string; other_claim_id: string; why: string; confidence: AgentConfidence; state: CallState; linked: boolean };

/** Everything a claim shows about the agents' calls on it: the calls, and how many are open, differ from Anton's marks, and are open proposals to split or merge. */
export type ClaimAgentView = { readings: Record<string, ReadingCallView>; same: SameCallView[]; open: number; disagrees: number; changes: number };

/**
 * The key of a reading call.
 *
 * @param claimId  The claim.
 * @param readingId  The reading.
 * @returns "reading:claim:reading".
 */
export function readingCallKey(claimId: string, readingId: string): string {
  return `reading:${markKey(claimId, readingId)}`;
}

/**
 * The key of a same-claim call, the same from either claim.
 *
 * @param one  A claim.
 * @param other  The other claim.
 * @returns "same:smaller:larger".
 */
export function sameCallKey(one: string, other: string): string {
  return `same:${pairOrder(one, other).join(":")}`;
}

/**
 * Anton's answer in force on each call: the newest, unless it was "cleared".
 *
 * @param answers  The answers file's lines, oldest first.
 * @returns Call key → "confirmed" or "denied".
 */
export function answersInForce(answers: AgentAnswer[]): Map<string, "confirmed" | "denied"> {
  const newest = new Map<string, AgentAnswer["answer"]>();
  for (const answer of answers) newest.set(answer.call, answer.answer);
  const inForce = new Map<string, "confirmed" | "denied">();
  for (const [call, answer] of newest) if (answer !== "cleared") inForce.set(call, answer);
  return inForce;
}

/**
 * Whether Anton's mark in force says the same as an agent's call.
 *
 * @param call  The agent's call.
 * @param mark  Anton's mark in force on that reading in that claim.
 * @returns True when the verdict, and the claim it names, are the same.
 */
export function markMatches(call: AgentReadingCall, mark: ReadingMark): boolean {
  return mark.verdict === call.verdict && (mark.belongs_in_claim_id ?? null) === (call.belongs_in_claim_id ?? null);
}

/**
 * What each claim shows about the agents' calls: each call's state, and
 * whether it disagrees with Anton's own mark. A call that Anton's mark
 * already matches needs no answer; one that differs from his mark is a
 * disagreement, and stays open until he answers it.
 *
 * @param file  The agents' calls.
 * @param answers  Anton's answers in force, from answersInForce.
 * @param antonMarks  Anton's marks in force, from marksInForce.
 * @param links  Anton's same-claim links in force ("a:b", smaller first), from sameClaimGroups.
 * @returns Claim → its view; claims with no call are absent.
 */
export function agentViews(file: AgentFile, answers: Map<string, "confirmed" | "denied">, antonMarks: Map<string, ReadingMark>, links: Set<string>): Map<string, ClaimAgentView> {
  const views = new Map<string, ClaimAgentView>();
  const viewOf = (claimId: string) => views.get(claimId) ?? views.set(claimId, { readings: {}, same: [], open: 0, disagrees: 0, changes: 0 }).get(claimId)!;

  // Reading calls: Anton's answer first, then his own mark.
  for (const call of file.readings) {
    const key = readingCallKey(call.claim_id, call.reading_id);
    const mark = antonMarks.get(markKey(call.claim_id, call.reading_id));
    const disagrees = Boolean(mark) && !markMatches(call, mark!);
    const state: CallState = answers.get(key) ?? (mark && !disagrees ? "agrees" : "open");
    const view = viewOf(call.claim_id);
    view.readings[call.reading_id] = { ...call, key, state, disagrees };
    if (state === "open") view.open++;
    if (state === "open" && call.verdict !== "belongs") view.changes++;
    if (disagrees) view.disagrees++;
  }

  // Same-claim calls, shown on both claims.
  for (const call of file.same_claims) {
    const key = sameCallKey(call.claim_id, call.other_claim_id);
    const linked = links.has(pairOrder(call.claim_id, call.other_claim_id).join(":"));
    const state: CallState = answers.get(key) ?? (linked ? "agrees" : "open");
    for (const [here, other] of [[call.claim_id, call.other_claim_id], [call.other_claim_id, call.claim_id]]) {
      const view = viewOf(here);
      view.same.push({ key, other_claim_id: other, why: call.why, confidence: call.confidence, state, linked });
      if (state === "open") {
        view.open++;
        view.changes++;
      }
    }
  }
  return views;
}

/**
 * The agents' calls and Anton's answers, read from the local files, or
 * nothing when AGENT_MARKS_FILE is not set.
 *
 * @returns The calls and the answers (oldest first), or null.
 */
export function loadAgentMarks(): { file: AgentFile; answers: AgentAnswer[] } | null {
  const path = process.env.AGENT_MARKS_FILE;
  if (!path) return null;
  const file = JSON.parse(readFileSync(path, "utf8")) as AgentFile;

  // The answers file does not exist until the first answer.
  let lines: string[] = [];
  try {
    lines = readFileSync(answersPath(path), "utf8").split("\n").filter(Boolean);
  } catch {
    lines = [];
  }
  return { file, answers: lines.map((line) => JSON.parse(line) as AgentAnswer) };
}

/**
 * Where Anton's answers to the calls in a calls file are kept.
 *
 * @param callsPath  The calls file.
 * @returns The answers file beside it.
 */
export function answersPath(callsPath: string): string {
  return callsPath.replace(/\.json$/, "") + ".answers.jsonl";
}
