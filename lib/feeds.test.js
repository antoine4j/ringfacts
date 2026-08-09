// Direct outlet feeds (tier 1): parsing and the per-subject name filter.
//
// matchesSubject is the highest-stakes pure function in the repo, and the
// reason is in docs/self-improvement.md §5: outlet feeds are name-filtered
// BEFORE storage, so a dead matchNames stem drops real coverage leaving no row
// behind — indistinguishable from quiet news by any database query. The hunter
// logs a discarded count for exactly this blind spot; these tests are the other
// half of the guard.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFeedItems, matchesSubject } from "./feeds.js";

// A synthetic subject, never a real watchlist entry (commit 555e918). The
// Cyrillic stem is deliberately short, the way real stems must be, because
// Ukrainian declines surnames.
const SUBJECT = { name: "Testov Example", matchNames: ["Testov", "Тестов"] };

describe("parseFeedItems", () => {
  test("reads RSS 2.0 items with CDATA titles and content:encoded bodies", () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Testov wins by submission]]></title>
        <link>https://example.test/a</link>
        <pubDate>Sat, 09 Aug 2026 10:00:00 GMT</pubDate>
        <content:encoded><![CDATA[<p>Full article body here.</p>]]></content:encoded>
      </item>
    </channel></rss>`;
    const [item] = parseFeedItems(xml);
    assert.equal(item.title, "Testov wins by submission");
    assert.equal(item.url, "https://example.test/a");
    assert.equal(item.feedContent, "<p>Full article body here.</p>");
    assert.equal(item.publishedAt.getUTCFullYear(), 2026);
  });

  // MMA Fighting ships Atom, where the URL is an attribute rather than element
  // text. Getting this wrong yields items with empty urls, which the filter at
  // the end of parseFeedItems then silently drops.
  test("reads Atom entries whose link is an href attribute", () => {
    const xml = `<feed>
      <entry>
        <title>Testov signs new deal</title>
        <link rel="alternate" href="https://example.test/b"/>
        <published>2026-08-09T10:00:00Z</published>
        <summary>Short summary.</summary>
      </entry>
    </feed>`;
    const [item] = parseFeedItems(xml);
    assert.equal(item.url, "https://example.test/b");
    assert.equal(item.feedContent, "Short summary.");
  });

  test("richest body field wins: content:encoded over description", () => {
    const xml = `<rss><channel><item>
      <title>T</title><link>https://example.test/c</link>
      <description>teaser</description>
      <content:encoded><![CDATA[the whole thing]]></content:encoded>
    </item></channel></rss>`;
    assert.equal(parseFeedItems(xml)[0].feedContent, "the whole thing");
  });

  test("items without a title or url are dropped rather than half-stored", () => {
    const xml = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.test/d</link></item>
      <item><title>Good</title><link>https://example.test/e</link></item>
    </channel></rss>`;
    assert.deepEqual(parseFeedItems(xml).map((i) => i.url), ["https://example.test/e"]);
  });

  test("an empty or junk feed yields no items and never throws", () => {
    assert.deepEqual(parseFeedItems(""), []);
    assert.deepEqual(parseFeedItems("<html><body>not a feed</body></html>"), []);
  });
});

describe("matchesSubject", () => {
  const item = (title, feedContent = null) => ({ title, feedContent });

  test("matches the subject named in the headline", () => {
    assert.equal(matchesSubject(item("Testov books a return"), SUBJECT), true);
  });

  test("matches on the body when the headline uses an epithet", () => {
    // Epithet headlines are routine in this press — lib/tier.js documents
    // rejecting a headline-only rule for exactly this reason.
    assert.equal(
      matchesSubject(item("Undefeated lightweight books a return", "<p>Testov will headline in March.</p>"), SUBJECT),
      true
    );
  });

  // Stems, not full names: Ukrainian declines surnames, so the stored stem has
  // to catch every inflection. If this breaks, Ukrainian-language coverage
  // disappears with no row written anywhere.
  test("a Cyrillic stem matches declined forms", () => {
    for (const form of ["Тестов", "Тестова", "Тестовим", "Тестову"]) {
      assert.equal(matchesSubject(item(`Новини про ${form} сьогодні`), SUBJECT), true, form);
    }
  });

  test("is case-insensitive", () => {
    assert.equal(matchesSubject(item("TESTOV RETURNS"), SUBJECT), true);
    assert.equal(matchesSubject(item("testov returns"), SUBJECT), true);
  });

  test("an unrelated article does not match", () => {
    assert.equal(matchesSubject(item("Someone else wins in Vegas", "<p>No mention at all.</p>"), SUBJECT), false);
  });

  // The furniture-mention leak, fired and fixed 2026-08-09: three digest posts
  // whose only "mention" of the subject was an image alt attribute, a URL slug,
  // or a sidebar LATEST NEWS block. The feed body is matched as reader-visible
  // TEXT, not raw HTML, so markup can no longer manufacture a match.
  describe("furniture mentions are not mentions (leak of 2026-08-09)", () => {
    test("a name in an image alt attribute does not match", () => {
      assert.equal(
        matchesSubject(item("Card preview", `<p>Nothing here.</p><img alt="Testov at weigh-ins" src="/x.jpg">`), SUBJECT),
        false
      );
    });

    test("a name in a URL slug does not match", () => {
      assert.equal(
        matchesSubject(item("Card preview", `<p>Nothing here.</p><a href="/news/testov-returns">More</a>`), SUBJECT),
        false
      );
    });

    test("but the name in real prose still matches", () => {
      assert.equal(
        matchesSubject(item("Card preview", `<p>Testov headlines the card.</p><img alt="weigh-ins" src="/x.jpg">`), SUBJECT),
        true
      );
    });
  });

  test("an item with no body at all is judged on its title alone, never thrown on", () => {
    assert.equal(matchesSubject(item("Testov returns", null), SUBJECT), true);
    assert.equal(matchesSubject(item("Someone else returns", null), SUBJECT), false);
  });
});
