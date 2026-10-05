import { test } from "node:test";
import assert from "node:assert/strict";
import { dollars, failures, pacificDay, pacificTime, percent, shortTime } from "./format.ts";

test("times are shown in Pacific time", () => {
  assert.equal(pacificTime("2026-10-05T05:05:07Z"), "2026-10-04 22:05");
  assert.equal(pacificDay("2026-10-05T05:05:07Z"), "2026-10-04");
  assert.equal(pacificTime(null), "");
});

test("costs in millionths of a dollar show as dollars", () => {
  assert.equal(dollars(737), "$0.0007");
  assert.equal(dollars(undefined), "");
});

test("failures collect flat and nested counts, non-zero only", () => {
  assert.deepEqual(failures({ classify_failed: 3, group_failed: 0, readings_stuck: 1, failed: { extract: 2 }, imported: 5 }), {
    classify_failed: 3,
    readings_stuck: 1,
    extract_failed: 2,
  });
});

test("a confidence shows as a whole percentage", () => {
  assert.equal(percent(0.876), "88%");
  assert.equal(percent(null), "");
});

test("a short time is day, month and time in Pacific", () => {
  assert.equal(shortTime("2026-09-30T01:00:00Z"), "29 Sep 18:00");
  assert.equal(shortTime(null), "");
});
