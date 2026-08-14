// Message formatting (tier 1). The three formatters exported from hunter.js are
// the last thing between a correct pipeline decision and what the group
// actually reads, and their failures are silent in a specific way: Telegram
// rejects a whole message on malformed HTML, so one bad character in one link
// loses every item in the digest — all of them already stored posted=true.
//
// docs/superpowers/specs/2026-08-09-test-suite-design.md lists these as tier-1
// item 5. They were checked by hand when the tier shipped; this is that check
// written down.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { alsoMentioningLine } from "../hunter.js";

const item = (source, url, over = {}) => ({ source, url, ...over });

// The href of every link in the line, in order.
const hrefs = (line) => [...line.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
// The visible text of every link, in order.
const labels = (line) => [...line.matchAll(/>([^<]*)<\/a>/g)].map((m) => m[1]);

describe("alsoMentioningLine", () => {
  test("one story per outlet needs no numbering", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/a"),
      item("Sherdog", "https://sherdog.com/b"),
    ]);
    assert.equal(line, '↘ Also mentioning: <a href="https://be.com/a">Bloody Elbow</a> · ' +
      '<a href="https://sherdog.com/b">Sherdog</a>');
  });

  // The reachability case. Before numbering, the second story simply had no
  // link anywhere — and Gate 1 means no later run offers it again.
  test("two stories from one outlet both get a link, numbered", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/newer"),
      item("Bloody Elbow", "https://be.com/older"),
    ]);
    assert.deepEqual(labels(line), ["Bloody Elbow (1)", "Bloody Elbow (2)"]);
    assert.deepEqual(hrefs(line), ["https://be.com/newer", "https://be.com/older"]);
  });

  // Candidates arrive newest-first, so (1) is the newest story from that
  // outlet. Nothing re-sorts between the tier split and here.
  test("numbering follows input order, so (1) is the outlet's newest", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/1"),
      item("Sherdog", "https://sherdog.com/x"),
      item("Bloody Elbow", "https://be.com/2"),
      item("Bloody Elbow", "https://be.com/3"),
    ]);
    assert.deepEqual(labels(line),
      ["Bloody Elbow (1)", "Bloody Elbow (2)", "Bloody Elbow (3)", "Sherdog"]);
    assert.deepEqual(hrefs(line),
      ["https://be.com/1", "https://be.com/2", "https://be.com/3", "https://sherdog.com/x"]);
  });

  // A lone "Sherdog (1)" would imply a sibling that isn't there.
  test("only the outlet with more than one story is numbered", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/a"),
      item("Sherdog", "https://sherdog.com/b"),
      item("Bloody Elbow", "https://be.com/c"),
    ]);
    assert.deepEqual(labels(line), ["Bloody Elbow (1)", "Bloody Elbow (2)", "Sherdog"]);
  });

  test("outlet names are matched case-insensitively", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/a"),
      item("bloody elbow", "https://be.com/b"),
    ]);
    assert.equal(hrefs(line).length, 2);
    assert.deepEqual(labels(line), ["Bloody Elbow (1)", "Bloody Elbow (2)"],
      "the first spelling seen names both");
  });

  // The same article reached twice is one story. Numbering it as two would
  // offer the reader a choice between a link and itself.
  test("the same URL twice collapses to one unnumbered link", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://be.com/same"),
      item("Bloody Elbow", "https://be.com/same"),
    ]);
    assert.deepEqual(labels(line), ["Bloody Elbow"]);
    assert.deepEqual(hrefs(line), ["https://be.com/same"]);
  });

  test("the resolved URL is preferred over the Google News wrapper", () => {
    const line = alsoMentioningLine([
      item("Bloody Elbow", "https://news.google.com/rss/articles/XYZ",
        { resolvedUrl: "https://bloodyelbow.com/real" }),
    ]);
    assert.deepEqual(hrefs(line), ["https://bloodyelbow.com/real"]);
  });

  // parseRssItems returns "" for a missing <source> tag; without the fallback
  // the link renders as zero-width text the reader cannot see or tap.
  test("an empty source name falls back to the URL's hostname", () => {
    const line = alsoMentioningLine([item("  ", "https://www.mmajunkie.com/a")]);
    assert.deepEqual(labels(line), ["mmajunkie.com"]);
  });

  // The fallback's own fallback: when the URL will not even parse, the link
  // still gets a visible generic label rather than crashing the digest build.
  test("an empty source with an unparsable URL falls back to the word 'source'", () => {
    const line = alsoMentioningLine([item("", "not a url")]);
    assert.deepEqual(labels(line), ["source"]);
  });

  // A WordPress feed's utm params arrive with a bare "&". Telegram rejects the
  // WHOLE message on that, losing every item in the digest.
  test("ampersands in URLs and names are escaped, not passed through raw", () => {
    const line = alsoMentioningLine([
      item("Smith & Jones MMA", "https://x.com/a?utm_source=rss&utm_medium=rss"),
    ]);
    assert.match(line, /href="https:\/\/x\.com\/a\?utm_source=rss&amp;utm_medium=rss"/);
    assert.match(line, /Smith &amp; Jones MMA/);
    assert.doesNotMatch(line.replace(/&amp;/g, ""), /&/);
  });

  test("a numbered label is escaped too", () => {
    const line = alsoMentioningLine([
      item("Smith & Jones", "https://x.com/a"),
      item("Smith & Jones", "https://x.com/b"),
    ]);
    assert.match(line, /Smith &amp; Jones \(1\)/);
    assert.match(line, /Smith &amp; Jones \(2\)/);
  });
});
