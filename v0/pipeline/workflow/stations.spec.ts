// Covers workflow/stations.ts: what each station does with one reading.
// A station asks its model (the network is replaced), writes the answer, moves
// the reading to the next stage in the same step, and adds to the run's counts.
// On any failure it throws and leaves the reading exactly where it was; the
// workflow step (hourly.spec.ts) is what records that failure.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { classifyReading, extractReading, groupReading, decideReading } from "./stations.ts";
import { FakeDatabase, makeContext, stubNetwork, jevClassification, openRouterExtract } from "./fake-database.ts";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";
const VECTOR = [0.25, 0.5, 0.75];

let restoreNetwork = () => {};
afterEach(() => restoreNetwork());

/**
 * Puts the network stand-in in place for one test.
 *
 * @param answer  Given each request, the reply.
 * @returns The requests seen.
 */
function network(answer: Parameters<typeof stubNetwork>[0]) {
  const stub = stubNetwork(answer);
  restoreNetwork = stub.restore;
  return stub.requests;
}

/**
 * A database with one reading at a stage.
 *
 * @param stage  The stage.
 * @returns The database and the reading.
 */
function databaseWithReading(stage: string) {
  const database = new FakeDatabase();
  const reading = database.addReading({ id: 7, stage, attempts: 3, last_error: "an earlier failure" });
  return { database, reading };
}

test("the classifier is asked about this reading's article, with the run's JEV key", async () => {
  const { database, reading } = databaseWithReading("classify");
  const requests = network(() => ({ body: jevClassification() }));
  await classifyReading(makeContext(database), reading);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, JEV_URL);
  assert.equal(requests[0].headers.Authorization, "Bearer jev-key");
  assert.equal(requests[0].body.state.watched_fighter, "Marko Testov");
  assert.equal(requests[0].body.state.headline, "Headline 7");
  assert.equal(requests[0].body.state.article_text, "The article's body.");
});

test("a classification is stored and the reading moves from classify to extract", async () => {
  const { database, reading } = databaseWithReading("classify");
  network(() => ({ body: jevClassification({ fact: "result", firmness: 3 }) }));
  await classifyReading(makeContext(database), reading);
  assert.equal(database.reading(7).stage, "extract");
  const [stored] = database.inserted.classifications;
  assert.equal(stored.params[0], 7);
  assert.equal(stored.params[1], "v7.7");
  assert.equal(stored.params[2].fact, "result");
  assert.equal(stored.params[2].firmness, "official_or_done");
});

test("a station's success clears the reading's earlier failures", async () => {
  const { database, reading } = databaseWithReading("classify");
  network(() => ({ body: jevClassification() }));
  await classifyReading(makeContext(database), reading);
  assert.equal(database.reading(7).attempts, 0);
  assert.equal(database.reading(7).last_error, null);
});

test("JEV's input tokens are added to the run's count", async () => {
  const { database, reading } = databaseWithReading("classify");
  network(() => ({ body: jevClassification(undefined, 1234) }));
  const context = makeContext(database);
  await classifyReading(context, reading);
  assert.equal(context.tally.jev_input_tokens, 1234);
});

test("a failed JEV call throws and leaves the reading at classify with nothing stored", async () => {
  const { database, reading } = databaseWithReading("classify");
  network(() => ({ status: 400, body: "bad request" }));
  await assert.rejects(classifyReading(makeContext(database), reading), /JEV 400/);
  assert.equal(database.reading(7).stage, "classify");
  assert.equal(database.inserted.classifications, undefined);
});

test("a reading that already left the stage is not moved again, and its answer is rolled back", async () => {
  const { database, reading } = databaseWithReading("extract");
  network(() => ({ body: jevClassification() }));
  await assert.rejects(classifyReading(makeContext(database), reading), /was no longer at classify/);
  assert.equal(database.reading(7).stage, "extract");
  assert.deepEqual(database.transactionLog, ["BEGIN", "ROLLBACK"]);
});

test("the extractor is asked about this reading's article, with the run's OpenRouter key", async () => {
  const { database, reading } = databaseWithReading("extract");
  const requests = network(() => ({ body: openRouterExtract() }));
  await extractReading(makeContext(database), reading);
  assert.equal(requests[0].url, OPENROUTER_CHAT_URL);
  assert.equal(requests[0].headers.Authorization, "Bearer openrouter-key");
  assert.match(requests[0].body.messages[1].content, /Headline 7/);
});

test("an extract is stored and the reading moves from extract to group", async () => {
  const { database, reading } = databaseWithReading("extract");
  network(() => ({ body: openRouterExtract("Testov is injured.") }));
  await extractReading(makeContext(database), reading);
  assert.equal(database.reading(7).stage, "group");
  const [stored] = database.inserted.extracts;
  assert.equal(stored.params[0], 7);
  assert.equal(stored.params[1], "p4");
  assert.equal(stored.params[2].claim, "Testov is injured.");
});

test("the extractor's cost is counted in whole microdollars", async () => {
  const { database, reading } = databaseWithReading("extract");
  network(() => ({ body: openRouterExtract(undefined, 0.000123) }));
  const context = makeContext(database);
  await extractReading(context, reading);
  assert.equal(context.tally.openrouter_cost_microdollars, 123);
});

test("a model reply that is not an extract throws and leaves the reading at extract", async () => {
  const { database, reading } = databaseWithReading("extract");
  network(() => ({ body: { choices: [{ message: { content: JSON.stringify({ kind: "not_a_kind", claim: "x" }) } }] } }));
  await assert.rejects(extractReading(makeContext(database), reading));
  assert.equal(database.reading(7).stage, "extract");
  assert.equal(database.inserted.extracts, undefined);
});

test("a reply with no message throws and leaves the reading at extract", async () => {
  const { database, reading } = databaseWithReading("extract");
  network(() => ({ body: { choices: [] } }));
  await assert.rejects(extractReading(makeContext(database), reading), /OpenRouter reply had no message/);
  assert.equal(database.reading(7).stage, "extract");
});

/**
 * Seeds the extract a group station reads back, and the network a grouping needs.
 *
 * @param database  The database.
 * @param claim  The extract's claim sentence.
 * @param jevChoice  What JEV picks when asked, or null when it must not be asked.
 * @returns The requests seen.
 */
function groupingNetwork(database: FakeDatabase, claim: string, jevChoice: string | null) {
  database.seedAnswer("extracts", 7, "p4", { kind: "new_event", claim, occasion: null, actor: null, opponent: null, event: null, date: null });
  return network((request) => {
    if (request.url.includes("generativelanguage")) return { body: { embedding: { values: VECTOR } } };
    if (request.url === OPENROUTER_EMBEDDING_URL) return { body: { data: [{ embedding: VECTOR }] } };
    if (request.url === JEV_URL && jevChoice !== null) return { body: { answers: { story: { choice: jevChoice, confidence: 0.9 } } } };
    return { status: 500, body: "this call was not expected" };
  });
}

test("a reading with nothing on the shortlist starts a new claim labelled by its extract", async () => {
  const { database, reading } = databaseWithReading("group");
  const requests = groupingNetwork(database, "Testov will fight Rivalov.", null);
  const context = makeContext(database);
  await groupReading(context, reading);
  assert.equal(database.reading(7).stage, "decide");
  assert.equal(database.inserted.claims[0].params[2], "Testov will fight Rivalov.");
  assert.equal(context.tally.new_claims, 1);
  assert.equal(context.tally.joins, undefined);
  assert.ok(requests.every((request) => request.url !== JEV_URL), "JEV is not asked when there is nothing to choose from");
});

test("a new claim is labelled by the headline when the extract found no claim", async () => {
  const { database, reading } = databaseWithReading("group");
  groupingNetwork(database, "NO CLAIM", null);
  await groupReading(makeContext(database), reading);
  assert.equal(database.inserted.claims[0].params[2], "Headline 7");
});

test("the shortlist is looked up for the reading's own fighter and publication date", async () => {
  const { database, reading } = databaseWithReading("group");
  groupingNetwork(database, "Testov will fight Rivalov.", null);
  await groupReading(makeContext(database), reading);
  const [lookup] = database.sent(/WITH recent AS/);
  assert.equal(lookup.params[0], "Marko Testov");
  assert.deepEqual(lookup.params[2], new Date("2026-10-05T12:00:00Z"));
  assert.equal(lookup.params[4], "[0.25,0.5,0.75]");
});

test("a reading JEV matches to a shortlisted claim joins it and starts no claim", async () => {
  const { database, reading } = databaseWithReading("group");
  groupingNetwork(database, "Testov will fight Rivalov.", "claim_41");
  database.on(/WITH recent AS/, () => ({ rows: [{ claim_id: 41, similarity: 0.91, current_label: "Testov v Rivalov booked" }] }));
  const context = makeContext(database);
  await groupReading(context, reading);
  assert.equal(database.inserted.claims, undefined);
  assert.equal(database.inserted.groupings[0].params[6], 41);
  assert.equal(database.reading(7).stage, "decide");
  assert.equal(context.tally.joins, 1);
  assert.equal(context.tally.new_claims, undefined);
});

test("a reading JEV matches to none of the shortlist starts a new claim", async () => {
  const { database, reading } = databaseWithReading("group");
  groupingNetwork(database, "Testov will fight Rivalov.", "none_of_these");
  database.on(/WITH recent AS/, () => ({ rows: [{ claim_id: 41, similarity: 0.5, current_label: "Another story" }] }));
  const context = makeContext(database);
  await groupReading(context, reading);
  assert.equal(database.inserted.claims.length, 1);
  assert.equal(context.tally.new_claims, 1);
});

test("the embedding is counted as made by Gemini when Gemini answers", async () => {
  const { database, reading } = databaseWithReading("group");
  groupingNetwork(database, "Testov will fight Rivalov.", null);
  const context = makeContext(database);
  await groupReading(context, reading);
  assert.equal(context.tally.embedded_via_gemini, 1);
});

test("a spent Gemini allowance moves the embedding to OpenRouter, and the count says so", async () => {
  const { database, reading } = databaseWithReading("group");
  database.seedAnswer("extracts", 7, "p4", { kind: "new_event", claim: "Testov will fight Rivalov.", occasion: null, actor: null, opponent: null, event: null, date: null });
  network((request) => {
    if (request.url.includes("generativelanguage")) return { status: 429, body: "quota PerDay" };
    return { body: { data: [{ embedding: VECTOR }] } };
  });
  const context = makeContext(database);
  await groupReading(context, reading);
  assert.equal(context.tally.embedded_via_openrouter, 1);
  assert.equal(database.reading(7).stage, "decide");
});

test("a reading with no stored extract throws before any network call", async () => {
  const { database, reading } = databaseWithReading("group");
  const requests = network(() => ({ body: {} }));
  await assert.rejects(groupReading(makeContext(database), reading), /no extract to group on/);
  assert.equal(requests.length, 0);
  assert.equal(database.reading(7).stage, "group");
});

test("a failed embedding throws and leaves the reading at group with no claim started", async () => {
  const { database, reading } = databaseWithReading("group");
  database.seedAnswer("extracts", 7, "p4", { kind: "new_event", claim: "Testov will fight Rivalov.", occasion: null, actor: null, opponent: null, event: null, date: null });
  network(() => ({ status: 401, body: "bad key" }));
  await assert.rejects(groupReading(makeContext(database), reading), /Gemini embedding 401/);
  assert.equal(database.reading(7).stage, "group");
  assert.equal(database.inserted.claims, undefined);
});

/**
 * Seeds a classification the decider reads back.
 *
 * @param database  The database.
 * @param fact  The "what new fact" answer.
 * @param firmness  The "how firm" answer.
 * @param centrality  The "how central" answer.
 * @param version  The classifier version.
 * @returns The classification's id.
 */
function seedClassification(database: FakeDatabase, fact: string, firmness: string, centrality = "main_subject", version = "v7.7") {
  return database.seedAnswer("classifications", 7, version, { fact, firmness, centrality });
}

test("a result reported as done is decided tier 1, and the decision records what it read", async () => {
  const { database, reading } = databaseWithReading("decide");
  const classificationId = seedClassification(database, "result", "official_or_done");
  const context = makeContext(database);
  await decideReading(context, reading);
  const [decision] = database.inserted.decisions;
  assert.deepEqual(decision.params, [7, classificationId, 1, 1, "result · official_or_done"]);
  assert.equal(context.tally.tier_1, 1);
});

test("the decision moves the reading from decide to done", async () => {
  const { database, reading } = databaseWithReading("decide");
  seedClassification(database, "result", "official_or_done");
  await decideReading(makeContext(database), reading);
  assert.equal(database.reading(7).stage, "done");
});

test("a rumoured next fight is decided tier 2 and counted as tier 2", async () => {
  const { database, reading } = databaseWithReading("decide");
  seedClassification(database, "next_fight", "rumour");
  const context = makeContext(database);
  await decideReading(context, reading);
  assert.equal(database.inserted.decisions[0].params[3], 2);
  assert.equal(context.tally.tier_2, 1);
});

test("an article that only mentions him is decided tier 3 whatever it reports", async () => {
  const { database, reading } = databaseWithReading("decide");
  seedClassification(database, "result", "official_or_done", "only_mentioned");
  const context = makeContext(database);
  await decideReading(context, reading);
  assert.deepEqual(database.inserted.decisions[0].params.slice(3), [3, "not about him"]);
  assert.equal(context.tally.tier_3, 1);
});

test("a reading with no classification throws and stays at decide", async () => {
  const { database, reading } = databaseWithReading("decide");
  await assert.rejects(decideReading(makeContext(database), reading), /no classification to decide on/);
  assert.equal(database.reading(7).stage, "decide");
});

test("settings written for another classifier version make the decision throw, not guess", async () => {
  const { database, reading } = databaseWithReading("decide");
  seedClassification(database, "result", "official_or_done", "main_subject", "v7.6");
  await assert.rejects(decideReading(makeContext(database), reading), /not v7\.6/);
  assert.equal(database.reading(7).stage, "decide");
  assert.equal(database.inserted.decisions, undefined);
});
