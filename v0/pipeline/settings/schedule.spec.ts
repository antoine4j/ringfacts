import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedInstant, lastScheduledAt, duePeriod } from "./schedule.ts";

const MONDAY_7AM_PACIFIC = { every: "week" as const, weekday: 1, time: "07:00", timezone: "America/Los_Angeles" };

test("07:00 Pacific is 14:00 UTC in summer and 15:00 UTC in winter", () => {
  assert.equal(zonedInstant({ year: 2026, month: 10, day: 5, hour: 7, minute: 0 }, "America/Los_Angeles").toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(zonedInstant({ year: 2026, month: 12, day: 7, hour: 7, minute: 0 }, "America/Los_Angeles").toISOString(), "2026-12-07T15:00:00.000Z");
});

test("the last scheduled moment is this Monday once it has passed, else last Monday", () => {
  // Monday 5 October 2026, 08:00 Pacific, then 06:00 Pacific.
  assert.equal(lastScheduledAt(MONDAY_7AM_PACIFIC, new Date("2026-10-05T15:00:00Z")).toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(lastScheduledAt(MONDAY_7AM_PACIFIC, new Date("2026-10-05T13:00:00Z")).toISOString(), "2026-09-28T14:00:00.000Z");
});

test("the week the clocks change still lands on 07:00 local time", () => {
  // Daylight saving ends on Sunday 1 November 2026; Monday 2 November 07:00 PST is 15:00 UTC.
  assert.equal(lastScheduledAt(MONDAY_7AM_PACIFIC, new Date("2026-11-03T00:00:00Z")).toISOString(), "2026-11-02T15:00:00.000Z");
});

test("a digest is due once per scheduled moment, covering from the last one to now", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  const previousEnd = new Date("2026-09-28T14:05:00Z");
  assert.deepEqual(duePeriod(MONDAY_7AM_PACIFIC, previousEnd, now), { start: previousEnd, end: now });
  assert.equal(duePeriod(MONDAY_7AM_PACIFIC, new Date("2026-10-05T14:10:00Z"), now), null);
});

test("a fighter's first digest covers the week before its scheduled moment", () => {
  const due = duePeriod(MONDAY_7AM_PACIFIC, null, new Date("2026-10-05T15:00:00Z"));
  assert.equal(due?.start.toISOString(), "2026-09-28T14:00:00.000Z");
});
