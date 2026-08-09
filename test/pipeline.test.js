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
import { createFakeStore, vectorsWithSimilarity, assertStoreInterfaceMatches } from "./fake-store.js";

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
    dryRun: false,
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
  test("every deps.X used in hunter.js is a key the deps object defines", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../hunter.js", import.meta.url), "utf8");

    const literal = src.match(/const deps = \{([\s\S]*?)\n  \};/);
    assert.ok(literal, "could not find the deps literal — has huntSubject been restructured?");
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
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Testov books a return", embedding: stored }],
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
      items: [{ url: "https://example.test/first", subject: SUBJECT.name, title: "Something else", embedding: stored }],
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
      items: [{ url: "https://example.test/rumor", subject: SUBJECT.name, title: "Testov targeted for March", embedding: stored }],
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
        items: [{ url: "https://example.test/rumor", subject: SUBJECT.name, title: "Testov targeted", embedding: stored }],
      });
      await huntSubject(DB, SUBJECT, [makeItem({ source: "UFC" })], deps({
        store, embedTexts: async () => [incoming], matchItem: async () => ({ verdict }),
      }));
      assert.equal(sent.length, 0, "the re-applied gate holds it");
      assert.equal(store.rows.items.at(-1).posted, false);
    });
  }
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
});

describe("the digest tier", () => {
  const tangential = () =>
    makeItem({ title: "Someone else eyes a top-10 fight", mentions: 1, source: "Sherdog" });

  test("a tangential item folds into one shared line instead of a headline", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [makeItem(), tangential()], deps({
      store, embedTexts: async (t) => t.map((_, i) => [Math.cos(i * 2), Math.sin(i * 2)]),
    }));
    const text = digest().text;
    assert.match(text, /Testov books a return/, "the real story keeps its headline");
    assert.doesNotMatch(text, /Someone else eyes/, "the tangential headline is not shown");
    assert.match(text, /↘ Also mentioning: <a href="[^"]*">Sherdog<\/a>/);
  });

  // A message with nothing but a header and an "Also mentioning" line is
  // exactly the noise the rule exists to remove.
  test("when everything was tangential, nothing is broadcast at all", async () => {
    const store = createFakeStore();
    await huntSubject(DB, SUBJECT, [tangential()], deps({ store }));
    assert.equal(sent.length, 0);
  });

  // Those rows were written posted=true before the run knew its own shape, and
  // audit-digest-tier.js partitions the archive on that column when re-measuring
  // thresholds — so a suppressed run has to correct itself, or the next
  // measurement reads items as broadcast that never were.
  test("suppressed rows are corrected to posted=false so the audit stays honest", async () => {
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

describe("no database configured (local dry runs)", () => {
  test("items still post, nothing is stored, and no gate throws", async () => {
    await huntSubject(null, SUBJECT, [makeItem()], deps({ store: createFakeStore() }));
    assert.equal(sent.length, 1);
  });
});
