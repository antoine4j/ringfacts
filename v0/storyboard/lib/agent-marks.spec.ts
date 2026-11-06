import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentViews, agreementBadge, answersInForce, answersPath, disputedCalls, normalizeAgentFile, readingCallKey, sameBadge, sameCallKey, spotSample, type AgentFile, type AgentReadingCall } from "./agent-marks.ts";
import { marksInForce, sameClaimGroups, type ReadingMark } from "./reviews.ts";

let nextId = 1;

/** A review_readings row of Anton's. */
function mark(claim: string, reading: string, verdict: ReadingMark["verdict"], belongsIn: string | null = null): ReadingMark {
  return { id: String(nextId++), claim_id: claim, reading_id: reading, verdict, belongs_in_claim_id: belongsIn, note: "" };
}

/** An agent's call on a reading. */
function call(claim: string, reading: string, verdict: AgentReadingCall["verdict"], belongsIn: string | null = null): AgentReadingCall {
  return { claim_id: claim, reading_id: reading, verdict, belongs_in_claim_id: belongsIn, why: "because", confidence: "high" };
}

const FILE: AgentFile = {
  week: "2026-09-28",
  made_by: "test",
  readings: [call("1", "10", "belongs"), call("1", "11", "does_not_belong", "2"), call("1", "12", "own_claim")],
  same_claims: [{ claim_id: "3", other_claim_id: "1", why: "one interview", confidence: "medium" }],
};

test("with no marks and no answers, every call is open and none differs", () => {
  const view = agentViews(FILE, new Map(), new Map(), new Set()).get("1")!;
  assert.equal(view.open, 4);
  assert.equal(view.changes, 3, "the two moves and the same-claim link; a belongs call is no change");
  assert.equal(view.disagrees, 0);
  assert.deepEqual(Object.values(view.readings).map((each) => each.state), ["open", "open", "open"]);
  assert.equal(view.same[0].other_claim_id, "3");
});

test("a call Anton's mark already says needs no answer; one his mark contradicts is a disagreement and stays open", () => {
  const marks = marksInForce([mark("1", "10", "belongs"), mark("1", "11", "belongs"), mark("1", "12", "does_not_belong", "5")]);
  const view = agentViews(FILE, new Map(), marks, new Set()).get("1")!;
  assert.equal(view.readings["10"].state, "agrees");
  assert.equal(view.readings["11"].state, "open");
  assert.equal(view.readings["11"].disagrees, true);
  assert.equal(view.readings["12"].disagrees, true, "own claim and belongs elsewhere are different calls");
  assert.equal(view.disagrees, 2);
});

test("the same claim in a different place is a disagreement", () => {
  const marks = marksInForce([mark("1", "11", "does_not_belong", "9")]);
  assert.equal(agentViews(FILE, new Map(), marks, new Set()).get("1")!.readings["11"].disagrees, true);
  const same = marksInForce([mark("1", "11", "does_not_belong", "2")]);
  assert.equal(agentViews(FILE, new Map(), same, new Set()).get("1")!.readings["11"].state, "agrees");
});

test("Anton's answer wins over his mark, the newest answer is in force, and cleared undoes it", () => {
  const key = readingCallKey("1", "11");
  const answers = answersInForce([
    { at: "1", call: key, answer: "confirmed" },
    { at: "2", call: key, answer: "denied" },
    { at: "3", call: readingCallKey("1", "12"), answer: "denied" },
    { at: "4", call: readingCallKey("1", "12"), answer: "cleared" },
  ]);
  const view = agentViews(FILE, answers, new Map(), new Set()).get("1")!;
  assert.equal(view.readings["11"].state, "denied");
  assert.equal(view.readings["12"].state, "open");
});

test("a same-claim call shows on both claims, under one key, and matches a link Anton made", () => {
  assert.equal(sameCallKey("3", "1"), sameCallKey("1", "3"));
  const links = sameClaimGroups([{ id: "1", claim_id: "1", other_claim_id: "3", verdict: "same_claim", note: "" }]).links;
  const views = agentViews(FILE, new Map(), new Map(), links);
  assert.equal(views.get("3")!.same[0].other_claim_id, "1");
  assert.equal(views.get("3")!.same[0].state, "agrees");
  assert.equal(views.get("3")!.open, 0);
});

test("the answers file sits beside the calls file", () => {
  assert.equal(answersPath("/x/agent-marks-2026-09-28.json"), "/x/agent-marks-2026-09-28.answers.jsonl");
});

// The invented three-judge sample (no article text).
const SAMPLE = JSON.parse(readFileSync(new URL("../../../research/experiments/2026-11-05-three-judges/storyboard-sample.json", import.meta.url), "utf8"));

test("a file with a judges key is read as majority calls with the judges beside them; the old shape is left as it is", () => {
  const file = normalizeAgentFile(SAMPLE);
  assert.deepEqual(file.judges, ["opus", "fable", "sonnet"]);
  const byReading = Object.fromEntries(file.readings.map((each) => [each.reading_id, each]));
  assert.equal(byReading["800001"].verdict, "belongs");
  assert.equal(byReading["800003"].verdict, "does_not_belong");
  assert.equal(byReading["800003"].belongs_in_claim_id, "900002");
  assert.equal(byReading["800004"].verdict, "split");
  assert.deepEqual(byReading["800003"].panel!.calls.map((each) => each.judge), ["opus", "fable", "sonnet"]);
  assert.equal(FILE, normalizeAgentFile(FILE), "the single-judge shape comes back untouched");
});

test("the badge says 3/3, 2/3 or split", () => {
  const byReading = Object.fromEntries(normalizeAgentFile(SAMPLE).readings.map((each) => [each.reading_id, each]));
  assert.equal(agreementBadge(byReading["800001"]), "3/3");
  assert.equal(agreementBadge(byReading["800003"]), "2/3");
  assert.equal(agreementBadge(byReading["800004"]), "split");
  assert.equal(agreementBadge(call("1", "10", "belongs")), null, "a single-judge call has no badge");
});

test("a same-claim call keeps the judges who made it", () => {
  const same = normalizeAgentFile(SAMPLE).same_claims[0];
  assert.deepEqual(same.panel!.calls.map((each) => each.judge), ["opus", "fable"]);
  assert.equal(sameBadge(same.panel!), "2/3");
  const view = agentViews(normalizeAgentFile(SAMPLE), new Map(), new Map(), new Set()).get("900002")!;
  assert.equal(view.same[0].panel!.calls.length, 2);
});

test("a split reading is not a change, does not count as a disagreement, and is not confirmed in bulk", () => {
  const file = normalizeAgentFile(SAMPLE);
  const marks = marksInForce([mark("900002", "800004", "belongs")]);
  const view = agentViews(file, new Map(), marks, new Set()).get("900002")!;
  assert.equal(view.readings["800004"].verdict, "split");
  assert.equal(view.readings["800004"].disagrees, false);
  assert.equal(view.changes, 1, "only the same-claim proposal");
});

test("disputed lists split readings first, then majority, and the pairs not all judges made", () => {
  const { readings, same } = disputedCalls(normalizeAgentFile(SAMPLE));
  assert.deepEqual(readings.map((each) => each.reading_id), ["800004", "800003"]);
  assert.equal(same.length, 1);
});

test("the spot sample is fixed by made_by, holds only unanimous change calls, and ignores the file's order", () => {
  const readings: AgentReadingCall[] = [];
  for (let i = 0; i < 100; i++) {
    const verdict = i % 3 === 0 ? "belongs" : i % 3 === 1 ? "own_claim" : "does_not_belong";
    const agreement = i % 5 === 0 ? "majority" : "unanimous";
    readings.push({ ...call("1", String(1000 + i), verdict), panel: { agreement, judges: 3, agreeing: 3, calls: [], proposes_change: verdict !== "belongs" } });
  }
  const file: AgentFile = { week: "w", made_by: "seed one", readings, same_claims: [] };
  const sample = spotSample(file);
  assert.equal(sample.length, 40);
  assert.ok(sample.every((each) => each.panel!.agreement === "unanimous" && each.verdict !== "belongs"));
  const ids = sample.map((each) => each.reading_id);
  assert.deepEqual(spotSample({ ...file, readings: [...readings].reverse() }).map((each) => each.reading_id), ids);
  assert.notDeepEqual(spotSample({ ...file, made_by: "seed two" }).map((each) => each.reading_id), ids);
  assert.equal(new Set(ids).size, 40);
});
