import { test } from "node:test";
import assert from "node:assert/strict";
import { reportMoment, monthForecast, dailyMessage, MONTHLY_CPU_BUDGET } from "./daily-counts.ts";

const DAY = { fighter: "Marko Testov", readings: 9, noBody: 2, classified: 7, newClaims: 3, joins: 4, tier1: 1, tier2: 5, tier3: 1, posted: 1, waiting: 0, stuck: 0 };
const TOTALS = { runs: 24, imported: 9, failures: 0, dollars: 0.0123 };

test("the report moment is 07:00 Pacific on the Pacific date", () => {
  assert.deepEqual(reportMoment(new Date("2026-10-06T06:00:00Z")), { at: new Date("2026-10-05T14:00:00Z"), day: "2026-10-05" });
});

test("the month's forecast scales the seconds so far to the whole month", () => {
  // Half of October gone (15.5 of 31 days), 40,000 seconds used: heading for 80,000.
  assert.equal(monthForecast(40_000, new Date("2026-10-16T12:00:00Z")), 80_000);
});

test("the budget warning leads the message only when the forecast passes the budget", () => {
  const under = dailyMessage("2026-10-05", [DAY], TOTALS, { soFar: 1000, forecast: MONTHLY_CPU_BUDGET - 1 });
  const over = dailyMessage("2026-10-05", [DAY], TOTALS, { soFar: 1000, forecast: MONTHLY_CPU_BUDGET + 1 });
  assert.doesNotMatch(under, /⚠️/);
  assert.match(over.split("\n")[0], /^⚠️ Cloud Run/);
});

test("each fighter's line carries his tiers and posts", () => {
  assert.match(dailyMessage("2026-10-05", [DAY], TOTALS, { soFar: 0, forecast: 0 }), /tier 1: 1, tier 2: 5, tier 3: 1 · posted 1/);
});
