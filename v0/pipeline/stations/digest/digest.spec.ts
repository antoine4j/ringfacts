import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDigest, telegramSafe, withSources } from "./digest.ts";
import { splitMessage } from "../../workflow/digests.ts";
import type { DigestContext } from "../../store/digests.ts";

const CLAIM = { label: "x", firstLabel: "x", bestTier: 2, postedInPeriod: false, readings: 1, outlets: 1, firstDate: "2026-10-01", lastDate: "2026-10-01", articles: [] };
const CONTEXT: DigestContext = {
  fighter: "Marko Testov", periodStart: new Date("2026-09-28"), periodEnd: new Date("2026-10-05"), previous: [],
  active: [{ ...CLAIM, id: 7 }], background: [{ ...CLAIM, id: 9 }],
};

test("claims the writer was not given are dropped from its items and reported", () => {
  const reply = JSON.stringify({ text: 'News. (<a href="https://a.example">A</a>)', items: [{ title: "t", claims: [7, 42], links: [] }] });
  const parsed = parseDigest(reply, CONTEXT);
  assert.deepEqual(parsed.items[0].claims, [7]);
  assert.deepEqual([...parsed.usedClaimIds], [7]);
  assert.deepEqual(parsed.unknownClaims, [42]);
});

test("a reply wrapped in a code fence is still read", () => {
  const parsed = parseDigest('```json\n{"text": "Quiet week.", "items": []}\n```', CONTEXT);
  assert.equal(parsed.text, "Quiet week.");
});

test("a digest with no text is refused", () => {
  assert.throws(() => parseDigest('{"text": " ", "items": []}', CONTEXT), /no text/);
});

test("only <b>, <i> and <a href> pass to Telegram; everything else is escaped", () => {
  assert.equal(telegramSafe('<b>Win</b> <script>x</script> & <a href="https://a.example">A</a> 5 < 6'), '<b>Win</b> &lt;script&gt;x&lt;/script&gt; &amp; <a href="https://a.example">A</a> 5 &lt; 6');
});

test("a text without links gets a sources line per item", () => {
  const text = withSources("News.", [{ title: "Booking", links: ["https://a.example", "https://b.example"] }]);
  assert.equal(text, 'News.\n\n<i>Sources</i>\nBooking: <a href="https://a.example">1</a> <a href="https://b.example">2</a>');
  assert.equal(withSources('News <a href="https://a.example">A</a>', [{ title: "x", links: ["https://b.example"] }]), 'News <a href="https://a.example">A</a>');
});

test("a long digest is split at paragraph breaks under Telegram's limit", () => {
  const paragraph = "y".repeat(1500);
  const parts = splitMessage([paragraph, paragraph, paragraph, paragraph].join("\n\n"));
  assert.equal(parts.length, 2);
  assert.ok(parts.every((part) => part.length <= 4000));
});
