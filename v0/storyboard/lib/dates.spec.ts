import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRange, describeRange, periodRange } from "./dates.ts";

// Monday 5 October 2026, 11:00 in San Francisco.
const MONDAY = new Date("2026-10-05T18:00:00Z");
// Thursday 1 October 2026, 20:00 in San Francisco: already 2 October in UTC.
const THURSDAY_EVENING = new Date("2026-10-02T03:00:00Z");

test("the named periods, on a Monday", () => {
  assert.deepEqual(periodRange("today", MONDAY), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(periodRange("yesterday", MONDAY), { from: "2026-10-04", to: "2026-10-04" });
  assert.deepEqual(periodRange("this_week", MONDAY), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(periodRange("last_week", MONDAY), { from: "2026-09-28", to: "2026-10-04" });
  assert.deepEqual(periodRange("last_7", MONDAY), { from: "2026-09-29", to: "2026-10-05" });
  assert.deepEqual(periodRange("this_month", MONDAY), { from: "2026-10-01", to: "2026-10-05" });
  assert.deepEqual(periodRange("last_month", MONDAY), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(periodRange("last_30", MONDAY), { from: "2026-09-06", to: "2026-10-05" });
});

test("days are Pacific days, not UTC ones", () => {
  assert.deepEqual(periodRange("today", THURSDAY_EVENING), { from: "2026-10-01", to: "2026-10-01" });
  assert.deepEqual(periodRange("this_week", THURSDAY_EVENING), { from: "2026-09-28", to: "2026-10-01" });
  assert.deepEqual(periodRange("last_month", THURSDAY_EVENING), { from: "2026-09-01", to: "2026-09-30" });
});

test("a custom range keeps well-formed ends, and either may be open", () => {
  assert.deepEqual(dayRange("custom", "2026-09-01", "2026-09-10", "", MONDAY), { from: "2026-09-01", to: "2026-09-10" });
  assert.deepEqual(dayRange("custom", "2026-09-01", "", "", MONDAY), { from: "2026-09-01", to: null });
  assert.deepEqual(dayRange("custom", "yesterday", "", "", MONDAY), null);
});

test("the older single day still works, and nothing asked means no filter", () => {
  assert.deepEqual(dayRange("", "", "", "2026-10-01", MONDAY), { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(dayRange("", "", "", "", MONDAY), null);
  assert.equal(dayRange("next_year", "", "", "", MONDAY), null);
});

test("a range in words", () => {
  assert.equal(describeRange({ from: "2026-09-28", to: "2026-10-04" }), "28 Sep – 4 Oct");
  assert.equal(describeRange({ from: "2026-10-05", to: "2026-10-05" }), "5 Oct");
  assert.equal(describeRange({ from: "2026-09-01", to: null }), "from 1 Sep");
});
