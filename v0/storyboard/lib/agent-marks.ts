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

/** One judge's reading call, as the three-judge file has it. */
export type JudgeReadingCall = { judge: string; verdict: "belongs" | "does_not_belong" | "own_claim"; belongs_in_claim_id: string | null; why: string; confidence: AgentConfidence };

/** One judge's same-claim call. */
export type JudgeSameCall = { judge: string; why: string; confidence: AgentConfidence };

/** How far the judges agreed on one reading: all of them, most of them, or no majority. */
export type Agreement = "unanimous" | "majority" | "split";

/** What the three judges said about one reading. */
export type ReadingPanel = { agreement: Agreement; judges: number; agreeing: number; calls: JudgeReadingCall[]; proposes_change: boolean };

/** What the judges said about one same-claim pair; `calls` holds only the judges who made the call, `judges` is how many judged in all (the file's own `judges` on a pair is how many made it). */
export type SamePanel = { agreement: string; judges: number; calls: JudgeSameCall[] };

/**
 * An agent's call on one reading in one claim. From a three-judge file it is
 * the majority call, or verdict "split" when there is no majority (such a call
 * cannot be confirmed), with the judges in `panel`.
 */
export type AgentReadingCall = {
  claim_id: string;
  reading_id: string;
  verdict: "belongs" | "does_not_belong" | "own_claim" | "split";
  belongs_in_claim_id: string | null;
  why: string;
  confidence: AgentConfidence;
  panel?: ReadingPanel;
};

/** An agent's call that two claims are one claim. */
export type AgentSameCall = { claim_id: string; other_claim_id: string; why: string; confidence: AgentConfidence; panel?: SamePanel };

/** The agents' calls file, one judge's or (normalized) three judges'. */
export type AgentFile = { week: string; made_by: string; readings: AgentReadingCall[]; same_claims: AgentSameCall[]; judges?: string[] };

/** Anton's answer to one call; the newest for a call is in force, and "cleared" undoes it. */
export type AgentAnswer = { at: string; call: string; answer: "confirmed" | "denied" | "cleared" };

/** Where a call stands: waiting for Anton, answered by him, or already matching his own mark. */
export type CallState = "open" | "confirmed" | "denied" | "agrees";

/** A reading call as a page shows it. */
export type ReadingCallView = AgentReadingCall & { key: string; state: CallState; disagrees: boolean };

/** A same-claim call as a claim shows it: the other claim, from this claim's side. */
export type SameCallView = { key: string; other_claim_id: string; why: string; confidence: AgentConfidence; state: CallState; linked: boolean; panel?: SamePanel };

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
    const disagrees = Boolean(mark) && call.verdict !== "split" && !markMatches(call, mark!);
    const state: CallState = answers.get(key) ?? (mark && !disagrees ? "agrees" : "open");
    const view = viewOf(call.claim_id);
    view.readings[call.reading_id] = { ...call, key, state, disagrees };
    if (state === "open") view.open++;
    if (state === "open" && call.verdict !== "belongs" && call.verdict !== "split") view.changes++;
    if (disagrees) view.disagrees++;
  }

  // Same-claim calls, shown on both claims.
  for (const call of file.same_claims) {
    const key = sameCallKey(call.claim_id, call.other_claim_id);
    const linked = links.has(pairOrder(call.claim_id, call.other_claim_id).join(":"));
    const state: CallState = answers.get(key) ?? (linked ? "agrees" : "open");
    for (const [here, other] of [[call.claim_id, call.other_claim_id], [call.other_claim_id, call.claim_id]]) {
      const view = viewOf(here);
      view.same.push({ key, other_claim_id: other, why: call.why, confidence: call.confidence, state, linked, panel: call.panel });
      if (state === "open") {
        view.open++;
        view.changes++;
      }
    }
  }
  return views;
}

/** The three-judge file as written by build-marks.mjs; only what the storyboard reads. */
type JudgesFile = {
  made_by: string;
  weeks?: string[];
  judges: string[];
  readings: { claim_id: string; reading_id: string; calls: Record<string, Omit<JudgeReadingCall, "judge">>; judges: number; agreement: Agreement; majority: { verdict: JudgeReadingCall["verdict"]; belongs_in_claim_id: string | null } | null; proposes_change: boolean }[];
  same_claims: { claim_id: string; other_claim_id: string; calls: Record<string, Omit<JudgeSameCall, "judge">>; judges: number; agreement: string }[];
};

/**
 * Whether a calls file is the three-judge shape: a list of judges, and every reading carrying the judges' calls.
 *
 * @param raw  The parsed calls file.
 * @returns True for the three-judge shape.
 */
function isJudgesFile(raw: AgentFile | JudgesFile): raw is JudgesFile {
  return Array.isArray((raw as JudgesFile).judges) && raw.readings.every((reading) => "calls" in reading);
}

/**
 * Reads either file shape into the one the storyboard uses. A file with a
 * `judges` key is the three-judge shape: each reading becomes its majority
 * call (or a "split" call) with the judges' calls in `panel`, each same-claim
 * pair becomes one call with the judges who made it. Anything else is the
 * old single-judge shape and is returned as it is.
 *
 * @param raw  The parsed calls file.
 * @returns The calls in the storyboard's shape.
 */
export function normalizeAgentFile(raw: AgentFile | JudgesFile): AgentFile {
  if (!isJudgesFile(raw)) return raw;
  const judges = raw.judges;
  const order = (calls: Record<string, unknown>) => judges.filter((judge) => judge in calls);
  const readings: AgentReadingCall[] = raw.readings.map((reading) => {
    const calls: JudgeReadingCall[] = order(reading.calls).map((judge) => ({ ...reading.calls[judge], judge }));
    const majority = reading.majority;
    const agreeing = majority ? calls.filter((call) => call.verdict === majority.verdict && (call.belongs_in_claim_id ?? null) === (majority.belongs_in_claim_id ?? null)).length : 0;
    const panel: ReadingPanel = { agreement: reading.agreement, judges: reading.judges, agreeing, calls, proposes_change: reading.proposes_change };
    // The majority call speaks in the words of a judge who made it.
    const speaker = majority ? calls.find((call) => call.verdict === majority.verdict && (call.belongs_in_claim_id ?? null) === (majority.belongs_in_claim_id ?? null)) : undefined;
    return {
      claim_id: reading.claim_id,
      reading_id: reading.reading_id,
      verdict: majority ? majority.verdict : "split",
      belongs_in_claim_id: majority ? (majority.belongs_in_claim_id ?? null) : null,
      why: speaker?.why ?? "The judges split; there is no majority call.",
      confidence: speaker?.confidence ?? "low",
      panel,
    };
  });
  const same_claims: AgentSameCall[] = raw.same_claims.map((pair) => {
    const calls: JudgeSameCall[] = order(pair.calls).map((judge) => ({ ...pair.calls[judge], judge }));
    return { claim_id: pair.claim_id, other_claim_id: pair.other_claim_id, why: calls[0]?.why ?? "", confidence: calls[0]?.confidence ?? "low", panel: { agreement: pair.agreement, judges: judges.length, calls } };
  });
  return { week: (raw.weeks ?? []).join(", "), made_by: raw.made_by, readings, same_claims, judges };
}

/**
 * The badge on a reading call: "3/3", "2/3" or "split"; nothing for a single-judge call.
 *
 * @param call  The reading call.
 * @returns The badge text, or null.
 */
export function agreementBadge(call: Pick<AgentReadingCall, "panel">): string | null {
  const panel = call.panel;
  if (!panel) return null;
  if (panel.agreement === "split") return "split";
  return `${panel.agreeing}/${panel.judges}`;
}

/**
 * The badge on a same-claim call: how many of the judges made it.
 *
 * @param call  The same-claim call.
 * @returns "2/3", or null for a single-judge call.
 */
export function sameBadge(call: Pick<SamePanel, "calls" | "judges">): string {
  return `${call.calls.length}/${call.judges}`;
}

/** The size of the spot-check sample. */
export const SPOT_SIZE = 40;

/**
 * A fixed random sample of the unanimous reading calls that propose a change.
 * The calls are put in key order first so the file's order does not matter,
 * then shuffled with a generator seeded from `made_by`: the same file always
 * gives the same sample.
 *
 * @param file  The (normalized) calls file.
 * @param size  The sample size.
 * @returns Up to `size` calls.
 */
export function spotSample(file: AgentFile, size: number = SPOT_SIZE): AgentReadingCall[] {
  const pool = file.readings
    .filter((call) => call.panel?.agreement === "unanimous" && (call.verdict === "own_claim" || call.verdict === "does_not_belong"))
    .sort((a, b) => readingCallKey(a.claim_id, a.reading_id).localeCompare(readingCallKey(b.claim_id, b.reading_id)));
  const random = seeded(file.made_by);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

/**
 * The calls the disputed view shows: readings the judges did not all agree
 * on (split first, then majority), and same-claim pairs not all judges made.
 *
 * @param file  The (normalized) calls file.
 * @returns The disputed readings and same-claim pairs.
 */
export function disputedCalls(file: AgentFile): { readings: AgentReadingCall[]; same: AgentSameCall[] } {
  const rank = (call: AgentReadingCall) => (call.panel?.agreement === "split" ? 0 : 1);
  const readings = file.readings
    .filter((call) => call.panel && call.panel.agreement !== "unanimous")
    .sort((a, b) => rank(a) - rank(b) || readingCallKey(a.claim_id, a.reading_id).localeCompare(readingCallKey(b.claim_id, b.reading_id)));
  const same = file.same_claims.filter((call) => call.panel && call.panel.calls.length < call.panel.judges);
  return { readings, same };
}

/** A small seeded generator (mulberry32) from a string seed (FNV-1a). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  const file = normalizeAgentFile(JSON.parse(readFileSync(path, "utf8")) as AgentFile | JudgesFile);

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
