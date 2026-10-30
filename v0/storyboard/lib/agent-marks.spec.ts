import { test } from "node:test";
import assert from "node:assert/strict";
import { agentViews, answersInForce, answersPath, readingCallKey, sameCallKey, type AgentFile, type AgentReadingCall } from "./agent-marks.ts";
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
