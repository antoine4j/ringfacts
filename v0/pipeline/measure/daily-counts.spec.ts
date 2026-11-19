import { test } from "node:test";
import assert from "node:assert/strict";
import { reportMoment, monthForecast, dailyMessage, dailyCountsDue, MONTHLY_CPU_BUDGET } from "./daily-counts.ts";
import { FakeDatabase, makeContext } from "../workflow/fake-database.ts";

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

test("a fighter's name is escaped, and a fighter with nothing waiting or stuck has no such line", () => {
  const message = dailyMessage("2026-10-05", [{ ...DAY, fighter: "A & B <C>" }], TOTALS, { soFar: 0, forecast: 0 });
  assert.match(message, /<b>A &amp; B &lt;C&gt;<\/b>/);
  assert.doesNotMatch(message, /waiting/);
});

test("waiting or stuck readings add a line, either one alone", () => {
  assert.match(dailyMessage("2026-10-05", [{ ...DAY, waiting: 3 }], TOTALS, { soFar: 0, forecast: 0 }), /\nwaiting 3, stuck 0/);
  assert.match(dailyMessage("2026-10-05", [{ ...DAY, stuck: 2 }], TOTALS, { soFar: 0, forecast: 0 }), /\nwaiting 0, stuck 2/);
});

test("the second line gives runs, articles, failures and the dollars to three places", () => {
  const message = dailyMessage("2026-10-05", [], { runs: 24, imported: 9, failures: 2, dollars: 1.23456 }, { soFar: 0, forecast: 0 });
  assert.match(message, /24 runs, 9 articles in, 2 failed attempts, \$1\.235 on models/);
});

test("the forecast exactly at the budget is no warning", () => {
  assert.doesNotMatch(dailyMessage("2026-10-05", [DAY], TOTALS, { soFar: 1000, forecast: MONTHLY_CPU_BUDGET }), /⚠️/);
});

test("the last line gives the month's seconds rounded and the forecast against the budget", () => {
  const lines = dailyMessage("2026-10-05", [DAY], TOTALS, { soFar: 1234.6, forecast: 99_000 }).split("\n");
  assert.equal(lines[lines.length - 1], "Cloud Run this month: 1,235 vCPU-s, heading for 99,000 of 100,000");
});

test("the report moment follows the clocks: 07:00 is 15:00 UTC once winter time starts", () => {
  assert.deepEqual(reportMoment(new Date("2026-11-18T05:00:00Z")), { at: new Date("2026-11-17T15:00:00Z"), day: "2026-11-17" });
  assert.deepEqual(reportMoment(new Date("2026-11-18T15:00:00Z")), { at: new Date("2026-11-18T15:00:00Z"), day: "2026-11-18" });
});

test("the forecast of a month's first instant does not divide by zero", () => {
  assert.equal(monthForecast(0, new Date("2026-11-01T00:00:00Z")), 0);
  assert.ok(Number.isFinite(monthForecast(5, new Date("2026-11-01T00:00:00Z"))));
});

// 07:00 Pacific on 2026-10-05 is 14:00 UTC (summer time).
const AFTER_REPORT_TIME = new Date("2026-10-05T14:30:00Z");

/**
 * A fake database for the daily counts: no fighters, no runs, and the report row as given.
 *
 * @param report  The report already written, or null for none.
 * @returns The database.
 */
function countsDatabase(report: { text: string; posted_at: Date | null } | null) {
  const database = new FakeDatabase();
  database.on(/FROM daily_reports WHERE day/, () => ({ rows: report ? [report] : [] }));
  database.on(/FROM fighters f/, () => ({ rows: [] }));
  database.on(/FROM runs WHERE kind = 'hourly' AND started_at >=/, () => ({ rows: [] }));
  database.on(/sum\(seconds\)/, () => ({ rows: [{ seconds: "0" }] }));
  database.on(/^UPDATE daily_reports/, () => ({ rows: [], rowCount: 1 }));
  return database;
}

test("before 07:00 Pacific nothing is looked up or sent", async () => {
  const database = countsDatabase(null);
  const context = makeContext(database);
  await dailyCountsDue(context, new Date("2026-10-05T13:59:00Z"));
  assert.equal(database.queries.length, 0);
  assert.deepEqual(context.messages, []);
});

test("a report already posted is left alone", async () => {
  const database = countsDatabase({ text: "sent", posted_at: new Date() });
  const context = makeContext(database);
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.deepEqual(context.messages, []);
  assert.equal(database.sent(/daily_reports SET/).length, 0);
});

test("a report written by a run that could not post is sent by the first run that can, and counted as late", async () => {
  const database = countsDatabase({ text: "written earlier", posted_at: null });
  const context = makeContext(database);
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.deepEqual(context.messages, ["written earlier"]);
  assert.deepEqual(database.sent(/UPDATE daily_reports SET posted_at/)[0].params, [5000, "2026-10-05"]);
  assert.equal(context.tally.daily_counts_sent_late, 1);
});

test("a sent report's message is recorded against its day", async () => {
  const database = countsDatabase({ text: "written earlier", posted_at: null });
  await dailyCountsDue(makeContext(database), AFTER_REPORT_TIME);
  assert.deepEqual(database.sent(/^INSERT INTO sent_messages/)[0].params, [5000, "daily", null, null, "2026-10-05", 1]);
});

test("a written report waits when this run cannot send, and nothing is written again", async () => {
  const database = countsDatabase({ text: "written earlier", posted_at: null });
  const context = makeContext(database, { sends: false });
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.deepEqual(context.messages, []);
  assert.equal(database.sent(/INSERT INTO daily_reports/).length, 0);
  assert.equal(context.tally.daily_counts_sent_late, undefined);
});

test("a late report that only printed is not marked posted", async () => {
  const database = countsDatabase({ text: "written earlier", posted_at: null });
  const context = makeContext(database, { poster: async () => null });
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.equal(database.sent(/UPDATE daily_reports SET posted_at/).length, 0);
});

test("the first report of the day covers the 24 hours before 07:00, whatever the time now", async () => {
  const database = countsDatabase(null);
  await dailyCountsDue(makeContext(database), new Date("2026-10-05T20:45:00Z"));
  const at = new Date("2026-10-05T14:00:00Z");
  const from = new Date("2026-10-04T14:00:00Z");
  assert.deepEqual(database.sent(/FROM fighters f/)[0].params, [from, at]);
  const runQuery = database.sent(/SELECT counts FROM runs/)[0];
  assert.deepEqual(runQuery.params, [from, at]);
});

test("the first report of the day is stored under its Pacific date, posted, and marked with its message id", async () => {
  const database = countsDatabase(null);
  const context = makeContext(database);
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /the 24 hours to 2026-10-05 07:00/);
  const insert = database.sent(/INSERT INTO daily_reports/)[0];
  assert.deepEqual(insert.params, ["2026-10-05", context.messages[0]]);
  assert.match(insert.sql, /ON CONFLICT DO NOTHING/);
  assert.deepEqual(database.sent(/UPDATE daily_reports SET posted_at/)[0].params, [5000, "2026-10-05"]);
  assert.equal(context.tally.daily_counts_written, 1);
});

test("the report is stored before it is sent, so a failed send is retried by the next run rather than counted twice", async () => {
  const database = countsDatabase(null);
  const context = makeContext(database, { poster: async () => { throw new Error("telegram down"); } });
  await assert.rejects(dailyCountsDue(context, AFTER_REPORT_TIME), /telegram down/);
  assert.equal(database.sent(/INSERT INTO daily_reports/).length, 1);
  assert.equal(database.sent(/UPDATE daily_reports SET posted_at/).length, 0);
});

test("a first report that only printed is stored but not marked posted", async () => {
  const database = countsDatabase(null);
  const context = makeContext(database, { poster: async () => null });
  await dailyCountsDue(context, AFTER_REPORT_TIME);
  assert.equal(database.sent(/INSERT INTO daily_reports/).length, 1);
  assert.equal(database.sent(/UPDATE daily_reports SET posted_at/).length, 0);
  assert.equal(context.tally.daily_counts_written, 1);
});
