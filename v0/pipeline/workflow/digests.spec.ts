// Covers workflow/digests.ts: when a fighter's digest is due, what is written
// and stored for it, and when it is posted. The writer model is replaced at the
// network, the database is a fake. Which claims the store selects for a digest
// is SQL (store/digests.ts) and is not run here; this spec checks what the
// workflow does with what the store hands back.

import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { splitMessage, writeAndPostDigest, digestsDue, RESEND_WINDOW_DAYS } from "./digests.ts";
import { previousDigestEnd } from "../store/digests.ts";
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

/** A live digest row as the store's "newest digest" query returns it. */
type SavedDigest = { id: number; text: string; posted_at: Date | null; created_at: Date };

/**
 * A database for digests: the claims the period holds, when each fighter's last digest ended, and his newest saved digest.
 *
 * @param previousEnds  Fighter → end of his last live digest; absent means none.
 * @param claimIds  The claims the period holds.
 * @param newestSaved  Fighter → his newest live digest row; absent means none.
 * @returns The fake database.
 */
function digestDatabase(previousEnds: Record<string, Date> = {}, claimIds: number[] = [], newestSaved: Record<string, SavedDigest> = {}) {
  const database = new FakeDatabase([FIGHTER]);
  database.on(/SELECT max\(period_end\) AS end FROM digests/, (params) => ({ rows: [{ end: previousEnds[params[0]] ?? null }] }));
  database.on(NEWEST_DIGEST_QUERY, (params) => ({ rows: newestSaved[params[0]] ? [newestSaved[params[0]]] : [] }));
  database.on(/FROM reading_now rn JOIN claim_now cn/, (params) => {
    const isThePeriod = params[2].getTime() === NOW.getTime();
    return { rows: isThePeriod ? claimIds.map(claimRow) : [] };
  });
  database.on(/WITH earlier AS/, () => ({ rows: [] }));
  return database;
}

// The store's question "which live digest of this fighter is the newest".
const NEWEST_DIGEST_QUERY = /FROM digests WHERE fighter = \$1 AND backfill = false ORDER BY period_end DESC, id DESC LIMIT 1/;

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

test("every part of a long digest is recorded with its number, so an emoji on any part reaches the digest", async () => {
  const database = digestDatabase();
  writerNetwork({ text: `${"a".repeat(3000)}\n\n${"b".repeat(3000)}`, items: [] });
  const context = makeContext(database);
  const digestId = await writeAndPostDigest(context, FIGHTER, PERIOD);
  const recorded = database.sent(/^INSERT INTO sent_messages/).map((query) => query.params);
  assert.deepEqual(recorded, [[5000, "digest", null, digestId, null, 1], [5001, "digest", null, digestId, null, 2]]);
});

test("a digest that only printed records no sent message", async () => {
  const database = digestDatabase();
  writerNetwork();
  await writeAndPostDigest(makeContext(database, { poster: async () => null }), FIGHTER, PERIOD);
  assert.equal(database.sent(/^INSERT INTO sent_messages/).length, 0);
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

test("a digest whose send fails is stored and left unmarked as posted", async () => {
  const database = digestDatabase();
  writerNetwork();
  const context = makeContext(database, { poster: async () => { throw new Error("Telegram 502"); } });
  await assert.rejects(writeAndPostDigest(context, FIGHTER, PERIOD), /Telegram 502/);
  assert.equal(database.inserted.digests.length, 1);
  assert.equal(database.sent(/UPDATE digests SET posted_at/).length, 0);
});

// A saved digest that failed to send counts as "where his last digest ended" on
// purpose: the next run re-sends that text instead of writing the week again.
// Why: docs/decisions.md#digest-resend
test("the previous digest is found among every live digest, sent or not, because an unsent one is re-sent, not rewritten", async () => {
  const database = new FakeDatabase();
  database.on(/SELECT max\(period_end\)/, () => ({ rows: [{ end: null }] }));
  await previousDigestEnd(database.pool, FIGHTER, false);
  const { sql, params } = database.queries[0];
  assert.deepEqual(params, [FIGHTER, false]);
  assert.doesNotMatch(sql, /posted_at/);
});

test("a digest that goes out in parts and fails on a later part is stored without a message id", async () => {
  const database = digestDatabase();
  writerNetwork({ text: `${"a".repeat(3000)}\n\n${"b".repeat(3000)}`, items: [] });
  let sent = 0;
  const context = makeContext(database, {
    poster: async () => {
      sent += 1;
      if (sent === 2) throw new Error("Telegram 502");
      return 5000;
    },
  });
  await assert.rejects(writeAndPostDigest(context, FIGHTER, PERIOD), /Telegram 502/);
  assert.equal(sent, 2);
  assert.equal(database.sent(/UPDATE digests SET posted_at/).length, 0);
});

/**
 * A digest row saved but never sent.
 *
 * @param overrides  Any fields to change.
 * @returns The row.
 */
function unsentDigest(overrides: Partial<SavedDigest> = {}): SavedDigest {
  return { id: 77, text: "Saved but never sent.", posted_at: null, created_at: new Date(NOW.getTime() - 3_600_000), ...overrides };
}

const DAY = 86_400_000;
const LAST_END = new Date("2026-10-26T14:30:00Z");

test("a digest saved but never sent is sent on a later run from its saved text, without asking the writer again", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest() });
  const requests = writerNetwork();
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.deepEqual(context.messages, ["<b>Marko Testov: the week</b>\n\nSaved but never sent."]);
  assert.equal(requests.length, 0);
  assert.equal(database.inserted.digests, undefined);
});

test("a re-sent digest is marked posted with its first message's id, and counted as re-sent and posted", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest({ id: 77 }) });
  writerNetwork();
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.deepEqual(database.sent(/UPDATE digests SET posted_at/)[0].params, [5000, 77]);
  assert.equal(context.tally.digests_resent, 1);
  assert.equal(context.tally.digests_posted, 1);
});

test("a digest that was already sent is never sent again", async () => {
  const sent = unsentDigest({ posted_at: new Date(NOW.getTime() - 60_000) });
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: sent });
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.deepEqual(context.messages, []);
  assert.equal(database.sent(/UPDATE digests SET posted_at/).length, 0);
});

test("an unsent digest is re-sent just inside the window and left alone just outside it", async () => {
  const insideAge = new Date(NOW.getTime() - RESEND_WINDOW_DAYS * DAY + 60_000);
  const inside = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest({ created_at: insideAge }) });
  const insideContext = makeContext(inside);
  await digestsDue(insideContext, NOW);
  assert.equal(insideContext.messages.length, 1);

  const outsideAge = new Date(NOW.getTime() - RESEND_WINDOW_DAYS * DAY - 60_000);
  const outside = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest({ created_at: outsideAge }) });
  const outsideContext = makeContext(outside);
  await digestsDue(outsideContext, NOW);
  assert.deepEqual(outsideContext.messages, []);
});

test("only the fighter's newest live digest is looked at, so an older unsent one is never re-sent", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END });
  await digestsDue(makeContext(database), NOW);
  const lookups = database.sent(NEWEST_DIGEST_QUERY);
  assert.equal(lookups.length, 1);
  assert.deepEqual(lookups[0].params, [FIGHTER]);
});

test("a saved digest with no text is not sent", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest({ text: "  \n" }) });
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.deepEqual(context.messages, []);
});

test("a run that only prints re-sends nothing, because there is nothing to send with", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest() });
  const context = makeContext(database, { sends: false });
  await digestsDue(context, NOW);
  assert.deepEqual(context.messages, []);
  assert.equal(context.tally.digests_resent, undefined);
});

test("a long digest that is re-sent goes out whole again, so a part that already arrived appears twice", async () => {
  const text = `${"a".repeat(3000)}\n\n${"b".repeat(3000)}`;
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest({ text }) });
  const context = makeContext(database);
  await digestsDue(context, NOW);
  assert.equal(context.messages.length, 2);
  assert.deepEqual(database.sent(/UPDATE digests SET posted_at/)[0].params, [5000, 77]);
});

test("a re-send that fails is counted failed, leaves the digest unsent for the next run, and writes nothing new", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest() });
  const requests = writerNetwork();
  const failing = makeContext(database, { poster: async () => { throw new Error("Telegram 502"); } });
  await digestsDue(failing, NOW);
  assert.equal(failing.tally.digests_failed, 1);
  assert.equal(failing.tally.digests_posted, undefined);
  assert.equal(database.sent(/UPDATE digests SET posted_at/).length, 0);
  assert.equal(requests.length, 0);

  const nextRun = makeContext(database);
  await digestsDue(nextRun, NOW);
  assert.equal(nextRun.messages.length, 1);
});

test("when a re-send fails and the fighter is also due, no new digest is written over the unsent one", async () => {
  const database = digestDatabase({ [FIGHTER]: new Date("2026-10-19T15:00:00Z") }, [], { [FIGHTER]: unsentDigest() });
  const requests = writerNetwork();
  const context = makeContext(database, { poster: async () => { throw new Error("Telegram 502"); } });
  await digestsDue(context, NOW);
  assert.equal(requests.length, 0);
  assert.equal(database.inserted.digests, undefined);
  assert.equal(context.tally.digests_failed, 1);
});

test("one fighter's failed re-send does not stop another fighter's digest", async () => {
  const database = digestDatabase({ [FIGHTER]: LAST_END }, [], { [FIGHTER]: unsentDigest() });
  database.settings!.digest_schedule[OTHER_FIGHTER] = database.settings!.digest_schedule[FIGHTER];
  writerNetwork();
  const context = makeContext(database, {
    poster: async (text) => {
      if (text.includes("Saved but never sent")) throw new Error("Telegram 502");
      return 5000;
    },
  });
  await digestsDue(context, NOW);
  assert.equal(context.tally.digests_failed, 1);
  assert.deepEqual(database.inserted.digests.map((row) => row.params[0]), [OTHER_FIGHTER]);
});

test("a digest whose send failed is delivered by the next hourly run, once, and the run after sends nothing", async () => {
  const database = digestDatabase();
  const requests = writerNetwork();
  const firstRun = makeContext(database, { poster: async () => { throw new Error("Telegram 502"); } });
  await digestsDue(firstRun, NOW);
  assert.equal(firstRun.tally.digests_failed, 1);
  const [saved] = database.inserted.digests;

  // The database now holds what the first run saved: the end of that digest, and the row, still unsent.
  const later = new Date(NOW.getTime() + 3_600_000);
  database.on(/SELECT max\(period_end\) AS end FROM digests/, () => ({ rows: [{ end: saved.params[2] }] }));
  const row = () => ({ id: saved.id, text: saved.params[5], posted_at: database.sent(/UPDATE digests SET posted_at/).length ? later : null, created_at: NOW });
  database.on(NEWEST_DIGEST_QUERY, () => ({ rows: [row()] }));
  const secondRun = makeContext(database);
  await digestsDue(secondRun, later);
  assert.deepEqual(secondRun.messages, ["<b>Marko Testov: the week</b>\n\nA short digest."]);

  const thirdRun = makeContext(database);
  await digestsDue(thirdRun, new Date(later.getTime() + 3_600_000));
  assert.deepEqual(thirdRun.messages, []);
  assert.equal(requests.length, 1);
  assert.equal(database.inserted.digests.length, 1);
});
