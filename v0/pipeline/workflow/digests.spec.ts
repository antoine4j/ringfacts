// Covers workflow/digests.ts: when a fighter's digest is due, what is written
// and stored for it, and when it is posted. The writer model is replaced at the
// network, the database is a fake. Which claims the store selects for a digest
// is SQL (store/digests.ts) and is not run here; this spec checks what the
// workflow does with what the store hands back.

import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { splitMessage, writeAndPostDigest, digestsDue } from "./digests.ts";
import { DIGEST_PROMPT_VERSION, DEFAULT_DIGEST_MODEL } from "../stations/digest/digest.ts";
import { FakeDatabase, makeContext, stubNetwork, type SeenRequest } from "./fake-database.ts";

const FIGHTER = "Marko Testov";
const OTHER_FIGHTER = "Ivan Rivalov";
// Monday 08:00 Pacific; the schedule's Monday 07:00 Pacific was an hour ago.
const NOW = new Date("2026-10-26T15:00:00Z");
const SCHEDULED_MOMENT = new Date("2026-10-26T14:00:00Z");

// The writer's model is reached through this key; the network is replaced, so it is never sent anywhere.
process.env.OPENROUTER_API_KEY = "openrouter-key";

let restoreNetwork = () => {};
afterEach(() => {
  restoreNetwork();
  mock.timers.reset();
});

/**
 * Makes the writer model answer with a digest, and returns the requests it was sent.
 *
 * @param reply  What the model says; an object is sent as JSON.
 * @param cost  The dollars OpenRouter reports.
 * @returns The requests seen.
 */
function writerNetwork(reply: unknown = { text: "A short digest.", items: [] }, cost = 0.0042): SeenRequest[] {
  const content = typeof reply === "string" ? reply : JSON.stringify(reply);
  const stub = stubNetwork(() => ({
    body: {
      id: "completion", object: "chat.completion", created: 1, model: "m",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost },
    },
  }));
  restoreNetwork = stub.restore;
  return stub.requests;
}

/**
 * A claim row as the store's query returns it.
 *
 * @param claimId  The claim's id.
 * @returns The row.
 */
function claimRow(claimId: number) {
  return {
    claim_id: claimId, current_label: `Claim ${claimId}`, label: `Claim ${claimId}`, readings: 2, outlets: 2, best_tier: 1, posted: true,
    first_published: new Date("2026-10-20T10:00:00Z"), last_published: new Date("2026-10-21T10:00:00Z"), posted_reading_id: null,
    articles: [{ sentence: "A sentence.", outlet: "Example", date: "2026-10-20", url: "https://example.com/a", tier: 1 }],
  };
}

/**
 * A database for digests: the claims the period holds, and when each fighter's last digest ended.
 *
 * @param previousEnds  Fighter → end of his last live digest; absent means none.
 * @param claimIds  The claims the period holds.
 * @returns The fake database.
 */
function digestDatabase(previousEnds: Record<string, Date> = {}, claimIds: number[] = []) {
  const database = new FakeDatabase([FIGHTER]);
  database.on(/SELECT max\(period_end\) AS end FROM digests/, (params) => ({ rows: [{ end: previousEnds[params[0]] ?? null }] }));
  database.on(/FROM reading_now rn JOIN claim_now cn/, (params) => {
    const isThePeriod = params[2].getTime() === NOW.getTime();
    return { rows: isThePeriod ? claimIds.map(claimRow) : [] };
  });
  database.on(/WITH earlier AS/, () => ({ rows: [] }));
  return database;
}

const PERIOD = { start: new Date("2026-10-19T14:00:00Z"), end: NOW };

test("a short message is one part", () => {
  assert.deepEqual(splitMessage("one\n\ntwo"), ["one\n\ntwo"]);
});

test("a long message is split at paragraph breaks, each part within Telegram's limit, nothing lost", () => {
  const paragraphs = ["a".repeat(2500), "b".repeat(2500), "c".repeat(100)];
  const parts = splitMessage(paragraphs.join("\n\n"));
  assert.deepEqual(parts, [paragraphs[0], `${paragraphs[1]}\n\n${paragraphs[2]}`]);
  assert.ok(parts.every((part) => part.length <= 4000));
});

test("two paragraphs that join to 4,000 characters stay together, and to 4,001 are split", () => {
  assert.equal(splitMessage(`${"a".repeat(2000)}\n\n${"b".repeat(1998)}`).length, 1);
  assert.equal(splitMessage(`${"a".repeat(2000)}\n\n${"b".repeat(1999)}`).length, 2);
});

test("a message of exactly 4,000 characters stays whole", () => {
  assert.equal(splitMessage("x".repeat(4000)).length, 1);
});

test("a single paragraph over the limit is cut at 4,000 characters", () => {
  const parts = splitMessage("x".repeat(4500));
  assert.equal(parts.length, 1);
  assert.equal(parts[0].length, 4000);
});

test("a digest is written, stored with the model and prompt version, and posted under the fighter's name", async () => {
  const database = digestDatabase();
  writerNetwork({ text: "A short digest.", items: [] });
  const context = makeContext(database);
  const digestId = await writeAndPostDigest(context, FIGHTER, PERIOD);
  const [stored] = database.inserted.digests;
  assert.equal(digestId, stored.id);
  assert.equal(stored.params[0], FIGHTER);
  assert.deepEqual(stored.params[1], PERIOD.start);
  assert.deepEqual(stored.params[2], PERIOD.end);
  assert.equal(stored.params[3], DEFAULT_DIGEST_MODEL);
  assert.equal(stored.params[4], DIGEST_PROMPT_VERSION);
  assert.equal(stored.params[5], "A short digest.");
  assert.deepEqual(context.messages, ["<b>Marko Testov: the week</b>\n\nA short digest."]);
});

test("the writer is sent the fighter, the period and the claims the store gathered", async () => {
  const database = digestDatabase({}, [41]);
  const requests = writerNetwork();
  await writeAndPostDigest(makeContext(database), FIGHTER, PERIOD);
  const sent = JSON.stringify(requests[0].body.messages);
  assert.match(sent, /Marko Testov/);
  assert.match(sent, /2026-10-19/);
  assert.match(sent, /Claim 41/);
});

test("every claim the writer was given is stored, marked used only if the digest drew on it", async () => {
  const database = digestDatabase({}, [41, 42]);
  writerNetwork({ text: "About one claim.", items: [{ title: "One", claims: [41], links: [] }] });
  await writeAndPostDigest(makeContext(database), FIGHTER, PERIOD);
  const links = database.inserted.digest_claims.map((row) => [row.params[1], row.params[2]]);
  assert.deepEqual(links, [[41, true], [42, false]]);
});

test("posting records the first message's id on the digest, and counts the digest written and posted", async () => {
  const database = digestDatabase();
  writerNetwork();
  const context = makeContext(database);
  const digestId = await writeAndPostDigest(context, FIGHTER, PERIOD);
  const [marked] = database.sent(/UPDATE digests SET posted_at/);
  assert.deepEqual(marked.params, [5000, digestId]);
  assert.equal(context.tally.digests_written, 1);
  assert.equal(context.tally.digests_posted, 1);
});

test("the model's cost is counted in whole microdollars", async () => {
  const database = digestDatabase();
  writerNetwork({ text: "A short digest.", items: [] }, 0.0042);
  const context = makeContext(database);
  await writeAndPostDigest(context, FIGHTER, PERIOD);
  assert.equal(context.tally.openrouter_cost_microdollars, 4200);
});

test("a digest too long for one message is posted in parts, and the first part's id is kept", async () => {
  const database = digestDatabase();
  writerNetwork({ text: `${"a".repeat(3000)}\n\n${"b".repeat(3000)}`, items: [] });
  const context = makeContext(database);
  const digestId = await writeAndPostDigest(context, FIGHTER, PERIOD);
  assert.equal(context.messages.length, 2);
  assert.deepEqual(database.sent(/UPDATE digests SET posted_at/)[0].params, [5000, digestId]);
});

test("a run on history stores the digest but never posts it", async () => {
  const database = digestDatabase();
  writerNetwork();
  const context = makeContext(database, { backfill: true });
  await writeAndPostDigest(context, FIGHTER, PERIOD);
  assert.equal(database.inserted.digests.length, 1);
  assert.equal(database.inserted.digests[0].params[8], true);
  assert.deepEqual(context.messages, []);
  assert.equal(context.tally.digests_written, 1);
  assert.equal(context.tally.digests_posted, undefined);
});

test("a digest that was only printed is stored but not marked posted", async () => {
  const database = digestDatabase();
  writerNetwork();
  const context = makeContext(database, { poster: async () => null });
  await writeAndPostDigest(context, FIGHTER, PERIOD);
  assert.equal(database.inserted.digests.length, 1);
  assert.equal(database.sent(/UPDATE digests SET posted_at/).length, 0);
  assert.equal(context.tally.digests_posted, undefined);
});

test("a digest due now is written for the period from a week before the schedule to now when he has none yet", async () => {
  const database = digestDatabase();
  const requests = writerNetwork();
  const context = makeContext(database);
  await digestsDue(context, NOW);
  const stored = database.inserted.digests[0].params;
  assert.deepEqual(stored[1], new Date(SCHEDULED_MOMENT.getTime() - 7 * 86_400_000));
  assert.deepEqual(stored[2], NOW);
  assert.equal(requests.length, 1);
});

test("a digest due after an earlier one covers the time since that one ended", async () => {
  const previousEnd = new Date("2026-10-19T15:00:00Z");
  const database = digestDatabase({ [FIGHTER]: previousEnd });
  writerNetwork();
  await digestsDue(makeContext(database), NOW);
  assert.deepEqual(database.inserted.digests[0].params[1], previousEnd);
});

test("no digest is written when the last one already ended after the schedule's moment", async () => {
  const database = digestDatabase({ [FIGHTER]: new Date("2026-10-26T14:30:00Z") });
  const requests = writerNetwork();
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.equal(requests.length, 0);
  assert.equal(database.inserted.digests, undefined);
  assert.deepEqual(context.messages, []);
  assert.equal(context.tally.digests_failed, undefined);
  assert.equal(context.tally.digests_waiting, undefined);
});

test("a fighter's last digest is looked up among live digests, not history", async () => {
  const database = digestDatabase();
  writerNetwork();
  await digestsDue(makeContext(database), NOW);
  assert.deepEqual(database.sent(/max\(period_end\)/)[0].params, [FIGHTER, false]);
});

test("no digest is written before the schedule's moment this week", async () => {
  const database = digestDatabase({ [FIGHTER]: new Date("2026-10-19T15:00:00Z") });
  const requests = writerNetwork();
  await digestsDue(makeContext(database), new Date("2026-10-26T13:59:00Z"));
  assert.equal(requests.length, 0);
});

test("only the fighters whose schedule says now get a digest", async () => {
  const database = digestDatabase({ [OTHER_FIGHTER]: new Date("2026-10-26T14:30:00Z") });
  database.settings!.digest_schedule[OTHER_FIGHTER] = database.settings!.digest_schedule[FIGHTER];
  writerNetwork();
  await digestsDue(makeContext(database), NOW);
  assert.deepEqual(database.inserted.digests.map((row) => row.params[0]), [FIGHTER]);
});

test("every fighter who is due gets his own digest, each posted under his name", async () => {
  const database = digestDatabase();
  database.settings!.digest_schedule[OTHER_FIGHTER] = database.settings!.digest_schedule[FIGHTER];
  writerNetwork();
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.deepEqual(database.inserted.digests.map((row) => row.params[0]).sort(), [OTHER_FIGHTER, FIGHTER].sort());
  assert.equal(context.messages.length, 2);
  assert.ok(context.messages.some((message) => message.startsWith("<b>Ivan Rivalov: the week</b>")));
});

test("with under two minutes left before the deadline no digest is started, and the wait is counted", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const database = digestDatabase();
  const requests = writerNetwork();
  const context = makeContext(database, { deadline: Date.now() + 119_999 });
  await digestsDue(context, NOW);
  assert.equal(requests.length, 0);
  assert.equal(context.tally.digests_waiting, 1);
  assert.equal(database.inserted.digests, undefined);
});

test("with exactly two minutes left a digest is started", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const database = digestDatabase();
  writerNetwork();
  const context = makeContext(database, { deadline: Date.now() + 120_000 });
  await digestsDue(context, NOW);
  assert.equal(database.inserted.digests.length, 1);
  assert.equal(context.tally.digests_waiting, undefined);
});

test("a digest the writer fails on is counted failed, stores nothing, and does not throw", async () => {
  const database = digestDatabase();
  writerNetwork("this is not JSON");
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.equal(context.tally.digests_failed, 1);
  assert.equal(database.inserted.digests, undefined);
  assert.deepEqual(context.messages, []);
});

test("one fighter's failed digest does not stop another's", async () => {
  const database = digestDatabase();
  database.settings!.digest_schedule[OTHER_FIGHTER] = database.settings!.digest_schedule[FIGHTER];
  const stub = stubNetwork((request) => {
    const isForOther = JSON.stringify(request.body).includes(OTHER_FIGHTER);
    const content = isForOther ? "not JSON" : JSON.stringify({ text: "A short digest.", items: [] });
    return { body: { id: "c", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } };
  });
  restoreNetwork = stub.restore;
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.equal(context.tally.digests_failed, 1);
  assert.deepEqual(database.inserted.digests.map((row) => row.params[0]), [FIGHTER]);
  assert.equal(context.messages.length, 1);
});

test("a failed digest leaves the fighter still due on the next run", async () => {
  const database = digestDatabase();
  writerNetwork("this is not JSON");
  await digestsDue(makeContext(database), NOW);
  restoreNetwork();
  const requests = writerNetwork();
  await digestsDue(makeContext(database), NOW);
  assert.equal(requests.length, 1);
  assert.equal(database.inserted.digests.length, 1);
});
