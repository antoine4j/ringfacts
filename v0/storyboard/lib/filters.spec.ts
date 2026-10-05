import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFilters, claimFilter, linkWith, readingFilter, whereSql } from "./filters.ts";

test("no filters give no WHERE clause", () => {
  assert.equal(whereSql(readingFilter({})), "");
});

test("every value travels as a parameter, numbered in order", () => {
  const filter = readingFilter({ fighter: "Ilia Topuria", tier: "1", fact: "next_fight", firmness: "rumour" });
  assert.equal(
    whereSql(filter),
    "WHERE rn.fighter = $1 AND rn.tier = $2 AND rn.classification ->> $3 = $4 AND rn.classification ->> $5 = $6",
  );
  assert.deepEqual(filter.values, ["Ilia Topuria", 1, "fact", "next_fight", "firmness", "rumour"]);
});

test("an answer name that is not a plain word never becomes a filter", () => {
  assert.deepEqual(answerFilters({ "fact; DROP TABLE x": "1", Fact: "x", fact: "result" }), [["fact", "result"]]);
});

test("unknown tiers, stages and malformed days are ignored", () => {
  assert.equal(whereSql(readingFilter({ tier: "9", stage: "deleted", day: "yesterday" })), "");
});

test("waiting means any stage before done", () => {
  const filter = readingFilter({ stage: "waiting" });
  assert.equal(whereSql(filter), "WHERE rn.stage = ANY($1)");
  assert.deepEqual(filter.values, [["classify", "extract", "group", "decide"]]);
});

test("a claim matches reading filters through any of its readings, numbering after its own", () => {
  const filter = claimFilter({ fighter: "Ilia Topuria", posted: "no", outlet: "ESPN", tier: "2" });
  assert.equal(
    whereSql(filter),
    "WHERE cn.fighter = $1 AND cn.posted_reading_id IS NULL AND EXISTS (SELECT 1 FROM groupings g JOIN reading_now m ON m.reading_id = g.reading_id WHERE g.claim_id = cn.id AND m.outlet = $2 AND m.tier = $3)",
  );
  assert.deepEqual(filter.values, ["Ilia Topuria", "ESPN", 2]);
});

test("a link keeps the other filters and drops an emptied one", () => {
  assert.equal(linkWith("/readings", { fighter: "A B", tier: "1" }, { tier: "", stage: "stuck" }), "/readings?fighter=A+B&stage=stuck");
});
