// Covers store/counts.ts: the numbers behind the daily counts message. The SQL
// is not run here (the fake does not run SQL); these specs check the values
// sent to it (the period, the month's first moment) and how its rows become
// numbers: the joins, the dollars, the failed attempts, the month's seconds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fighterDays, runTotals, cpuSecondsThisMonth, dailyReport } from "./counts.ts";
import { FakeDatabase } from "../workflow/fake-database.ts";

const FROM = new Date("2026-10-05T14:00:00Z");
const TO = new Date("2026-10-06T14:00:00Z");

/**
 * A fighter's row as the counting query returns it.
 *
 * @param changes  The columns to set.
 * @returns The row.
 */
function fighterRow(changes: Record<string, unknown> = {}) {
  return {
    fighter: "Marko Testov", readings: 9, no_body: 2, classified: 7, new_claims: 3, groupings: 7,
    tier1: 1, tier2: 5, tier3: 1, posted: 1, waiting: 4, stuck: 1, ...changes,
  };
}

test("the period is sent as its start and its end, in that order", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [] }));
  await fighterDays(database.pool, FROM, TO);
  assert.deepEqual(database.queries[0].params, [FROM, TO]);
});

test("a fighter's row becomes his day, each column under its name", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [fighterRow()] }));
  const [day] = await fighterDays(database.pool, FROM, TO);
  assert.deepEqual(day, {
    fighter: "Marko Testov", readings: 9, noBody: 2, classified: 7, newClaims: 3, joins: 4,
    tier1: 1, tier2: 5, tier3: 1, posted: 1, waiting: 4, stuck: 1,
  });
});

test("joins are the groupings that did not start a claim", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [fighterRow({ groupings: 10, new_claims: 10 }), fighterRow({ fighter: "Ivan Rivalov", groupings: 12, new_claims: 5 })] }));
  const days = await fighterDays(database.pool, FROM, TO);
  assert.deepEqual(days.map((day) => [day.fighter, day.joins]), [["Marko Testov", 0], ["Ivan Rivalov", 7]]);
});

test("every counted window is half open, so the instant between two days is counted once", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [] }));
  await fighterDays(database.pool, FROM, TO);
  const sql = database.queries[0].sql;
  const starts = sql.match(/>= \$1/g)?.length ?? 0;
  const ends = sql.match(/< \$2/g)?.length ?? 0;
  assert.ok(starts > 0);
  assert.equal(ends, starts);
  assert.doesNotMatch(sql, /<= \$2/);
});

test("the tiers are counted from the decisions at tier 1, 2 and 3, one column each", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [] }));
  await fighterDays(database.pool, FROM, TO);
  const sql = database.queries[0].sql;
  for (const tier of [1, 2, 3]) assert.match(sql, new RegExp(`d\\.tier = ${tier} AND[^)]*\\)::int AS tier${tier}`));
});

test("no fighters is no rows", async () => {
  const database = new FakeDatabase();
  database.on(/FROM fighters f/, () => ({ rows: [] }));
  assert.deepEqual(await fighterDays(database.pool, FROM, TO), []);
});

test("the runs of the period are asked for by their start, hourly runs only", async () => {
  const database = new FakeDatabase();
  database.on(/FROM runs WHERE kind = 'hourly' AND started_at >=/, () => ({ rows: [] }));
  await runTotals(database.pool, FROM, TO);
  assert.deepEqual(database.queries[0].params, [FROM, TO]);
});

test("the totals add up runs, articles imported and every failed attempt", async () => {
  const database = new FakeDatabase();
  database.on(/FROM runs WHERE kind = 'hourly'/, () => ({
    rows: [
      { counts: { imported: 4, classify_failed: 1, extract_failed: 2, posted: 3 } },
      { counts: { imported: 5, digests_failed: 1, digests_waiting: 7 } },
      { counts: {} },
    ],
  }));
  const totals = await runTotals(database.pool, FROM, TO);
  assert.equal(totals.runs, 3);
  assert.equal(totals.imported, 9);
  assert.equal(totals.failures, 4);
});

test("a run's dollars are JEV's input tokens at its price plus OpenRouter's microdollars", async () => {
  const database = new FakeDatabase();
  database.on(/FROM runs WHERE kind = 'hourly'/, () => ({
    rows: [{ counts: { jev_input_tokens: 1_000_000, openrouter_cost_microdollars: 2_500_000 } }, { counts: { openrouter_cost_microdollars: 500 } }],
  }));
  const totals = await runTotals(database.pool, FROM, TO);
  assert.ok(Math.abs(totals.dollars - (0.042 + 2.5 + 0.0005)) < 1e-9);
});

test("a period with no runs is all zeros", async () => {
  const database = new FakeDatabase();
  database.on(/FROM runs WHERE kind = 'hourly'/, () => ({ rows: [] }));
  assert.deepEqual(await runTotals(database.pool, FROM, TO), { runs: 0, imported: 0, failures: 0, dollars: 0 });
});

test("the month's seconds are summed from the first moment of the month in UTC", async () => {
  const database = new FakeDatabase();
  database.on(/sum\(seconds\)/, () => ({ rows: [{ seconds: "1234.5" }] }));
  assert.equal(await cpuSecondsThisMonth(database.pool, new Date("2026-10-31T23:59:59Z")), 1234.5);
  assert.deepEqual(database.queries[0].params, [new Date("2026-10-01T00:00:00Z")]);
});

test("a month with no runs has zero seconds", async () => {
  const database = new FakeDatabase();
  database.on(/sum\(seconds\)/, () => ({ rows: [{ seconds: "0" }] }));
  assert.equal(await cpuSecondsThisMonth(database.pool, new Date("2026-11-01T00:00:00Z")), 0);
  assert.deepEqual(database.queries[0].params, [new Date("2026-11-01T00:00:00Z")]);
});

test("a day's report is asked for by its date; none written is null", async () => {
  const database = new FakeDatabase();
  database.on(/FROM daily_reports WHERE day/, () => ({ rows: [] }));
  assert.equal(await dailyReport(database.pool, "2026-10-05"), null);
  assert.deepEqual(database.queries[0].params, ["2026-10-05"]);
});

test("a written report is posted only when it has a posted time", async () => {
  const database = new FakeDatabase();
  database.on(/FROM daily_reports WHERE day/, () => ({ rows: [{ text: "counts", posted_at: new Date() }] }));
  assert.deepEqual(await dailyReport(database.pool, "2026-10-05"), { text: "counts", posted: true });
  database.on(/FROM daily_reports WHERE day/, () => ({ rows: [{ text: "counts", posted_at: null }] }));
  assert.deepEqual(await dailyReport(database.pool, "2026-10-05"), { text: "counts", posted: false });
});
