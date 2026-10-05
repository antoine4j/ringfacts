import { test } from "node:test";
import assert from "node:assert/strict";
import { startingSchedule, startingTierMap, type Settings } from "../../pipeline/settings/tiers.ts";
import { allCombinations, checkCells, checkSchedule, movesBetween, withCells } from "./tier-draft.ts";

const CURRENT: Settings = { version: 1, classifier_version: "v7.7", tiers: startingTierMap(), digest_schedule: startingSchedule(["A"]) };

test("moving a cell from Digest to Post moves its readings, and only those", () => {
  const draft = withCells(CURRENT, { "next_fight · rumour": 1 });
  const groups = [
    { answers: { centrality: "main_subject", fact: "next_fight", firmness: "rumour" }, readings: 12 },
    { answers: { centrality: "only_mentioned", fact: "next_fight", firmness: "rumour" }, readings: 5 },
    { answers: { centrality: "main_subject", fact: "health", firmness: "reported" }, readings: 4 },
  ];
  assert.deepEqual(movesBetween(groups, CURRENT, draft), [{ from: 2, to: 1, readings: 12 }]);
});

test("withCells leaves the original settings untouched", () => {
  withCells(CURRENT, { "result · official_or_done": 3 });
  assert.equal(CURRENT.tiers.cells["result · official_or_done"], 1);
});

test("a complete draft passes; a missing, unknown or bad cell does not", () => {
  const cells = startingTierMap().cells;
  assert.equal(Object.keys(checkCells(cells)).length, allCombinations().length);
  const { ["result · none"]: _missing, ...withoutOne } = cells;
  assert.throws(() => checkCells(withoutOne), /has no tier/);
  assert.throws(() => checkCells({ ...cells, "made_up · none": 1 }), /unknown combination/);
  assert.throws(() => checkCells({ ...cells, "result · none": 4 }), /not 1, 2 or 3/);
});

test("a schedule needs a weekday, a time and a real time zone for every fighter", () => {
  const good = { A: { weekday: 1, time: "07:00", timezone: "America/Los_Angeles" } };
  assert.deepEqual(checkSchedule(good, ["A"]), { A: { every: "week", weekday: 1, time: "07:00", timezone: "America/Los_Angeles" } });
  assert.throws(() => checkSchedule(good, ["A", "B"]), /B has no digest schedule/);
  assert.throws(() => checkSchedule({ A: { ...good.A, weekday: 7 } }, ["A"]), /weekday/);
  assert.throws(() => checkSchedule({ A: { ...good.A, time: "7am" } }, ["A"]), /time/);
  assert.throws(() => checkSchedule({ A: { ...good.A, timezone: "Mars/Olympus" } }, ["A"]), /not a time zone/);
});
