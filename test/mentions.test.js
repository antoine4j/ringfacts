// Rendering of the daily mentions digest (lib/mentions.js). Pure: rows in,
// HTML out. The sweep that feeds it is tier 2b (test/startup.test.js).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupMentions, mentionLine, renderMentionsDigest } from "../lib/mentions.js";

const row = (over = {}) => ({
  id: "1", subject: "Testov Example", url: "https://a.test/1", title: "Someone else eyes a fight",
  source: "Sherdog", published_at: new Date("2026-09-04T06:00:00Z"), edition: "en", ...over,
});

describe("groupMentions", () => {
  test("groups by subject in watchlist order, rows keeping their own order", () => {
    const rows = [
      row({ id: "1", subject: "Rivalov Example" }),
      row({ id: "2", subject: "Testov Example" }),
      row({ id: "3", subject: "Testov Example" }),
    ];
    const groups = groupMentions(rows, ["Testov Example", "Rivalov Example"]);
    assert.deepEqual(groups.map((g) => g.subject), ["Testov Example", "Rivalov Example"]);
    assert.deepEqual(groups[0].rows.map((r) => r.id), ["2", "3"]);
  });

  test("a subject no longer on the watchlist still gets its rows, after the others", () => {
    const rows = [row({ subject: "Retired Example" }), row({ subject: "Testov Example" })];
    const groups = groupMentions(rows, ["Testov Example"]);
    assert.deepEqual(groups.map((g) => g.subject), ["Testov Example", "Retired Example"]);
  });
});

describe("mentionLine", () => {
  test("is the headline as the link, then the outlet", () => {
    assert.equal(
      mentionLine(row()),
      '• <a href="https://a.test/1">Someone else eyes a fight</a> — Sherdog'
    );
  });

  test("falls back to the hostname when the feed gave no source name", () => {
    const line = mentionLine(row({ source: "", url: "https://www.bloodyelbow.com/2026/09/x/" }));
    assert.match(line, / — bloodyelbow\.com$/);
  });

  test("escapes HTML in the headline", () => {
    const line = mentionLine(row({ title: "A <b>bold</b> & risky claim" }));
    assert.match(line, /A &lt;b&gt;bold&lt;\/b&gt; &amp; risky claim/);
  });
});

describe("renderMentionsDigest", () => {
  test("nothing queued renders nothing", () => {
    assert.equal(renderMentionsDigest([], ["Testov Example"]), null);
  });

  test("one message: a header, then a bold subject and its lines per group", () => {
    const text = renderMentionsDigest(
      [row({ subject: "Testov Example" }), row({ id: "2", subject: "Rivalov Example", title: "Rivalov in a list" })],
      ["Testov Example", "Rivalov Example"]
    );
    assert.match(text, /^📎 <b>Mentions<\/b>/);
    assert.match(text, /<b>Testov Example<\/b>\n• <a href="https:\/\/a\.test\/1">Someone else eyes a fight<\/a> — Sherdog/);
    assert.match(text, /<b>Rivalov Example<\/b>\n• .*Rivalov in a list/);
  });
});

describe("one story, several outlets", () => {
  // The same headline arriving from two rails (a Google-wrapped copy and a
  // direct feed) or two outlets syndicating one wire story is one mention,
  // not two: listed once, every outlet named after it.
  test("identical headlines collapse into one line naming each outlet", () => {
    const text = renderMentionsDigest([
      row({ id: "1", title: "Usman refutes claim that you're only high level in UFC", source: "Yahoo Sports UK", url: "https://y.test/1" }),
      row({ id: "2", title: "Usman refutes claim that you're only high level in UFC", source: "MMA Junkie", url: "https://j.test/2" }),
      row({ id: "3", title: "A different story", source: "Sherdog", url: "https://s.test/3" }),
    ], ["Testov Example"]);
    const lines = text.split("\n").filter((line) => line.startsWith("•"));
    assert.equal(lines.length, 2);
    assert.match(lines[0], /<a href="https:\/\/y\.test\/1">Usman refutes claim[^<]*<\/a> — Yahoo Sports UK · <a href="https:\/\/j\.test\/2">MMA Junkie<\/a>/);
  });

  test("a Google News ' - Outlet' suffix is stripped from the headline", () => {
    const line = mentionLine(row({ title: "Opinion: Gaethje's demands are getting harder to defend - Sherdog", source: "Sherdog" }));
    assert.match(line, />Opinion: Gaethje's demands are getting harder to defend<\/a> — Sherdog/);
  });

  test("the suffix is matched against the outlet name, so a real dash in a headline survives", () => {
    const line = mentionLine(row({ title: "Topuria - the return - explained", source: "Sherdog" }));
    assert.match(line, />Topuria - the return - explained<\/a>/);
  });
});
