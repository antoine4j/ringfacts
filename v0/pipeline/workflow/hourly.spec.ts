// Covers workflow/hourly.ts: the hourly run's fail-open contract and its wiring.
//
// Part one tests the step that runs a station on one reading: a failure is
// written onto the reading and never thrown, a reading is stuck on its 24th
// failure in a row, a spent daily allowance or a passed deadline makes it wait
// without a failed attempt. Part two runs the whole workflow on a fake database
// and a fake network: the stations run in order, one reading's failure does not
// stop the others, only tier 1 is posted, and the import can be skipped or
// limited. What the runs table stores is written by run.ts, not here.

import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow, stationStep } from "./hourly.ts";
import { DailyLimitError } from "../stations/http.ts";
import { STUCK_AFTER_ATTEMPTS, type Reading } from "../store/readings.ts";
import { FakeDatabase, makeContext, stubNetwork, jevClassification, openRouterExtract, type TestContext } from "./fake-database.ts";

let restoreNetwork = () => {};
afterEach(() => {
  restoreNetwork();
  mock.timers.reset();
});

/**
 * Runs one reading through a station step, the way the workflow does.
 *
 * @param context  The run.
 * @param stage  The stage.
 * @param work  The station's work.
 * @param reading  The reading.
 * @returns What the step reports.
 */
async function runStep(context: TestContext, stage: string, work: (reading: Reading) => Promise<void>, reading: Reading) {
  const step = stationStep(context, stage, work);
  return (step.execute as any)({ inputData: reading });
}

test("a station that succeeds reports the reading done and is counted", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  const context = makeContext(database);
  const seen: number[] = [];
  const outcome = await runStep(context, "classify", async (given) => { seen.push(given.id); }, reading);
  assert.deepEqual(outcome, { id: 1, outcome: "done" });
  assert.deepEqual(seen, [1]);
  assert.equal(context.tally.classify_done, 1);
});

test("a station that throws does not throw: the reading is reported failed and counted", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  const context = makeContext(database);
  const outcome = await runStep(context, "classify", async () => { throw new Error("JEV 500: down"); }, reading);
  assert.deepEqual(outcome, { id: 1, outcome: "failed" });
  assert.equal(context.tally.classify_failed, 1);
});

test("the error is written onto the reading, which stays at its stage with one more attempt", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1, stage: "extract", attempts: 2 });
  await runStep(makeContext(database), "extract", async () => { throw new Error("OpenRouter 500: down"); }, reading);
  assert.equal(database.reading(1).stage, "extract");
  assert.equal(database.reading(1).attempts, 3);
  assert.equal(database.reading(1).last_error, "OpenRouter 500: down");
});

test("something thrown that is not an Error is recorded as its text", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  await runStep(makeContext(database), "classify", async () => { throw "plain text failure"; }, reading);
  assert.equal(database.reading(1).last_error, "plain text failure");
});

test("a long error is kept to its first 1,000 characters", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  await runStep(makeContext(database), "classify", async () => { throw new Error("x".repeat(5000)); }, reading);
  assert.equal(database.reading(1).last_error?.length, 1000);
});

test("a reading is stuck after 24 failures in a row", () => {
  assert.equal(STUCK_AFTER_ATTEMPTS, 24);
});

test("the 23rd failure in a row leaves the reading waiting at its stage", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1, attempts: STUCK_AFTER_ATTEMPTS - 2 });
  const context = makeContext(database);
  const outcome = await runStep(context, "classify", async () => { throw new Error("down"); }, reading);
  assert.equal(outcome.outcome, "failed");
  assert.equal(database.reading(1).stage, "classify");
  assert.equal(database.reading(1).attempts, 23);
  assert.equal(context.tally.classify_stuck, undefined);
});

test("the 24th failure in a row makes the reading stuck, remembering where it was", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1, stage: "group", attempts: STUCK_AFTER_ATTEMPTS - 1 });
  const context = makeContext(database);
  const outcome = await runStep(context, "group", async () => { throw new Error("down"); }, reading);
  assert.equal(outcome.outcome, "stuck");
  assert.equal(database.reading(1).stage, "stuck");
  assert.equal(database.reading(1).stuck_from, "group");
  assert.equal(context.tally.group_stuck, 1);
  assert.equal(context.tally.group_failed, undefined);
});

// The fake applies the threshold to the number the code sends; this pins the SQL that gives that number its meaning.
test("the failure update sticks a reading at or above the threshold, and only if it is still at the stage that failed", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  await runStep(makeContext(database), "classify", async () => { throw new Error("down"); }, reading);
  const [update] = database.sent(/UPDATE readings/);
  assert.equal(update.sql.match(/WHEN attempts \+ 1 >= \$2 THEN/g)?.length, 2, "both the stage and the remembered stage use the same test");
  assert.match(update.sql, /WHERE id = \$3 AND stage = \$4/);
  assert.equal(update.params[1], STUCK_AFTER_ATTEMPTS);
});

test("a spent daily allowance makes the reading wait: skipped, counted, and no failed attempt written", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1, attempts: 5, last_error: "earlier" });
  const context = makeContext(database);
  const outcome = await runStep(context, "classify", async () => { throw new DailyLimitError("JEV has used its free daily allowance"); }, reading);
  assert.deepEqual(outcome, { id: 1, outcome: "skipped" });
  assert.equal(context.tally.classify_daily_limit, 1);
  assert.equal(database.reading(1).attempts, 5);
  assert.equal(database.reading(1).last_error, "earlier");
  assert.equal(database.sent(/UPDATE readings/).length, 0);
});

test("after a daily allowance is spent, the stage's other readings are skipped without calling the station", async () => {
  const database = new FakeDatabase();
  const first = database.addReading({ id: 1 });
  const second = database.addReading({ id: 2 });
  const context = makeContext(database);
  await runStep(context, "classify", async () => { throw new DailyLimitError("spent"); }, first);
  const called: number[] = [];
  const outcome = await runStep(context, "classify", async (given) => { called.push(given.id); }, second);
  assert.equal(outcome.outcome, "skipped");
  assert.deepEqual(called, []);
  assert.equal(context.tally.classify_skipped, 1);
});

test("a spent allowance pauses only its own stage", async () => {
  const database = new FakeDatabase();
  const first = database.addReading({ id: 1 });
  const second = database.addReading({ id: 2, stage: "extract" });
  const context = makeContext(database);
  await runStep(context, "classify", async () => { throw new DailyLimitError("spent"); }, first);
  const outcome = await runStep(context, "extract", async () => {}, second);
  assert.equal(outcome.outcome, "done");
});

test("past the run's deadline a reading is skipped without calling the station or writing anything", async () => {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 1 });
  const context = makeContext(database, { deadline: Date.now() - 1 });
  const called: number[] = [];
  const outcome = await runStep(context, "classify", async (given) => { called.push(given.id); }, reading);
  assert.deepEqual(outcome, { id: 1, outcome: "skipped" });
  assert.deepEqual(called, []);
  assert.equal(context.tally.classify_skipped, 1);
  assert.equal(database.queries.length, 0);
});

// ---- The whole workflow, on a fake database and a fake network ----

/**
 * A fake network that answers every station. A headline containing "FAIL" makes JEV refuse; one containing "tier2" is classified as digest news.
 *
 * @returns The requests seen.
 */
function pipelineNetwork() {
  const stub = stubNetwork((request) => {
    if (request.url.includes("generativelanguage")) return { body: { embedding: { values: [0.1, 0.2, 0.3] } } };
    if (request.url.includes("openrouter.ai")) return { body: openRouterExtract(`Claim of ${request.body.messages[1].content.length}`) };
    if (request.url.includes("typesafe.ai")) {
      const headline: string = request.body.state.headline;
      if (headline.includes("FAIL")) return { status: 400, body: "refused" };
      const isDigestNews = headline.includes("tier2");
      return { body: jevClassification(isDigestNews ? { fact: "status_update", firmness: 2 } : { fact: "result", firmness: 3 }) };
    }
    return { status: 500, body: `unexpected request to ${request.url}` };
  });
  restoreNetwork = stub.restore;
  return stub.requests;
}

/**
 * Makes the fake database answer the posting step with every reading decided tier 1, as the real query does.
 *
 * @param database  The fake database.
 */
function answerPosting(database: FakeDatabase): void {
  database.on(/first_tier_one/, () => ({
    rows: (database.inserted.decisions ?? [])
      .filter((decision) => decision.params[3] === 1)
      .map((decision) => {
        const reading = database.reading(decision.params[0]);
        return { claim_id: 900 + reading.id, reading_id: reading.id, fighter: reading.fighter, headline: reading.headline, outlet: reading.outlet, url: reading.url, extract: { claim: `Claim for ${reading.headline}` }, cell: decision.params[4], outlets: 1 };
      }),
  }));
  database.on(/UPDATE claims SET posted_reading_id/, () => ({ rows: [] }));
  database.on(/UPDATE readings SET posted_at/, () => ({ rows: [] }));
}

/**
 * Runs the hourly workflow once.
 *
 * @param context  The run.
 * @returns The workflow's final status.
 */
async function runWorkflow(context: TestContext): Promise<string> {
  const run = await buildWorkflow(context).createRun();
  const result = await run.start({ inputData: {} });
  return result.status;
}

test("a reading passes the four stations in order and is posted after the last", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 1 });
  pipelineNetwork();
  const status = await runWorkflow(makeContext(database));
  const order = database.queries
    .map((query) => query.sql.match(/INSERT INTO (classifications|extracts|groupings|decisions)|first_tier_one/)?.[0])
    .filter(Boolean)
    .map((text) => text!.replace("INSERT INTO ", ""));
  assert.equal(status, "success");
  assert.deepEqual(order, ["classifications", "extracts", "groupings", "decisions", "first_tier_one"]);
  assert.equal(database.reading(1).stage, "done");
});

test("the run's counts add up what each station and the post did", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 1 });
  database.addReading({ id: 2 });
  pipelineNetwork();
  const context = makeContext(database);
  await runWorkflow(context);
  assert.deepEqual(context.tally, {
    classify_done: 2, jev_input_tokens: 2468, extract_done: 2, openrouter_cost_microdollars: 246, group_done: 2, embedded_via_gemini: 2,
    new_claims: 2, decide_done: 2, tier_1: 2, posted: 2,
  });
});

test("one reading's failure does not stop the others, which go all the way through", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 1 });
  database.addReading({ id: 2, headline: "FAIL this one" });
  database.addReading({ id: 3 });
  pipelineNetwork();
  const context = makeContext(database);
  const status = await runWorkflow(context);
  assert.equal(status, "success");
  assert.equal(database.reading(1).stage, "done");
  assert.equal(database.reading(3).stage, "done");
  assert.equal(context.tally.classify_done, 2);
  assert.equal(context.tally.classify_failed, 1);
});

test("the failed reading keeps its error at its stage and is not loaded by the later stations", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 2, headline: "FAIL this one" });
  pipelineNetwork();
  const context = makeContext(database);
  await runWorkflow(context);
  assert.equal(database.reading(2).stage, "classify");
  assert.equal(database.reading(2).attempts, 1);
  assert.match(database.reading(2).last_error ?? "", /JEV 400: refused/);
  assert.equal(context.tally.extract_done, undefined);
});

test("a reading that failed is tried again on the next run and then moves on", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 2, headline: "FAIL this one" });
  pipelineNetwork();
  await runWorkflow(makeContext(database));
  restoreNetwork();

  // The next run: the article is the same, but the vendor is back.
  database.reading(2).headline = "Back to normal";
  pipelineNetwork();
  await runWorkflow(makeContext(database));
  assert.equal(database.reading(2).stage, "done");
  assert.equal(database.reading(2).attempts, 0);
  assert.equal(database.reading(2).last_error, null);
});

test("only tier 1 is posted; digest news waits for the digest", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 1, headline: "Testov wins" });
  database.addReading({ id: 2, headline: "Testov tier2 update" });
  pipelineNetwork();
  const context = makeContext(database);
  await runWorkflow(context);
  assert.equal(database.reading(2).stage, "done");
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /Claim for Testov wins/);
  assert.equal(context.tally.tier_1, 1);
  assert.equal(context.tally.tier_2, 1);
});

test("a spent daily allowance pauses a stage for the rest of the run, and the readings wait unharmed", async () => {
  const database = new FakeDatabase();
  for (const id of [1, 2, 3]) {
    database.addReading({ id, stage: "group" });
    database.seedAnswer("extracts", id, "p4", { kind: "new_event", claim: "A claim.", occasion: null, actor: null, opponent: null, event: null, date: null });
  }
  const stub = stubNetwork(() => ({ status: 429, body: "quota PerDay" }));
  restoreNetwork = stub.restore;
  const context = makeContext(database, { keys: { jev: "j", openrouter: "o", gemini: "g" } });
  await runWorkflow(context);
  assert.equal(context.tally.group_daily_limit, 1);
  assert.equal(context.tally.group_skipped, 2);
  assert.equal(stub.requests.length, 2, "one try on Gemini and one on the paid route, then no more calls");
  assert.deepEqual(database.readings.map((reading) => [reading.stage, reading.attempts]), [["group", 0], ["group", 0], ["group", 0]]);
});

test("a run already past its deadline starts no station and fails no reading", async () => {
  const database = new FakeDatabase();
  answerPosting(database);
  database.addReading({ id: 1 });
  const requests = pipelineNetwork();
  const context = makeContext(database, { deadline: Date.now() - 1 });
  await runWorkflow(context);
  assert.equal(requests.length, 0);
  assert.equal(context.tally.classify_skipped, 1);
  assert.equal(database.reading(1).stage, "classify");
  assert.equal(database.reading(1).attempts, 0);
});

// ---- The import step ----

const SUBJECTS = [{ name: "Marko Testov", matchNames: ["Testov"] }, { name: "Ivan Rivalov", matchNames: ["Rivalov"] }];

/**
 * A production row, filed under Testov, with a body long enough to classify unless told otherwise.
 *
 * @param id  Production's id for it.
 * @param body  The body.
 * @returns The row.
 */
function productionItem(id: number, body: string | null = "x".repeat(500)) {
  return {
    id, url: `https://example.com/${id}`, resolved_url: null, subject: "Marko Testov", title: `Production ${id}`, source: "Example", published_at: new Date(`2026-10-0${id}`),
    body, body_via: null, posted: false, held_reason: null, digest_tier: null,
  };
}

/**
 * A fake production database holding some rows.
 *
 * @param rows  The rows, oldest first.
 * @returns The fake.
 */
function feedWith(rows: ReturnType<typeof productionItem>[]) {
  const feed = new FakeDatabase();
  feed.on(/FROM items/, () => ({ rows }));
  return feed;
}

/**
 * Makes the fake database answer the import's "already known" lookup.
 *
 * @param database  The fake database.
 * @param knownIds  Production ids v0 already has.
 */
function answerKnownArticles(database: FakeDatabase, knownIds: number[] = []): void {
  database.on(/SELECT production_item_id FROM articles/, () => ({ rows: knownIds.map((id) => ({ production_item_id: id })) }));
}

test("without a feed the import adds the watchlist's fighters and reads no articles", async () => {
  const database = new FakeDatabase();
  const context = makeContext(database, { subjects: SUBJECTS, feed: null });
  await runWorkflow(context);
  assert.deepEqual(database.sent(/INSERT INTO fighters/).map((query) => query.params[0]), ["Marko Testov", "Ivan Rivalov"]);
  assert.equal(context.tally.production_items_read, undefined);
  assert.equal(database.inserted.articles, undefined);
});

test("with a feed the import counts what it read, imported, made into readings and found without a body", async () => {
  const database = new FakeDatabase();
  answerKnownArticles(database);
  const feed = feedWith([productionItem(1), productionItem(2, null)]);
  const context = makeContext(database, { subjects: SUBJECTS, feed: feed.pool });
  await runWorkflow(context);
  assert.equal(context.tally.production_items_read, 2);
  assert.equal(context.tally.imported, 2);
  assert.equal(context.tally.readings_made, 2);
  assert.equal(context.tally.no_body, 1);
});

test("an article v0 already has is read but not imported again", async () => {
  const database = new FakeDatabase();
  answerKnownArticles(database, [1]);
  const feed = feedWith([productionItem(1), productionItem(2)]);
  const context = makeContext(database, { subjects: SUBJECTS, feed: feed.pool });
  await runWorkflow(context);
  assert.equal(context.tally.production_items_read, 2);
  assert.equal(context.tally.imported, 1);
  assert.deepEqual(database.inserted.articles.map((row) => row.params[0]), [2]);
});

test("an import limit keeps only the newest rows", async () => {
  const database = new FakeDatabase();
  answerKnownArticles(database);
  const feed = feedWith([productionItem(1), productionItem(2), productionItem(3)]);
  const context = makeContext(database, { subjects: SUBJECTS, feed: feed.pool, importLimit: 2 });
  await runWorkflow(context);
  assert.equal(context.tally.production_items_read, 2);
  assert.deepEqual(database.inserted.articles.map((row) => row.params[0]), [2, 3]);
});

test("the import reads only the last few days, or all of production when the run has no window", async () => {
  const database = new FakeDatabase();
  answerKnownArticles(database);
  const windowed = feedWith([]);
  await runWorkflow(makeContext(database, { feed: windowed.pool, importDays: 3 }));
  const everything = feedWith([]);
  await runWorkflow(makeContext(database, { feed: everything.pool, importDays: null }));
  assert.match(windowed.sent(/FROM items/)[0].sql, /make_interval\(days => 3\)/);
  assert.doesNotMatch(everything.sent(/FROM items/)[0].sql, /WHERE/);
});

test("a run on history marks its articles as backfill so they are never posted", async () => {
  const database = new FakeDatabase();
  answerKnownArticles(database);
  const feed = feedWith([productionItem(1)]);
  await runWorkflow(makeContext(database, { subjects: SUBJECTS, feed: feed.pool, backfill: true }));
  assert.equal(database.inserted.articles[0].params[9], true);
});

// ---- The steps after the post ----

test("a live run looks for due digests, and a run on history does not", async () => {
  const live = new FakeDatabase();
  await runWorkflow(makeContext(live, { backfill: false }));
  const history = new FakeDatabase();
  await runWorkflow(makeContext(history, { backfill: true }));
  assert.equal(live.sent(/FROM settings/).length, 1);
  assert.equal(history.sent(/FROM settings/).length, 0);
});

test("a live run checks the day's counts after 07:00 Pacific, and a run on history does not", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-26T15:00:00Z") });
  const live = new FakeDatabase();
  live.on(/FROM daily_reports/, () => ({ rows: [{ text: "already sent", posted_at: new Date() }] }));
  await runWorkflow(makeContext(live, { backfill: false, deadline: Date.now() + 600_000 }));
  const history = new FakeDatabase();
  history.on(/FROM daily_reports/, () => ({ rows: [{ text: "already sent", posted_at: new Date() }] }));
  await runWorkflow(makeContext(history, { backfill: true, deadline: Date.now() + 600_000 }));
  assert.equal(live.sent(/FROM daily_reports/).length, 1);
  assert.equal(history.sent(/FROM daily_reports/).length, 0);
});

test("feedback is read only by a run that may post, and only with the chat and the maintainer's account configured", async () => {
  const saved = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID, maintainer: process.env.TELEGRAM_MAINTAINER_ID };
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "-100";
  process.env.TELEGRAM_MAINTAINER_ID = "4242";
  try {
    const stub = stubNetwork(() => ({ body: { result: [] } }));
    restoreNetwork = stub.restore;
    await runWorkflow(makeContext(new FakeDatabase(), { readsFeedback: false }));
    assert.equal(stub.requests.length, 0);
    await runWorkflow(makeContext(new FakeDatabase(), { readsFeedback: true }));
    assert.equal(stub.requests.length, 1);
    assert.match(stub.requests[0].url, /api\.telegram\.org\/botbot-token\/getUpdates/);
  } finally {
    for (const [name, value] of [["TELEGRAM_BOT_TOKEN", saved.token], ["TELEGRAM_CHAT_ID", saved.chat], ["TELEGRAM_MAINTAINER_ID", saved.maintainer]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

