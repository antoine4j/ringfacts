import { test } from "node:test";
import assert from "node:assert/strict";
import { newsLabel, tierOneMessage } from "./post.ts";
import { groupingText } from "../stations/grouping/grouping.ts";
import { newClaimLabel } from "../store/grouping.ts";

const ROW = { claim_id: 1, reading_id: 2, fighter: "Marko Testov", headline: "Testov booked", outlet: "Example <News>", url: "https://example.com/?a=1&b=2" };
const EXTRACT = { kind: "new_event" as const, claim: "Marko Testov will fight Ivan Rivalov at UFC 400.", occasion: "UFC announcement", actor: null, opponent: "Ivan Rivalov", event: "UFC 400", date: null };
const NO_CLAIM = { ...EXTRACT, kind: "restatement" as const, claim: "NO CLAIM", occasion: null };

test("a tier-1 post is the emoji, the underlined surname and the label, then the reading's own extract sentence and its link, escaped", () => {
  const message = tierOneMessage({ ...ROW, extract: EXTRACT, cell: "next_fight · official_or_done", outlets: 3 });
  assert.equal(
    message,
    '📅 <u>Testov</u> · Next fight · official\nMarko Testov will fight Ivan Rivalov at UFC 400.\n<a href="https://example.com/?a=1&amp;b=2">Example &lt;News&gt;</a> + 2 more outlets',
  );
});

test("the label names the kind and how firm it is; a result needs no firmness", () => {
  assert.deepEqual(newsLabel("result · official_or_done"), { emoji: "🏆", words: "Result" });
  assert.deepEqual(newsLabel("next_fight · reported"), { emoji: "📅", words: "Next fight · reported" });
  assert.deepEqual(newsLabel("health · none"), { emoji: "🩺", words: "Health" });
  assert.deepEqual(newsLabel(null), { emoji: "📰", words: "News" });
});

test("one outlet is not counted, and one other is singular", () => {
  assert.doesNotMatch(tierOneMessage({ ...ROW, extract: EXTRACT, cell: "result · official_or_done", outlets: 1 }), /more/);
  assert.match(tierOneMessage({ ...ROW, extract: EXTRACT, cell: "result · official_or_done", outlets: 2 }), /<\/a> \+ 1 more outlet$/);
});

test("a post with no claim sentence falls back to the headline", () => {
  assert.match(tierOneMessage({ ...ROW, extract: { claim: "NO CLAIM" } }), /\nTestov booked\n/);
});

test("the grouping text is occasion and claim, then headline and lead, as measured", () => {
  assert.equal(groupingText(EXTRACT, "Head", "Body " + "x".repeat(2000)).split("\n\n")[0], "UFC announcement: Marko Testov will fight Ivan Rivalov at UFC 400.");
  assert.equal(groupingText(EXTRACT, "Head", "x".repeat(2000)).length, "UFC announcement: Marko Testov will fight Ivan Rivalov at UFC 400.\n\nHead\n\n".length + 1500);
  assert.equal(groupingText(NO_CLAIM, "Head", "Body"), "Head\n\nBody");
});

test("a new claim is labelled by its first extract, or its headline when there is none", () => {
  assert.equal(newClaimLabel(EXTRACT, "Head"), EXTRACT.claim);
  assert.equal(newClaimLabel(NO_CLAIM, "Head"), "Head");
});
