import { test } from "node:test";
import assert from "node:assert/strict";
import { countWithShare, dayAndClock, dollars, failures, intervalWords, pacificDay, pacificTime, percent, sharePercent, shortTime } from "./format.ts";

test("times are shown in Pacific time", () => {
  assert.equal(pacificTime("2026-10-05T05:05:07Z"), "2026-10-04 10:05 PM");
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

test("times are on a 12-hour clock, with midnight and noon as 12", () => {
  assert.equal(pacificTime("2026-10-05T07:00:00Z"), "2026-10-05 12:00 AM");
  assert.equal(pacificTime("2026-10-05T19:00:00Z"), "2026-10-05 12:00 PM");
  assert.equal(pacificTime("2026-10-05T16:09:00Z"), "2026-10-05 9:09 AM");
});

test("a short time is day, month and time in Pacific", () => {
  assert.equal(shortTime("2026-09-30T01:00:00Z"), "29 Sep 6:00 PM");
  assert.equal(shortTime(null), "");
});

test("a share shows one decimal under 10% and whole numbers from there up", () => {
  assert.equal(sharePercent(2 / 57), "3.5%");
  assert.equal(sharePercent(0), "0%");
  assert.equal(sharePercent(95 / 155), "61%");
  assert.equal(sharePercent(1), "100%");
});

test("a count carries its share, except out of nothing", () => {
  assert.equal(countWithShare(2, 57), "2 of 57 (3.5%)");
  assert.equal(countWithShare(0, 0), "0 of 0");
});

test("an interval reads as a range, and none as nothing", () => {
  assert.equal(intervalWords({ low: 0.0097, high: 0.1192 }), "95% range 1.0%–12%");
  assert.equal(intervalWords(null), "");
});

test("a reading's time splits into a short day and a clock, for two lines", () => {
  assert.deepEqual(dayAndClock("2026-10-05T18:50:00Z"), ["5 Oct", "11:50 AM"]);
  assert.deepEqual(dayAndClock(null), ["", ""]);
});
