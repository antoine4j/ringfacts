// Discovery (tier 1). The Google News layer: how a query becomes a feed URL,
// how the XML comes back apart, what happens when Google sheds load, and how
// items found under several aliases merge into one candidate list.
//
// Untested until now, and not by accident — every pipeline test passes
// `aliases: []` so nothing reaches the network. That kept the pipeline tier
// offline and left this layer with nothing on it, including while the
// "Daniel Donchenko" alias quietly matched no articles at all.
//
// Nothing here touches the network either: `fetch` is replaced per test.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// The retry delay is read once, at module load, from the environment. Setting
// it before a DYNAMIC import is what avoids a real 75-second sleep in the retry
// test — a static import would hoist above this line and bake in the default.
process.env.RETRY_DELAY_MS = "1";
const { feedUrl, parseRssItems, fetchFeed, fetchFreshItems } = await import("../hunter.js");

// One <item> block in the shape Google News actually returns.
const rssItem = (over = {}) => `
  <item>
    <title>${over.title ?? "Testov books a return"}</title>
    <link>${over.link ?? "https://news.google.test/articles/abc"}</link>
    ${over.source === null ? "" : `<source url="https://www.mmafighting.com">${over.source ?? "MMA Fighting"}</source>`}
    ${over.pubDate === null ? "" : `<pubDate>${over.pubDate ?? "Tue, 12 Aug 2026 09:30:00 GMT"}</pubDate>`}
    ${over.description === null ? "" : `<description>${over.description ?? "Related coverage"}</description>`}
  </item>`;

const rss = (...items) => `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;

// Swap the global fetch for the duration of one test, then put it back.
function withStubbedFetch() {
  let original;
  beforeEach(() => { original = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = original; });
}

describe("feedUrl", () => {
  // A wrong edition parameter does not error — Google answers with the empty
  // English feed, so a broken query looks exactly like a quiet news day.
  test("each edition carries its own language and country parameters", () => {
    assert.match(feedUrl({ query: "Testov", edition: "en" }), /hl=en-US&gl=US&ceid=US:en$/);
    assert.match(feedUrl({ query: "Testov", edition: "uk" }), /hl=uk&gl=UA&ceid=UA:uk$/);
    assert.match(feedUrl({ query: "Testov", edition: "es" }), /hl=es&gl=ES&ceid=ES:es$/);
  });

  test("a quoted Cyrillic query is percent-encoded, never sent raw", () => {
    const url = feedUrl({ query: '"Данило Донченко"', edition: "uk" });

    assert.match(url, /q=%22%D0%94/, "the quote and the Cyrillic are both encoded");
    assert.doesNotMatch(url, /Данило/, "no raw Cyrillic survives into the URL");
  });
});

describe("parseRssItems", () => {
  test("title, link, source and date come off a well-formed item", () => {
    const [item] = parseRssItems(rss(rssItem()));

    assert.equal(item.title, "Testov books a return");
    assert.equal(item.url, "https://news.google.test/articles/abc");
    assert.equal(item.source, "MMA Fighting");
    assert.equal(item.publishedAt.toISOString(), "2026-08-12T09:30:00.000Z");
  });

  test("HTML entities in a title are decoded", () => {
    const [item] = parseRssItems(rss(rssItem({ title: "Testov &amp; Rivalov &quot;agree&quot;" })));

    assert.equal(item.title, 'Testov & Rivalov "agree"');
  });

  // The case alsoMentioningLine's hostname fallback exists for: an empty source
  // would otherwise render a zero-width, invisible link.
  test("a missing source tag yields an empty string rather than undefined", () => {
    const [item] = parseRssItems(rss(rssItem({ source: null })));

    assert.equal(item.source, "");
  });

  test("the raw description is kept when present and null when absent", () => {
    const [withDescription] = parseRssItems(rss(rssItem({ description: "Related coverage" })));
    const [without] = parseRssItems(rss(rssItem({ description: null })));

    assert.equal(withDescription.rssDescription, "Related coverage");
    assert.equal(without.rssDescription, null);
  });

  // Epoch, not Invalid Date — the freshness filter compares getTime(), so a
  // dateless item has to sort and drop predictably rather than produce NaN.
  test("a missing pubDate falls back to the epoch", () => {
    const [item] = parseRssItems(rss(rssItem({ pubDate: null })));

    assert.equal(item.publishedAt.getTime(), 0);
  });

  test("every item in a multi-item feed is parsed", () => {
    const items = parseRssItems(rss(
      rssItem({ title: "First", link: "https://example.test/1" }),
      rssItem({ title: "Second", link: "https://example.test/2" }),
      rssItem({ title: "Third", link: "https://example.test/3" }),
    ));

    assert.deepEqual(items.map((i) => i.title), ["First", "Second", "Third"]);
  });

  test("junk and empty input return no items instead of throwing", () => {
    assert.deepEqual(parseRssItems(""), []);
    assert.deepEqual(parseRssItems("<html><body>not a feed</body></html>"), []);
    assert.deepEqual(parseRssItems(rss()), []);
  });
});

// Google sheds load from cloud-datacenter IPs one or two runs a day, so the
// single retry is real production behaviour, not defensive decoration.
describe("fetchFeed", () => {
  withStubbedFetch();

  const alias = { query: "Testov", edition: "en" };

  test("a successful response comes back as text", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "<rss/>" });

    assert.equal(await fetchFeed(alias), "<rss/>");
  });

  test("a failed response is retried once, and the retry's body is the one used", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 503, text: async () => "" }
        : { ok: true, status: 200, text: async () => "<rss>second try</rss>" };
    };

    assert.equal(await fetchFeed(alias), "<rss>second try</rss>");
    assert.equal(calls, 2, "exactly one retry, not a loop");
  });

  test("a second failure throws, naming the status", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: false, status: 429, text: async () => "" };
    };

    await assert.rejects(() => fetchFeed(alias), /RSS fetch 429 for Testov \(after retry\)/);
    assert.equal(calls, 2, "it gives up rather than retrying forever");
  });
});

describe("fetchFreshItems", () => {
  withStubbedFetch();

  const subject = {
    name: "Testov Example",
    aliases: [
      { query: '"Testov"', edition: "en" },
      { query: '"Тестов"', edition: "uk" },
    ],
    matchNames: ["Testov"],
  };

  const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toUTCString();

  // Answer with a different feed per edition, keyed off the ceid parameter the
  // URL carries — the same thing that distinguishes the aliases in production.
  function serveByEdition(feeds) {
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      text: async () => (url.includes("ceid=UA:uk") ? feeds.uk : feeds.en),
    });
  }

  test("items from every alias merge, each stamped with the alias that found it", async () => {
    serveByEdition({
      en: rss(rssItem({ title: "English story", link: "https://example.test/en", pubDate: hoursAgo(2) })),
      uk: rss(rssItem({ title: "Ukrainian story", link: "https://example.test/uk", pubDate: hoursAgo(1) })),
    });

    const items = await fetchFreshItems(subject, [], 24);

    assert.deepEqual(items.map((i) => i.edition), ["uk", "en"], "both aliases contributed, newest first");
    assert.equal(items.find((i) => i.edition === "uk").foundVia, 'uk "Тестов"');
    assert.equal(items.find((i) => i.edition === "en").foundVia, 'en "Testov"');
  });

  test("the same URL found under two aliases is kept once", async () => {
    const shared = rss(rssItem({ link: "https://example.test/same", pubDate: hoursAgo(3) }));
    serveByEdition({ en: shared, uk: shared });

    const items = await fetchFreshItems(subject, [], 24);

    assert.equal(items.length, 1, "one story, however many aliases found it");
  });

  // The cutoff is what stops a re-run from re-reading a week of feed.
  test("items older than the window are dropped before anything else runs", async () => {
    serveByEdition({
      en: rss(rssItem({ link: "https://example.test/fresh", pubDate: hoursAgo(2) })),
      uk: rss(rssItem({ link: "https://example.test/stale", pubDate: hoursAgo(40) })),
    });

    const items = await fetchFreshItems(subject, [], 24);

    assert.deepEqual(items.map((i) => i.url), ["https://example.test/fresh"]);
  });
});
