// Covers the grouping station's parts that are not the database: the text a
// reading is embedded from, the embedding call and its paid fallback, and the
// pick JEV makes among the shortlisted claims. Calls go to a faked fetch.

import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { groupingText, embed, pickQuestion, pickClaim, EMBEDDING_DIMENSIONS, NONE_OF_THESE } from "./grouping.ts";

const EXTRACT = { kind: "new_event" as const, claim: "Marko Testov will fight Ivan Rivalov at UFC 400.", occasion: "UFC announcement", actor: null, opponent: "Ivan Rivalov", event: "UFC 400", date: null };
const NO_CLAIM = { ...EXTRACT, kind: "restatement" as const, claim: "NO CLAIM", occasion: null };
const NO_OCCASION = { ...EXTRACT, occasion: null };
const EMPTY_OCCASION = { ...EXTRACT, occasion: "" };

const GEMINI_ADDRESS = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const OPENROUTER_ADDRESS = "https://openrouter.ai/api/v1/embeddings";
const JEV_ADDRESS = "https://api.typesafe.ai/v1/systemone";

const CANDIDATES = [
  { claimId: 7, label: "Testov is booked against Rivalov", similarity: 0.9 },
  { claimId: 12, label: "Testov won by knockout", similarity: 0.8 },
];
const ARTICLE = { fighter: "Marko Testov", headline: "Testov booked", outlet: "Example News", publishedAt: new Date("2026-10-05T12:00:00Z"), body: "The body.", extract: EXTRACT };

type Request = { url: string; headers: Record<string, string>; body: any };

/**
 * Replaces fetch for one test with replies given in order; the real fetch
 * comes back when the test ends.
 *
 * @param context  The running test, which restores the real fetch afterwards.
 * @param replies  Each call's status and body (the last reply repeats).
 * @returns The requests the code made, read after the call under test.
 */
function fakeFetch(context: TestContext, replies: { status: number; body: unknown }[]): Request[] {
  const requests: Request[] = [];
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const reply = replies[Math.min(requests.length, replies.length - 1)];
    requests.push({ url, headers: options.headers as Record<string, string>, body: JSON.parse(options.body as string) });
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status });
  });
  return requests;
}

/**
 * A vector of the embedding's size, so replies look like the real ones.
 *
 * @param value  The number every position holds.
 * @returns The vector.
 */
function vectorOf(value: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(value);
}

const GEMINI_OK = { status: 200, body: { embedding: { values: vectorOf(0.25) } } };
const GEMINI_SPENT = { status: 429, body: '{"quotaId":"EmbedContentRequestsPerDayPerProjectPerModel-FreeTier"}' };
const OPENROUTER_OK = { status: 200, body: { data: [{ embedding: vectorOf(0.5) }] } };

/**
 * A JEV reply that picks one option.
 *
 * @param choice  The option JEV chose.
 * @param confidence  How sure it was.
 * @returns A reply for fakeFetch.
 */
function jevAnswer(choice: string, confidence: number) {
  return { status: 200, body: { answers: { story: { choice, confidence } } } };
}

test("a reading with no claim is embedded from just its headline and lead", () => {
  assert.equal(groupingText(NO_CLAIM, "Head", "Body"), "Head\n\nBody");
});

test("a reading with an occasion starts with the occasion, a colon and the claim", () => {
  assert.equal(groupingText(EXTRACT, "Head", "Body"), "UFC announcement: Marko Testov will fight Ivan Rivalov at UFC 400.\n\nHead\n\nBody");
});

test("a reading with no occasion starts with the bare claim", () => {
  assert.equal(groupingText(NO_OCCASION, "Head", "Body"), "Marko Testov will fight Ivan Rivalov at UFC 400.\n\nHead\n\nBody");
});

test("an empty occasion adds no colon prefix", () => {
  assert.equal(groupingText(EMPTY_OCCASION, "Head", "Body"), groupingText(NO_OCCASION, "Head", "Body"));
});

test("a body longer than 1,500 characters is cut at 1,500", () => {
  const text = groupingText(NO_CLAIM, "Head", "x".repeat(1600));
  assert.equal(text, `Head\n\n${"x".repeat(1500)}`);
});

test("a body of exactly 1,500 characters is kept whole", () => {
  const text = groupingText(NO_CLAIM, "Head", "x".repeat(1500));
  assert.equal(text.length, "Head\n\n".length + 1500);
});

test("Gemini's answer comes back as a 768-number vector tagged gemini", async (context) => {
  fakeFetch(context, [GEMINI_OK]);
  const result = await embed("some text", { gemini: "gem-key" });
  assert.equal(result.via, "gemini");
  assert.equal(result.vector.length, 768);
  assert.equal(result.vector[0], 0.25);
});

test("the Gemini request carries the text, the key and the 768-dimension setting", async (context) => {
  const requests = fakeFetch(context, [GEMINI_OK]);
  await embed("some text", { gemini: "gem-key" });
  assert.equal(requests[0].url, GEMINI_ADDRESS);
  assert.equal(requests[0].headers["x-goog-api-key"], "gem-key");
  assert.deepEqual(requests[0].body.content.parts, [{ text: "some text" }]);
  assert.equal(requests[0].body.outputDimensionality, 768);
});

test("when the free daily allowance is spent, OpenRouter makes the vector and it is tagged openrouter", async (context) => {
  const requests = fakeFetch(context, [GEMINI_SPENT, OPENROUTER_OK]);
  const result = await embed("some text", { gemini: "gem-key", openrouter: "or-key" });
  assert.equal(result.via, "openrouter");
  assert.equal(result.vector.length, 768);
  assert.equal(result.vector[0], 0.5);
  assert.equal(requests.length, 2);
});

test("the OpenRouter request names the same model, the text, the dimensions and the bearer key", async (context) => {
  const requests = fakeFetch(context, [GEMINI_SPENT, OPENROUTER_OK]);
  await embed("some text", { gemini: "gem-key", openrouter: "or-key" });
  assert.equal(requests[1].url, OPENROUTER_ADDRESS);
  assert.equal(requests[1].headers.Authorization, "Bearer or-key");
  assert.deepEqual(requests[1].body, { model: "google/gemini-embedding-001", input: "some text", dimensions: 768 });
});

test("a spent allowance with no OpenRouter key stays an error, and nothing paid is called", async (context) => {
  const requests = fakeFetch(context, [GEMINI_SPENT]);
  await assert.rejects(embed("some text", { gemini: "gem-key" }), /free daily allowance/);
  assert.equal(requests.length, 1);
});

test("any other Gemini error does not move to the paid route", async (context) => {
  const requests = fakeFetch(context, [{ status: 400, body: "bad request" }, OPENROUTER_OK]);
  await assert.rejects(embed("some text", { gemini: "gem-key", openrouter: "or-key" }), /Gemini embedding 400/);
  assert.equal(requests.length, 1);
});

test("the question lists every shortlisted claim by id, and a none-of-these option", () => {
  const story = (pickQuestion(CANDIDATES) as any).story;
  assert.equal(story.type, "choice");
  assert.deepEqual(Object.keys(story.criteria), ["claim_7", "claim_12", NONE_OF_THESE]);
  assert.equal(story.criteria.claim_7, "Testov is booked against Rivalov");
});

test("an empty shortlist starts a new claim with full confidence and makes no call", async (context) => {
  const requests = fakeFetch(context, [jevAnswer("claim_7", 0.9)]);
  const result = await pickClaim(ARTICLE, [], "jev-key");
  assert.deepEqual(result, { pick: { claim: null, confidence: 1 }, raw: null });
  assert.equal(requests.length, 0);
});

test("a chosen claim id and JEV's confidence become the pick", async (context) => {
  fakeFetch(context, [jevAnswer("claim_12", 0.83)]);
  const result = await pickClaim(ARTICLE, CANDIDATES, "jev-key");
  assert.deepEqual(result.pick, { claim: 12, confidence: 0.83 });
});

test("the whole JEV reply is handed back beside the pick", async (context) => {
  const reply = jevAnswer("claim_7", 0.9);
  fakeFetch(context, [reply]);
  const result = await pickClaim(ARTICLE, CANDIDATES, "jev-key");
  assert.deepEqual(result.raw, reply.body);
});

test("none_of_these becomes a null claim, meaning a new claim starts", async (context) => {
  fakeFetch(context, [jevAnswer(NONE_OF_THESE, 0.7)]);
  const result = await pickClaim(ARTICLE, CANDIDATES, "jev-key");
  assert.deepEqual(result.pick, { claim: null, confidence: 0.7 });
});

test("a pick that was not on the shortlist is an error, not a guess", async (context) => {
  fakeFetch(context, [jevAnswer("claim_99", 0.9)]);
  await assert.rejects(pickClaim(ARTICLE, CANDIDATES, "jev-key"), /claim_99.*not on the shortlist/);
});

test("the JEV request carries the key, the fighter, the date and the extract's sentence", async (context) => {
  const requests = fakeFetch(context, [jevAnswer("claim_7", 0.9)]);
  await pickClaim(ARTICLE, CANDIDATES, "jev-key");
  assert.equal(requests[0].url, JEV_ADDRESS);
  assert.equal(requests[0].headers.Authorization, "Bearer jev-key");
  assert.equal(requests[0].body.state.watched_fighter, "Marko Testov");
  assert.equal(requests[0].body.state.published, "2026-10-05");
  assert.equal(requests[0].body.state.this_article_in_one_sentence, EXTRACT.claim);
});
