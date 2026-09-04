// The pipeline (tier 2). Drives the real huntSubject end to end and asserts
// what came out of it: what posted, what was held and why, what reached the
// group and in what shape.
//
// Nothing here touches the network, a database, or an API key. The matcher and
// the embedder are scripted, which is the point — TODO.md records four runs of
// byte-identical code returning NO_CLAIM x3 and NEW x1, so a suite that
// asserted on live matcher output would flake until nobody trusted it. Real
// matcher behaviour is measured separately, as a pass rate, not asserted here.
//
// Items are fed in as `directItems` with a subject that has no aliases, so no
// Google feed is ever fetched — and they route through matchesSubject on the
// way in, which means the name filter is exercised by every test below.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { huntSubject } from "../hunter.js";
import * as realStore from "../lib/db.js";
import { createFakeStore, vectorsWithSimilarity, vectorAt, assertStoreInterfaceMatches } from "./fake-store.js";

const SUBJECT = { name: "Testov Example", aliases: [], matchNames: ["Testov"], confusables: null };
const DB = { fake: true }; // stands in for the pg client; only the store touches it

// A body long enough for the tier rule to judge (MIN_BODY_FOR_JUDGEMENT = 300)
// carrying exactly `mentions` mentions of the subject.
function bodyWith(mentions) {
  const pad =
    "The division continued to reshuffle through the back half of the season as contenders " +
    "waited on bookings that made sense for everyone involved, and the report walked through " +
    "the standings one place at a time without much in the way of genuinely new information. ";
  return pad + Array.from({ length: mentions }, (_, i) => `Testov appears here, instance ${i}. `).join("") + pad;
}

let sent; // every Telegram message the run tried to send

function makeItem(over = {}) {
  const mentions = over.mentions ?? 4;
  delete over.mentions;
  return {
    title: "Testov books a return for March",
    url: `https://example.test/${Math.random().toString(36).slice(2)}`,
    source: "MMA Fighting",
    edition: "en",
    foundVia: "direct mmafighting",
    rssDescription: null,
    publishedAt: new Date(Date.now() - 3 * 3_600_000),
    feedContent: `<p>${bodyWith(mentions)}</p>`,
    ...over,
  };
}

// Defaults describe the boring world: embeddings all identical-but-distant,
// matcher says nothing claim-worthy, Telegram records instead of sending.
function deps(over = {}) {
  return {
    store: over.store,
    embedTexts: over.embedTexts ?? (async (texts) => texts.map(() => [1, 0])),
    matchItem: over.matchItem ?? (async () => ({ verdict: "NO_CLAIM" })),
    // No decode and no fetch: every fixture carries feedContent, so rung 0
    // fires and the body step never reaches the network.
    decodeGoogleNewsUrl: over.decodeGoogleNewsUrl ?? (async (url) => url),
    translate: over.translate ?? (async (t) => `EN(${t})`),
    sendMessage: over.sendMessage ?? (async (chatId, text) => {
      sent.push({ chatId, text });
      return 5000 + sent.length; // a Telegram message id
    }),
    dryRun: over.dryRun ?? false,
    chatId: "-100TEST",
    matcherEnabled: over.matcherEnabled ?? true,
    hoursBack: 24,
    ...(over.extra ?? {}),
  };
}

const digest = () => sent.find((m) => m.text.startsWith("🔎"));

beforeEach(() => { sent = []; });

test("the fake store answers everything lib/db.js exports", async () => {
  await assertStoreInterfaceMatches(realStore);
});

// Every test in this file SUPPLIES its dependencies, which means none of them
// exercise the defaults — and a default that is merely misnamed fails open and
// stays quiet. That is not hypothetical: the deps object was first written with
// `translateToEnglish` as object shorthand while the call site read
// `deps.translate`, so every non-English headline silently posted untranslated.
// The pipeline tests all passed. A DRY_RUN against live feeds found it.
//
// So the wiring is checked at the source level: every `deps.X` the hunter
// reaches for must be a key the deps object actually defines. Reading the file
// is unusual for a test, but this is the one bug class the seam introduced and
// nothing else catches it without paying for real network calls.
describe("the deps seam is wired to itself", () => {
  test("every deps.X used in hunter.js is a key buildDeps defines", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../hunter.js", import.meta.url), "utf8");

    const literal = src.match(/function buildDeps\([^)]*\) \{\n  return \{([\s\S]*?)\n  \};/);
    assert.ok(literal, "could not find the literal buildDeps returns — has the seam been restructured?");
    const defined = new Set(
      [...literal[1].matchAll(/^\s{4}(?:\.\.\.\w+|(\w+))\s*[:,]/gm)].map((m) => m[1]).filter(Boolean)
    );

    const used = new Set([...src.matchAll(/\bdeps\.(\w+)/g)].map((m) => m[1]));
    const undefinedKeys = [...used].filter((k) => !defined.has(k));
    assert.deepEqual(
      undefinedKeys,
      [],
      `hunter.js calls deps.${undefinedKeys.join(", deps.")} but the deps object never defines it`
    );
  });
});

describe("gate 1 — URLs already seen", () => {
  test("a stored URL is never reconsidered", async () => {
    const store = createFakeStore({ items: [{ url: "https://example.test/old", subject: SUBJECT.name }] });
    await huntSubject(DB, SUBJECT, [makeItem({ url: "https://example.test/old" })], deps({ store }));
    assert.equal(sent.length, 0, "nothing should be sent");
    assert.equal(store.rows.items.length, 1, "no new row should be written");
  });

  // The dual identity. A direct feed's real URL and a Google item's decoded URL
  // are the same address arriving from two discovery sources; matching on `url`
  // alone would post the same story twice.
  test("a URL already stored under resolved_url is also known", async () => {
    const store = createFakeStore({
      items: [{ url: "https://news.google.test/wrapped", resolved_url: "https://example.test/real", subject: SUBJECT.name }],
    });
    await huntSubject(DB, SUBJECT, [makeItem({ url: "https://example.test/real" })], deps({ store }));
    assert.equal(sent.length, 0);
  });

  // The cutoff is what stops a re-run from re-reading a whole week of feed.
  // Found missing by a mutation check: flipping HOURS_BACK broke no test,
  // because every case above pins it explicitly.
  test("an item older than the window is dropped before any gate runs", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ publishedAt: new Date(Date.now() - 30 * 3_600_000) })], deps({ store }));
    assert.equal(sent.length, 0);
    assert.equal(store.rows.items.length, 0);
  });

  test("an item inside the window survives it", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ publishedAt: new Date(Date.now() - 23 * 3_600_000) })], deps({ store }));
    assert.equal(sent.length, 1);
  });

  test("the flood cap holds back the overflow for the next run, newest first", async () => {
    const store = createFakeStore();
    const items = Array.from({ length: 8 }, (_, i) =>
      makeItem({ title: `Testov story ${i}`, publishedAt: new Date(Date.now() - i * 3_600_000) })
    );
    // Every item distinct enough not to trip the dup gate.
    await huntSubject(DB, SUBJECT, items, deps({ store, embedTexts: async (t) => t.map((_, i) => [Math.cos(i), Math.sin(i)]) }));
    assert.equal(store.rows.items.length, 5, "MAX_ITEMS_PER_SUBJECT is 5");
    assert.equal(store.rows.items[0].title, "Testov story 0", "newest first");
  });
});

describe("gate 2 — semantic duplicates", () => {
  // The threshold is 0.80, measured: a translated pair sat at 0.841, unrelated
  // same-subject pairs topped out at 0.702. Both sides of the line are pinned.
  test("above 0.80 the item is held, not posted, and inherits its neighbour's claim", async () => {
    const [stored, incoming] = vectorsWithSimilarity(0.84);
    const store = createFakeStore({
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Testov books a return", embedding: stored, posted: true }],
      claims: [{ subject: SUBJECT.name, type: "announcement", canonical_text: "Testov returns in March", embedding: stored }],
      claimSources: [{ item_id: "1", claim_id: "1", role: "origin", stance: "asserts" }],
    });
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [incoming] }));

    assert.equal(sent.length, 0, "a held duplicate reaches nobody");
    const held = store.rows.items.at(-1);
    assert.equal(held.posted, false);
    assert.equal(held.held_reason, "embedding");
    assert.equal(store.sourcesOf("1").length, 2, "the held item is linked as evidence");
    assert.equal(store.sourcesOf("1").at(-1).role, "echo");
  });

  test("below 0.80 the item posts", async () => {
    const [stored, incoming] = vectorsWithSimilarity(0.79);
    const store = createFakeStore({
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Something else", embedding: stored, posted: true }],
    });
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [incoming] }));
    assert.equal(sent.length, 1);
    assert.match(digest().text, /Testov books a return/);
  });

  // The exemption exists because an official confirmation headline is BY
  // CONSTRUCTION near-identical to the rumor it confirms — holding it here
  // would swallow the rumor -> confirmed transition, the one edge the claims
  // layer exists to catch.
  test("an official source above the threshold is exempted and reaches the matcher", async () => {
    const [stored, incoming] = vectorsWithSimilarity(0.95);
    const store = createFakeStore({
      items: [{ url: "https://example.test/rumor", subject: SUBJECT.name, title: "Testov targeted for March", embedding: stored, posted: true }],
      claims: [{ subject: SUBJECT.name, type: "announcement", canonical_text: "Testov fights in March", status: "rumor", embedding: stored }],
      claimSources: [{ item_id: "1", claim_id: "1", role: "origin", stance: "asserts" }],
    });
    let sawMatcher = false;
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      embedTexts: async () => [incoming],
      matchItem: async () => { sawMatcher = true; return { verdict: "MATCH", match_claim_id: "1", stance: "asserts" }; },
    }));
    assert.ok(sawMatcher, "official items must reach the matcher despite the dup gate");
    assert.equal(store.rows.claims[0].status, "confirmed", "official MATCH flips rumor -> confirmed");
    assert.ok(sent.some((m) => m.text.startsWith("✅")), "a confirmation is posted");
  });

  // The exemption is a deferral, not a waiver. If the matcher produced nothing
  // to act on, the reason to skip the gate is gone — otherwise a matcher outage
  // turns every official echo into a duplicate post.
  for (const verdict of ["UNSURE", "NO_CLAIM"]) {
    test(`an official duplicate is re-held when the matcher says ${verdict}`, async () => {
      const [stored, incoming] = vectorsWithSimilarity(0.95);
      const store = createFakeStore({
        items: [{ url: "https://example.test/rumor", subject: SUBJECT.name, title: "Testov targeted", embedding: stored, posted: true }],
      });
      await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
        store, embedTexts: async () => [incoming], matchItem: async () => ({ verdict }),
      }));
      assert.equal(sent.length, 0, "the re-applied gate holds it");
      assert.equal(store.rows.items.at(-1).posted, false);
    });
  }

  // The deferral ends the other way too: when the matcher DOES find something
  // to act on, the claim outranks the embedding echo and the item posts.
  test("an official duplicate posts when the matcher mints a new claim", async () => {
    const [stored, incoming] = vectorsWithSimilarity(0.95);
    const store = createFakeStore({
      items: [{ url: "https://example.test/rumor", subject: SUBJECT.name, title: "Testov targeted", embedding: stored, posted: true }],
    });
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      embedTexts: async () => [incoming],
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "quote", sourcing: "reported", canonical_text: "Testov says he wants March", facts: {} },
      }),
    }));
    assert.equal(sent.length, 1, "the item posts despite the embedding echo");
    assert.equal(store.rows.items.at(-1).posted, true);
  });

  // Inheriting a neighbour's claim is how a held duplicate earns its place in
  // the evidence record without paying for an LLM call. The positive case is
  // pinned above; this is the guard against inheriting the wrong one.
  //
  // What the guard does NOT do, deliberately: it stops the bad claim link, not
  // the bad hold. The item is still never posted. That limitation is real and
  // recorded in docs/decisions.md#dup-threshold — this test pins today's
  // behaviour, it does not endorse it.
  test("a held duplicate is not credited to a claim it has drifted away from", async () => {
    const [neighbourVec, incomingVec] = vectorsWithSimilarity(0.84);

    // The incoming headline is a near-duplicate of a stored item belonging to
    // claim 1, but sits much closer to claim 2 — the signature of a dup chain
    // that has walked somewhere its starting claim never was.
    const store = createFakeStore({
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Testov books a return", embedding: neighbourVec, posted: true }],
      claims: [
        { subject: SUBJECT.name, type: "announcement", canonical_text: "Testov returns in March", embedding: neighbourVec },
        { subject: SUBJECT.name, type: "matchmaking", canonical_text: "Testov's manager blasts a rival", embedding: incomingVec },
      ],
      claimSources: [{ item_id: "1", claim_id: "1", role: "origin", stance: "asserts" }],
    });
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [incomingVec] }));

    assert.equal(store.rows.items.at(-1).held_reason, "embedding", "still held — the guard does not rescue it");
    assert.equal(store.sourcesOf("1").length, 1, "but not credited to the claim it drifted from");
    assert.equal(store.sourcesOf("2").length, 0, "and not silently reassigned to the closer one either");
  });

  // The chain-break, pinned. Held articles used to be comparison anchors, so
  // holds chained — B held for resembling A, C for resembling B — and clusters
  // drifted away from the story they started on (a live 0.802 -> 0.869 ->
  // 0.974 chain blocked genuinely different news). Now only POSTED articles
  // anchor the gate. History: docs/decisions.md#posted-anchors
  describe("held articles are not anchors", () => {
    // A at 0°, B at 33°, C at 66°: adjacent pairs are 0.84-similar (dup),
    // A and C only 0.41 (different stories).
    const [vecA, vecB] = [vectorAt(0), vectorAt(33)];
    const vecC = vectorAt(66);

    test("an article resembling only a HELD item posts — the chain cannot grow", async () => {
      const store = createFakeStore({
        items: [
          { url: "https://example.test/a", subject: SUBJECT.name, title: "Testov books a return", embedding: vecA, posted: true },
          { url: "https://example.test/b", subject: SUBJECT.name, title: "Testov books return, say sources", embedding: vecB, posted: false, held_reason: "embedding" },
        ],
      });
      await huntSubject(DB, SUBJECT, [makeItem({ title: "Testov opens a gym in Kyiv" })], deps({ store, embedTexts: async () => [vecC] }));
      assert.equal(sent.length, 1, "resembling a held echo is not resembling the group's feed");
      assert.equal(store.rows.items.at(-1).posted, true);
    });

    test("an article resembling a POSTED item is still held", async () => {
      const store = createFakeStore({
        items: [{ url: "https://example.test/a", subject: SUBJECT.name, title: "Testov books a return", embedding: vecA, posted: true }],
      });
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [vectorAt(33)] }));
      assert.equal(sent.length, 0, "the ordinary duplicate case is unchanged");
      assert.equal(store.rows.items.at(-1).held_reason, "embedding");
    });

    test("DUP_ANCHORS_ALL=1 restores held-as-anchor without a deploy", async () => {
      process.env.DUP_ANCHORS_ALL = "1";
      try {
        const store = createFakeStore({
          items: [
            { url: "https://example.test/a", subject: SUBJECT.name, title: "Testov books a return", embedding: vecA, posted: true },
            { url: "https://example.test/b", subject: SUBJECT.name, title: "Testov books return, say sources", embedding: vecB, posted: false, held_reason: "embedding" },
          ],
        });
        await huntSubject(DB, SUBJECT, [makeItem({ title: "Testov opens a gym in Kyiv" })], deps({ store, embedTexts: async () => [vecC] }));
        assert.equal(sent.length, 0, "the kill switch brings the old behaviour back");
      } finally {
        delete process.env.DUP_ANCHORS_ALL;
      }
    });

    // The look-back window, measured 2026-08-14: every echo arrived within 6
    // days of its posted anchor, so the window stays 7 days.
    test("an anchor older than the window no longer holds anything", async () => {
      const store = createFakeStore({
        items: [{
          url: "https://example.test/old", subject: SUBJECT.name, title: "Testov books a return",
          embedding: vecA, posted: true, seen_at: new Date(Date.now() - 8 * 24 * 3_600_000),
        }],
      });
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [vectorAt(33)] }));
      assert.equal(sent.length, 1, "an 8-day-old anchor is outside the 7-day window");
    });

    test("an anchor inside the window still holds", async () => {
      const store = createFakeStore({
        items: [{
          url: "https://example.test/recent", subject: SUBJECT.name, title: "Testov books a return",
          embedding: vecA, posted: true, seen_at: new Date(Date.now() - 6 * 24 * 3_600_000),
        }],
      });
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, embedTexts: async () => [vectorAt(33)] }));
      assert.equal(sent.length, 0);
    });
  });
});

describe("gate 3 — the matcher's verdicts", () => {
  test("WRONG_SUBJECT is recorded and never posted", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, matchItem: async () => ({ verdict: "WRONG_SUBJECT" }) }));
    assert.equal(sent.length, 0);
    assert.equal(store.rows.items[0].held_reason, "wrong_subject");
    assert.equal(store.rows.claims.length, 0, "and never becomes a claim");
  });

  test("NEW with a loud type posts as a rumor line and stores the claim", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "announcement", sourcing: "reported", canonical_text: "Testov fights in March", facts: {} },
      }),
    }));
    assert.match(digest().text, /🕵️ <b>Rumor:<\/b> Testov fights in March/);
    assert.equal(store.rows.claims[0].status, "rumor");
    // The claim remembers which message announced it, so a later confirmation
    // can reply into the same thread.
    assert.ok(store.rows.claims[0].tg_message_id, "the rumor post's message id is recorded");
  });

  test("an official NEW announcement is born confirmed and gets its own ceremony post", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "announcement", sourcing: "official", canonical_text: "Testov fights Rivalov in March", facts: {} },
      }),
    }));
    const ceremony = sent.find((m) => m.text.startsWith("🚨"));
    assert.ok(ceremony, "a confirmed announcement posts standalone");
    assert.match(ceremony.text, /Fight announced/);
    assert.equal(store.rows.claims[0].status, "confirmed");
  });

  // 'lifestyle' is in domain.ignoredTypes: recognised as a claim by the model,
  // treated as NO_CLAIM by the pipeline. It still posts as a plain line.
  test("an ignored claim type posts as an ordinary digest line and stores no claim", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "lifestyle", sourcing: "reported", canonical_text: "Testov opened a restaurant", facts: {} },
      }),
    }));
    assert.equal(store.rows.claims.length, 0);
    assert.match(digest().text, /^🔎/);
    assert.doesNotMatch(digest().text, /Rumor:/);
  });

  // Quote-grade claims get no line of their own — the digest IS their home
  // message, and the claim must remember it so a later confirmation can reply
  // into the right thread.
  test("a digest-riding claim records the digest as its home message", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "quote", sourcing: "reported", canonical_text: "Testov says he wants March", facts: {} },
      }),
    }));
    assert.match(digest().text, /^🔎/);
    assert.doesNotMatch(digest().text, /Rumor:/, "no rumor line — a quote is not loud");
    assert.equal(store.rows.claims[0].status, "rumor");
    assert.ok(store.rows.claims[0].tg_message_id, "the digest's message id lands on the claim");
  });

  // The conservative lifecycle, from the other side. The official MATCH above
  // flips rumor -> confirmed; this pins that an ordinary outlet saying the same
  // thing does NOT. Without it, dropping the `official &&` guard would start
  // firing confirmations off any outlet with the whole suite still green.
  test("a non-official MATCH is held as evidence and leaves the claim a rumor", async () => {
    const store = createFakeStore({
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Testov targeted for March" }],
      claims: [{ subject: SUBJECT.name, type: "announcement", canonical_text: "Testov fights in March", status: "rumor" }],
    });
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      matchItem: async () => ({ verdict: "MATCH", match_claim_id: "1", stance: "asserts" }),
    }));

    assert.equal(sent.length, 0, "a matched echo reaches nobody");
    const held = store.rows.items.at(-1);
    assert.equal(held.posted, false);
    assert.equal(held.held_reason, "llm");
    assert.equal(store.sourcesOf("1").at(-1).role, "echo", "recorded as evidence, not as an official source");
    assert.equal(store.rows.claims[0].status, "rumor", "only an official source confirms");
  });

  // A denial is evidence too, and it is the one official item that must not
  // confirm anything. Getting this backwards would announce a fight the sport's
  // own governing body just said was not happening.
  test("an official denial is recorded but confirms nothing", async () => {
    const store = createFakeStore({
      claims: [{ subject: SUBJECT.name, type: "announcement", canonical_text: "Testov fights in March", status: "rumor" }],
    });
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      matchItem: async () => ({ verdict: "MATCH", match_claim_id: "1", stance: "denies" }),
    }));

    assert.equal(store.rows.claims[0].status, "rumor", "a denial must never confirm");
    assert.equal(store.sourcesOf("1").at(-1).stance, "denies");
    assert.equal(store.sourcesOf("1").at(-1).role, "official", "still credited as official — it is the source that matters");
    assert.ok(!sent.some((m) => m.text.startsWith("✅")), "and no confirmation is announced");
  });

  // The visible half of the lifecycle: a confirmation is a reply under the
  // message that carried the rumor, not a new post nobody can place.
  test("a confirmation is threaded under the message that announced the rumor", async () => {
    const store = createFakeStore();
    const calls = [];

    // The default fake drops its options; this one keeps them, because replyTo
    // is the whole point of the test.
    const recording = async (chatId, text, options = {}) => {
      calls.push({ text, options });
      sent.push({ chatId, text });
      return 5000 + calls.length;
    };

    // Run 1: the rumor posts, and the claim remembers which message carried it.
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      sendMessage: recording,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "announcement", sourcing: "reported", canonical_text: "Testov fights in March", facts: {} },
      }),
    }));
    const rumorMessageId = store.rows.claims[0].tg_message_id;
    assert.ok(rumorMessageId, "the rumor's message id was recorded");

    // Run 2: an official source confirms it.
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      sendMessage: recording,
      matchItem: async () => ({ verdict: "MATCH", match_claim_id: "1", stance: "asserts" }),
    }));

    const confirmation = calls.find((c) => c.text.startsWith("✅"));
    assert.ok(confirmation, "a confirmation was sent");
    assert.equal(confirmation.options.replyTo, rumorMessageId, "and it replies into the rumor's thread");
  });

  // The confirmation's link must be the decoded publisher URL, not Google's
  // wrapper — the digest lines already do this via articleUrl, and the one
  // send site that didn't shipped a news.google.com redirect to the group
  // (Donchenko claim #11, 2026-08-31).
  test("a confirmation links the decoded article URL, not Google's wrapper", async () => {
    const store = createFakeStore();

    // Run 1: the rumor arrives and posts.
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "announcement", sourcing: "reported", canonical_text: "Testov fights in March", facts: {} },
      }),
    }));

    // Run 2: an official source confirms it, found via the Google rail — the
    // item's own url is the wrapper, and only the decode step knows the real one.
    const wrapped = "https://news.google.com/rss/articles/CBMiWRAPPED?oc=5";
    await huntSubject(DB, SUBJECT, [makeItem({ url: wrapped, source: "UFC" })], deps({
      store,
      decodeGoogleNewsUrl: async () => "https://www.ufc.com/news/testov-confirmed",
      matchItem: async () => ({ verdict: "MATCH", match_claim_id: "1", stance: "asserts" }),
    }));

    const confirmation = sent.find((m) => m.text.startsWith("✅"));
    assert.ok(confirmation, "a confirmation was sent");
    assert.ok(confirmation.text.includes("https://www.ufc.com/news/testov-confirmed"), "it links the publisher URL");
    assert.ok(!confirmation.text.includes("news.google.com"), "and never the wrapper");
  });
});

describe("the digest tier", () => {
  const tangential = () =>
    makeItem({ title: "Someone else eyes a top-10 fight", mentions: 1, source: "Sherdog" });

  // Two speeds of delivery (2026-09-04): real news posts on the hourly run;
  // a tangential item is stored for the daily mentions digest and never
  // appears in the hourly message at all — not as a headline, not as a line.
  test("a tangential item is queued for the mentions digest, not sent hourly", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem(), tangential()], deps({
      store, embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
    }));
    const text = digest().text;
    assert.match(text, /Testov books a return/, "the real story keeps its headline");
    assert.doesNotMatch(text, /Someone else eyes/, "the tangential headline is not shown");
    assert.doesNotMatch(text, /Also mentioning/, "and no longer rides as a link line either");

    const queued = store.rows.items.find((r) => r.title.startsWith("Someone else"));
    assert.equal(queued.posted, false);
    assert.equal(queued.held_reason, "tangential");
    assert.equal(queued.digest_tier, "tangential");
  });

  test("when everything was tangential, nothing is broadcast at all", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [tangential()], deps({ store }));
    assert.equal(sent.length, 0);
  });

  // The row is written in its final state from the start — no posted=true
  // that a later step has to walk back.
  test("a queued row is posted=false from the start so the audit stays honest", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [tangential()], deps({ store }));
    assert.equal(store.rows.items[0].posted, false);
    assert.equal(store.rows.items[0].held_reason, "tangential");
  });

  test("a claim source is never demoted, however few mentions it carries", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [tangential()], deps({
      store,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "injury", sourcing: "reported", canonical_text: "Testov is injured", facts: {} },
      }),
    }));
    assert.match(digest().text, /🕵️ <b>Rumor:<\/b> Testov is injured/);
  });

  // The matcher's role judgement, end to end (2026-08-10). Item #73 is the
  // motivating failure: an article about Guram Kutateladze named the subject
  // twice — as an opponent's cornerman — which cleared the <=1-mention
  // threshold, so the count rule kept a full headline for pure background
  // color. The role now demotes it; the count rule stays underneath as the
  // fallback for every item the matcher said nothing useful about.
  describe("the matcher's role judgement", () => {
    // Item #73's shape: two mentions (the count rule keeps it), no name in the
    // headline, and a matcher that read the article and called it background.
    const cornerman = () =>
      makeItem({ title: "Kutateladze eyes a top-10 fight", mentions: 2, source: "Sherdog" });

    test("a passing role folds in an article the mention count would have kept", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem(), cornerman()], deps({
        store,
        embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
        matchItem: async ({ item }) => ({
          verdict: "NO_CLAIM",
          subject_role: item.title.startsWith("Kutateladze") ? "passing" : "central",
        }),
      }));
      const text = digest().text;
      assert.match(text, /Testov books a return/, "the real story keeps its headline");
      assert.doesNotMatch(text, /Kutateladze eyes/, "the cornerman article loses its headline");
      const queued = store.rows.items.find((r) => r.title.startsWith("Kutateladze"));
      assert.equal(queued.digest_tier, "tangential", "and waits for the mentions digest");
      assert.equal(store.rows.items.find((r) => r.title.startsWith("Kutateladze")).subject_role, "passing");
    });

    // The two rules are OR: the role can demote, but it can never rescue.
    // Pinned at the pipeline level as well as in lib/tier.test.js, because
    // this is the direction a "trust the model" refactor would break first.
    test("a central role does not rescue an item the mention count demotes", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem(), tangential()], deps({
        store,
        embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
        matchItem: async () => ({ verdict: "NO_CLAIM", subject_role: "central" }),
      }));
      assert.doesNotMatch(digest().text, /Someone else eyes/);
      assert.doesNotMatch(digest().text, /Also mentioning/);
      assert.equal(store.rows.items.find((r) => r.title.startsWith("Someone else")).digest_tier, "tangential");
    });

    // The role describes the ARTICLE, not what the digest did with it, so it
    // is kept even on rows the group never sees — that is what makes the
    // archive re-measurable later.
    test("the role is stored on a wrong_subject row, which never reaches the digest", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({
        store, matchItem: async () => ({ verdict: "WRONG_SUBJECT", subject_role: "passing" }),
      }));
      assert.equal(sent.length, 0);
      assert.equal(store.rows.items[0].held_reason, "wrong_subject");
      assert.equal(store.rows.items[0].subject_role, "passing");
    });

    test("a matcher outage stores a null role and leaves the mention count in charge", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem(), tangential()], deps({
        store,
        embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
        matchItem: async () => { throw new Error("anthropic 500"); },
      }));
      for (const row of store.rows.items) assert.equal(row.subject_role, null);
      assert.match(digest().text, /Testov books a return/, "the count rule kept the real story");
      assert.doesNotMatch(digest().text, /Someone else eyes/, "and still demoted the 1-mention item");
      assert.equal(store.rows.items.find((r) => r.title.startsWith("Someone else")).digest_tier, "tangential");
    });
  });
});

// AGENTS.md states that every gate fails open, and that the one fatal condition
// is a configured-but-unreachable database. Until now nothing verified it.
describe("fail-open", () => {
  test("an embedding outage degrades to URL-only dedup and still posts", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store, embedTexts: async () => { throw new Error("gemini down"); },
    }));
    assert.equal(sent.length, 1, "the item still reaches the group");
    assert.equal(store.rows.items[0].embedding, null);
    assert.equal(store.rows.items[0].nearest_similarity, null, "no similarity was measurable");
  });

  test("a matcher outage becomes UNSURE and the article posts as it always did", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store, matchItem: async () => { throw new Error("anthropic 500"); },
    }));
    assert.equal(sent.length, 1);
    assert.match(digest().text, /Testov books a return/);
    assert.equal(store.rows.claims.length, 0, "no claim is invented from a failed call");
  });

  test("with no API key the matcher is skipped entirely and items still post", async () => {
    const store = createFakeStore();
    let called = false;
    await huntSubject(DB, SUBJECT, [makeItem()], deps({
      store, matcherEnabled: false, matchItem: async () => { called = true; return { verdict: "NO_CLAIM" }; },
    }));
    assert.equal(called, false);
    assert.equal(sent.length, 1);
  });

  test("a body-step failure leaves the item headline-only rather than dropping it", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ feedContent: null })], deps({
      store, decodeGoogleNewsUrl: async () => { throw new Error("decode exploded"); },
    }));
    assert.equal(sent.length, 1);
    assert.equal(store.rows.items[0].body, null);
    assert.equal(store.rows.items[0].body_via, "step-error");
  });

  test("a Telegram failure does not corrupt the stored record", async () => {
    const store = createFakeStore();
    await assert.rejects(
      huntSubject(DB, SUBJECT, [makeItem()], deps({
        store, sendMessage: async () => { throw new Error("telegram 400"); },
      })),
      /telegram 400/
    );
    // The row was written before the send — that is by design, and it is why
    // the suppression branch above has to correct posted after the fact.
    assert.equal(store.rows.items.length, 1);
  });

  // The outage this was written for (2026-08-10): a deploy blanked
  // TELEGRAM_CHAT_ID and every send returned 400 "chat not found" for 20
  // hours. sendTelegramMessage handles that by logging and returning null — it
  // does NOT throw — so the test above never covered it, and three items sat
  // in the archive marked posted=true that the group never received. Nothing
  // in the database disagreed with them, which is what made the outage
  // invisible to every query.
  describe("a send that fails without throwing", () => {
    const dead = { sendMessage: async () => null }; // what a 400 actually returns

    test("every item in the lost digest is walked back to posted=false", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      assert.equal(store.rows.items[0].posted, false);
      assert.equal(store.rows.items[0].held_reason, "send_failed");
    });

    // A queued mention never rode the message, so a failed send does not
    // touch it — it stays queued for the mentions digest, not marked failed.
    test("a queued mention is untouched by the failed send", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [
        makeItem(),
        makeItem({ title: "Someone else eyes a top-10 fight", mentions: 1, source: "Sherdog" }),
      ], deps({
        store, ...dead,
        embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
      }));
      assert.deepEqual(store.rows.items.map((r) => [r.posted, r.held_reason]),
        [[false, "send_failed"], [false, "tangential"]]);
    });

    // A claim is a fact we learned, not a message we sent. Losing the post
    // must not lose the knowledge — and the null tg_message_id already means
    // "nothing to thread a confirmation under".
    test("the claim survives, without a message id", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({
        store, ...dead,
        matchItem: async () => ({
          verdict: "NEW",
          new_claim: { type: "quote", sourcing: "reported", canonical_text: "Testov spoke", facts: {} },
        }),
      }));
      assert.equal(store.rows.claims.length, 1);
      assert.equal(store.rows.claims[0].tg_message_id, null);
      assert.equal(store.rows.items[0].posted, false);
    });

    // The guard in the other direction: a delivered message must never be
    // walked back, or the archive starts under-reporting instead.
    test("a delivered message leaves posted=true alone", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store }));
      assert.equal(store.rows.items[0].posted, true);
      assert.equal(store.rows.items[0].held_reason, null);
    });
  });

  // Marking a lost item unposted is only honest bookkeeping — Gate 1 blocks
  // rediscovery, so without this the group never sees it. The next run that
  // can send carries it.
  describe("the resend pass", () => {
    const dead = { sendMessage: async () => null };

    // The whole loop, in one test: run 1 loses the item, run 2 delivers it.
    test("an item lost to a failed send is carried by the next run", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      assert.equal(store.rows.items[0].held_reason, "send_failed");

      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store })); // nothing new this hour
      assert.match(digest().text, /Testov books a return/, "the lost headline is carried");
      assert.equal(store.rows.items[0].posted, true, "and the row says so again");
      assert.equal(store.rows.items[0].held_reason, null);
    });

    test("it is carried once, not every hour after", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      assert.equal(sent.length, 0, "a delivered item must not come back");
    });

    // A retry that keeps failing must not escape the walk-back, or the row
    // ends up claiming a delivery that failed twice.
    test("a second failure leaves it queued rather than losing it", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      await huntSubject(DB, SUBJECT, [], deps({ store, ...dead }));
      assert.equal(store.rows.items[0].posted, false);
      assert.equal(store.rows.items[0].held_reason, "send_failed");
    });

    // Self-limiting by design: an outage that outlasts the news window stops
    // trailing the digest instead of posting week-old headlines forever.
    test("news older than the discovery window is not resurrected", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      // The outage outlasted the news: age the stored row past the window the
      // hunter discovers within. (Feeding a 40h-old item instead would prove
      // nothing — fetchFreshItems drops it before it is ever stored.)
      store.rows.items[0].published_at = new Date(Date.now() - 40 * 3600_000);
      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      assert.equal(sent.length, 0);
      assert.equal(store.rows.items[0].held_reason, "send_failed", "still on the record, just not posted");
    });

    // held_reason's other values are decisions. A retry must never undo one.
    test("duplicates and wrong-subject rows are never resent", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({
        store, matchItem: async () => ({ verdict: "WRONG_SUBJECT" }),
      }));
      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      assert.equal(sent.length, 0);
      assert.equal(store.rows.items[0].held_reason, "wrong_subject");
    });

    // Rebuilt rows carry a language, so a Spanish headline still gets
    // translated a run later — and a row from before the column existed says
    // nothing rather than claiming a translation it never had.
    test("a resent foreign headline is still translated", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem({ edition: "es", title: "Testov vuelve en marzo" })],
        deps({ store, ...dead }));
      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      assert.match(digest().text, /\(translated from es\)/);
    });

    test("a row with no stored language posts as filed, never mislabelled", async () => {
      const store = createFakeStore();
      await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, ...dead }));
      store.rows.items[0].edition = null; // a row written before the column existed
      sent.length = 0;
      await huntSubject(DB, SUBJECT, [], deps({ store }));
      assert.doesNotMatch(digest().text, /translated from/);
      assert.match(digest().text, /Testov books a return/);
    });
  });
});

describe("presentation", () => {
  test("a non-group language is translated and labelled, never passed off as the original", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ edition: "es", title: "Testov vuelve en marzo" })], deps({ store }));
    assert.match(digest().text, /EN\(Testov vuelve en marzo\)/);
    assert.match(digest().text, /\(translated from es\)/);
  });

  test("a translation failure posts the original headline rather than nothing", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ edition: "es", title: "Testov vuelve en marzo" })], deps({
      store, translate: async () => { throw new Error("gemini down"); },
    }));
    assert.match(digest().text, /Testov vuelve en marzo/);
    assert.doesNotMatch(digest().text, /translated from/);
  });

  // A bare "&" in an href makes Telegram reject the WHOLE message silently,
  // even though every item in it is already stored posted=true.
  test("an ampersand in a URL is escaped so the message cannot be silently rejected", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ url: "https://example.test/a?utm_source=rss&utm_medium=rss" })], deps({ store }));
    assert.match(digest().text, /utm_source=rss&amp;utm_medium=rss/);
    assert.doesNotMatch(digest().text, /rss&utm/);
  });

  test("the name filter discards items that never name the subject", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ title: "Two other people fight", feedContent: "<p>No mention here at all, at any point in the article body.</p>" })], deps({ store }));
    assert.equal(sent.length, 0);
    assert.equal(store.rows.items.length, 0, "a discarded item leaves no row — §5's blind spot");
  });
});

// Google wraps its links, so the real address is only known after a decode.
// Both outcomes of that decode have consequences, and neither fires under the
// default deps — where decodeGoogleNewsUrl is a no-op and every fixture carries
// feedContent.
describe("the body step", () => {
  test("a wrapper that decodes onto a stored article is held as a url duplicate", async () => {
    const store = createFakeStore({
      items: [{ url: "https://example.test/real", subject: SUBJECT.name, title: "Testov books a return" }],
    });
    await huntSubject(DB, SUBJECT, [makeItem({ url: "https://news.google.test/wrapped" })], deps({
      store,
      decodeGoogleNewsUrl: async () => "https://example.test/real",
    }));

    assert.equal(sent.length, 0, "the same story does not post twice");
    const held = store.rows.items.at(-1);
    assert.equal(held.posted, false);
    assert.equal(held.held_reason, "url", "distinct from an embedding hold — this one is certain");
  });

  // Distinct from the step-error case: fetchArticleBody was never called at
  // all, rather than called and failed. The archive keeps the difference so a
  // later measurement can tell a broken decoder from a broken fetch.
  test("a wrapper that will not decode leaves the item headline-only, distinctly labelled", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ feedContent: null })], deps({
      store,
      decodeGoogleNewsUrl: async () => null,
    }));

    assert.equal(sent.length, 1, "it still posts — the body was always a bonus");
    assert.equal(store.rows.items[0].body, null);
    assert.equal(store.rows.items[0].body_via, "decode-failed");
  });
});

// AGENTS.md requires a DRY_RUN=1 pass before every deploy, which makes this the
// most relied-on safety mechanism in the project — and it had no test at all.
// The guarantee: reads happen, writes and sends do not.
describe("dry run", () => {
  test("an ordinary item is neither stored nor sent", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, dryRun: true }));

    assert.equal(sent.length, 0, "nothing reaches Telegram");
    assert.equal(store.rows.items.length, 0, "and nothing reaches the database");
  });

  test("a claim is previewed without being written", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      dryRun: true,
      matchItem: async () => ({
        verdict: "NEW",
        new_claim: { type: "announcement", sourcing: "official", canonical_text: "Testov fights Rivalov in March", facts: {} },
      }),
    }));

    assert.equal(sent.length, 0, "the ceremony is printed, never posted");
    assert.equal(store.rows.claims.length, 0);
    assert.equal(store.rows.items.length, 0);
  });

  test("a held duplicate is not written either", async () => {
    const [stored, incoming] = vectorsWithSimilarity(0.84);
    const store = createFakeStore({
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Testov books a return", embedding: stored, posted: true }],
    });
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, dryRun: true, embedTexts: async () => [incoming] }));

    assert.equal(store.rows.items.length, 1, "only the row that was already there");
  });

  // A confirmation is previewed by READING the claim, never by flipping it —
  // the rehearsal must show everything a real run would say while the rumor
  // stays a rumor. History: docs/decisions.md#dry-run-confirmation-preview
  test("a confirmation is previewed and the rumor stays a rumor", async (t) => {
    const log = t.mock.method(console, "log");
    const store = createFakeStore({
      claims: [{ subject: SUBJECT.name, type: "announcement", canonical_text: "Testov fights in March", status: "rumor", tg_message_id: 777 }],
    });
    await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
      store,
      dryRun: true,
      matchItem: async () => ({ verdict: "MATCH", match_claim_id: "1", stance: "asserts" }),
    }));

    assert.equal(sent.length, 0, "nothing reaches Telegram");
    assert.equal(store.rows.items.length, 0, "nothing reaches the database");
    assert.equal(store.rows.claims[0].status, "rumor", "the flip is previewed, not performed");
    const preview = log.mock.calls.find((call) => String(call.arguments[0]).includes("would post (confirmation)"));
    assert.ok(preview, "the confirmation preview is printed");
    assert.match(String(preview.arguments[0]), /Testov fights in March/);
  });

  // The resend queue is READ under a dry run, so the preview shows what a real
  // run would carry. What it must not do is consume the queue — a rehearsal
  // that swallowed a pending item would lose it for good.
  test("the resend queue is left intact", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem()], deps({ store, sendMessage: async () => null }));
    assert.equal(store.rows.items[0].held_reason, "send_failed");

    sent.length = 0;
    await huntSubject(DB, SUBJECT, [], deps({ store, dryRun: true }));

    assert.equal(sent.length, 0, "nothing is sent");
    assert.equal(store.rows.items[0].posted, false, "and the item is still queued");
    assert.equal(store.rows.items[0].held_reason, "send_failed");
  });
});

describe("no database configured (local dry runs)", () => {
  test("items still post, nothing is stored, and no gate throws", async () => {
    await huntSubject(null, SUBJECT, [makeItem()], deps({ store: createFakeStore() }));
    assert.equal(sent.length, 1);
  });
});

describe("the untrusted-source veto", () => {
  // Five prior items from the same domain, three of them wrong-subject, none
  // with a body: the record that earns a hold. Keyed on the domain of the
  // resolved URL, never the display source name.
  const spamHistory = () => Array.from({ length: 5 }, (_, i) => ({
    url: `https://news.google.com/rss/articles/spam-${i}`,
    resolved_url: `https://www.mshale.com/2026/08/keyword-${i}/`,
    subject: SUBJECT.name, title: `Testov keyword ${i}`, source: i % 2 ? "Mshale" : "mshale.com",
    posted: i >= 3, held_reason: i < 3 ? "wrong_subject" : null, body: null, embedding: null,
  }));

  test("an item from a domain with a majority-junk, body-less record is held, not posted", async () => {
    const store = createFakeStore({ items: spamHistory() });
    const item = makeItem({
      url: "https://www.mshale.com/2026/09/spam-new/",
      source: "Mshale", feedContent: null, rssDescription: null,
      title: "Testov news today and other stories",
    });
    const fetchArticleBody = async () => ({ body: null, via: "http-403" });
    await huntSubject(DB, SUBJECT, [item], deps({ store, extra: { fetchArticleBody } }));

    const stored = store.item(item.url);
    assert.equal(stored.posted, false);
    assert.equal(stored.held_reason, "untrusted_source");
    assert.equal(digest(), undefined, "nothing reached the group");
  });

  test("the veto beats a NEW verdict — spam never mints a claim", async () => {
    const store = createFakeStore({ items: spamHistory() });
    const item = makeItem({
      url: "https://www.mshale.com/2026/09/spam-claim/",
      source: "Mshale", feedContent: null, rssDescription: null,
    });
    const fetchArticleBody = async () => ({ body: null, via: "http-403" });
    const matchItem = async () => ({
      verdict: "NEW",
      new_claim: { type: "announcement", canonical_text: "Testov to fight Rivalov", facts: {}, sourcing: "reported" },
    });
    await huntSubject(DB, SUBJECT, [item], deps({ store, matchItem, extra: { fetchArticleBody } }));

    assert.equal(store.rows.claims.length, 0);
    assert.equal(store.item(item.url).held_reason, "untrusted_source");
  });

  test("a domain that has ever yielded a body is trusted, whatever its ratio", async () => {
    const history = spamHistory();
    history[4].body = bodyWith(3);
    const store = createFakeStore({ items: history });
    const item = makeItem({
      url: "https://www.mshale.com/2026/09/real-new/",
      source: "Mshale", feedContent: null, rssDescription: null,
    });
    const fetchArticleBody = async () => ({ body: null, via: "http-403" });
    await huntSubject(DB, SUBJECT, [item], deps({ store, extra: { fetchArticleBody } }));

    assert.equal(store.item(item.url).posted, true);
  });

  test("the record is keyed on the resolved domain, so a Google-wrapped item is judged by its real host", async () => {
    const store = createFakeStore({ items: spamHistory() });
    const item = makeItem({
      url: "https://news.google.com/rss/articles/wrapped-new",
      source: "Mshale", feedContent: null, rssDescription: null,
    });
    const decodeGoogleNewsUrl = async () => "https://www.mshale.com/2026/09/new-keyword/";
    const fetchArticleBody = async () => ({ body: null, via: "http-403" });
    await huntSubject(DB, SUBJECT, [item], deps({ store, decodeGoogleNewsUrl, extra: { fetchArticleBody } }));

    assert.equal(store.item(item.url).held_reason, "untrusted_source");
  });
});
