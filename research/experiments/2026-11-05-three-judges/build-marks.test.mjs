import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedCalls, joinCalls, said } from "./build-marks.mjs";

const week = {
  claims: [
    { id: "10", fighter: "A", readings: [{ reading_id: "1" }, { reading_id: "2" }] },
    { id: "11", fighter: "A", readings: [{ reading_id: "3" }] },
    { id: "20", fighter: "B", readings: [{ reading_id: "4" }] },
  ],
};

test("a call naming another fighter's claim loses the claim it names; a missing call is a problem", () => {
  const problems = [];
  const checked = checkedCalls(week, {
    claims: [{ claim_id: 10, core: "x" }],
    readings: [
      { claim_id: 10, reading_id: 1, verdict: "belongs", belongs_in_claim_id: null, why: "", rule: 0, confidence: "high" },
      { claim_id: 10, reading_id: 2, verdict: "does_not_belong", belongs_in_claim_id: 20, why: "", rule: 6, confidence: "high" },
      { claim_id: 11, reading_id: 3, verdict: "does_not_belong", belongs_in_claim_id: 10, why: "", rule: 6, confidence: "high" },
    ],
    same_claims: [{ claim_id: 10, other_claim_id: 20, why: "", rule: 1, confidence: "low" }],
  }, problems);
  assert.equal(checked.readings.length, 3);
  assert.equal(checked.readings[1].belongs_in_claim_id, null);
  assert.equal(checked.readings[2].belongs_in_claim_id, "10");
  assert.equal(checked.same_claims.length, 0);
  assert.deepEqual(checked.cores, { 10: "x" });
  assert.ok(problems.some((line) => line.includes("no call for 20:4")));
  assert.ok(problems.some((line) => line.includes("names #20")));
});

test("joined calls carry each judge, the agreement and the majority", () => {
  const call = (model, verdict, to = null) => ({ claim_id: "10", reading_id: "1", verdict, belongs_in_claim_id: to, why: model, rule: 0, confidence: "high" });
  const joined = joinCalls({
    opus: { readings: [call("opus", "belongs")], same_claims: [{ claim_id: "11", other_claim_id: "10", why: "", rule: 1, confidence: "high" }] },
    fable: { readings: [call("fable", "does_not_belong", "11")], same_claims: [{ claim_id: "10", other_claim_id: "11", why: "", rule: 1, confidence: "high" }] },
    sonnet: { readings: [call("sonnet", "belongs")], same_claims: [] },
  }, ["opus", "fable", "sonnet"]);
  assert.equal(joined.readings.length, 1);
  const [entry] = joined.readings;
  assert.equal(entry.agreement, "majority");
  assert.deepEqual(entry.majority, { verdict: "belongs", belongs_in_claim_id: null });
  assert.equal(entry.proposes_change, false);
  assert.equal(said(entry.calls.fable), "does_not_belong→11");
  assert.equal(joined.same_claims.length, 1);
  assert.equal(joined.same_claims[0].agreement, "majority");
  assert.deepEqual([joined.same_claims[0].claim_id, joined.same_claims[0].other_claim_id], ["10", "11"]);
});

test("a reading only two of three judges called is at most a majority, never unanimous", () => {
  const call = (verdict) => ({ claim_id: "10", reading_id: "1", verdict, belongs_in_claim_id: null, why: "", rule: 0, confidence: "high" });
  const joined = joinCalls({ a: { readings: [call("own_claim")] }, b: { readings: [call("own_claim")] }, c: { readings: [] } }, ["a", "b", "c"]);
  assert.equal(joined.readings[0].agreement, "majority");
  assert.equal(joined.readings[0].judges, 2);
  const one = joinCalls({ a: { readings: [call("own_claim")] }, b: { readings: [] }, c: { readings: [] } }, ["a", "b", "c"]);
  assert.equal(one.readings[0].agreement, "split");
  assert.equal(one.readings[0].majority, null);
});

test("three different calls are a split with no majority", () => {
  const call = (verdict, to) => ({ claim_id: "10", reading_id: "1", verdict, belongs_in_claim_id: to, why: "", rule: 0, confidence: "low" });
  const joined = joinCalls({ a: { readings: [call("belongs", null)] }, b: { readings: [call("own_claim", null)] }, c: { readings: [call("does_not_belong", "11")] } }, ["a", "b", "c"]);
  assert.equal(joined.readings[0].agreement, "split");
  assert.equal(joined.readings[0].majority, null);
});
