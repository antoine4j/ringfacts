import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineAndHistory, parseCount, parseResult, readResultFile, replayResults, resultFiles } from "./replay-results.ts";

test("the stored result files are found, oldest first", () => {
  const files = resultFiles();
  assert.ok(files.includes("2026-10-05T1013-latest-on-tie.json"));
  assert.ok(files.includes("2026-10-05T1019-earliest-on-tie.json"));
  assert.deepEqual(files, [...files].sort());
});

test("the 5 Oct 10:19 run is the headline, with its versions and its scores", () => {
  const { headline, history } = headlineAndHistory(replayResults());
  assert.equal(headline?.name, "2026-10-05T1019-earliest-on-tie.json");
  assert.equal(headline?.runDate, "2026-10-05");
  assert.deepEqual(headline?.versions, { classifier: "v7.7", extractor: "p4", grouping: "g1", settings: "1" });
  assert.deepEqual(headline?.sides.training.allNineRight, { count: 95, of: 155 });
  assert.deepEqual(headline?.sides.training.g1Recognised, { count: 8, of: 9 });
  assert.deepEqual(headline?.sides.validation.g2FalseAlarms, { count: 2, of: 38 });
  assert.equal(headline?.sides.validation.pairPrecision, 0.933);
  assert.equal(history[0].name, "2026-10-05T1013-latest-on-tie.json");
});

test("a file written before versions were recorded has none, and no pair counts", () => {
  const older = parseResult("2026-10-05T1013-latest-on-tie.json", readResultFile("2026-10-05T1013-latest-on-tie.json"));
  assert.equal(older.versions, null);
  assert.equal(older.sides.training.pairs, null);
});

test("no test side means the test column is not yet run", () => {
  assert.equal(replayResults().every((result) => result.sides.test === null), true);
});

test("a count reads as two numbers, and anything else is refused", () => {
  assert.deepEqual(parseCount("8 of 9"), { count: 8, of: 9 });
  assert.throws(() => parseCount("8/9"));
});
