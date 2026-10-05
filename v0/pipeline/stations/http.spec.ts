import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson, DailyLimitError } from "./http.ts";

/**
 * Replaces fetch for one test with replies given in order, counting calls.
 *
 * @param replies  Each call's status and body.
 * @returns How many calls were made, read after the test.
 */
function fakeFetch(replies: { status: number; body: string }[]): { calls: number } {
  const seen = { calls: 0 };
  globalThis.fetch = (async () => {
    const reply = replies[Math.min(seen.calls, replies.length - 1)];
    seen.calls += 1;
    return new Response(reply.body, { status: reply.status });
  }) as typeof fetch;
  return seen;
}

test("a spent daily allowance is not retried", async () => {
  const seen = fakeFetch([{ status: 429, body: '{"quotaId":"EmbedContentRequestsPerDayPerProjectPerModel-FreeTier"}' }]);
  await assert.rejects(postJson("https://x.example", {}, {}, 1000, "Gemini"), DailyLimitError);
  assert.equal(seen.calls, 1);
});

test("a busy server is tried again, and its later answer used", async () => {
  const seen = fakeFetch([{ status: 503, body: "busy" }, { status: 200, body: '{"ok":true}' }]);
  assert.deepEqual(await postJson("https://x.example", {}, {}, 1000, "JEV"), { ok: true });
  assert.equal(seen.calls, 2);
});

test("any other refusal is final at once", async () => {
  const seen = fakeFetch([{ status: 401, body: "bad key" }]);
  await assert.rejects(postJson("https://x.example", {}, {}, 1000, "JEV"), /JEV 401: bad key/);
  assert.equal(seen.calls, 1);
});
