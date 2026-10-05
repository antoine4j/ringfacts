import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyPeriods } from "./archive-digests.ts";

test("past weeks run back from the last scheduled moment until one holds the first article", () => {
  const periods = weeklyPeriods(new Date("2026-09-17T10:00:00Z"), new Date("2026-10-05T14:00:00Z"));
  assert.deepEqual(periods.map((period) => period.end.toISOString().slice(0, 10)), ["2026-09-21", "2026-09-28", "2026-10-05"]);
  assert.equal(periods[0].start.toISOString(), "2026-09-14T14:00:00.000Z");
});
