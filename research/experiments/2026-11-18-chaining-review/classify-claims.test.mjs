// Tests for the pure parts of the chaining review: the class rule, the chain
// test, the seeded sample and the small helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classOf, countBy, median } from "./classify-claims.mjs";
import { seededRandom } from "./list-mixed-claims.mjs";
import { cosine, joinFeatures, wordOverlap } from "./trace-claims.mjs";

/**
 * A reading entry with a two-number vector, enough for the chain test.
 *
 * @param vector  Two numbers.
 * @param extra  Fields to add or override.
 * @returns An entry.
 */
function entry(vector, extra = {}) {
  return { vector, published_at: "2026-09-01T00:00:00Z", claim_sentence: "a sentence", headline: "a headline", label_shown: null, confidence: 0.5, closest_earlier: null, ...extra };
}

test("classOf follows the order: judges wrong, cannot tell, stale leader, chain, wrong pick", () => {
  assert.equal(classOf({ verdict: "same_story" }, { passes_chain_test: true }), "judges_wrong");
  assert.equal(classOf({ verdict: "cannot_tell" }, { passes_chain_test: true }), "cannot_tell");
  assert.equal(classOf({ verdict: "mixed", label_fits: false }, { passes_chain_test: true }), "stale_leader");
  assert.equal(classOf({ verdict: "mixed" }, { passes_chain_test: true }), "chain");
  assert.equal(classOf({ verdict: "mixed" }, { passes_chain_test: false }), "wrong_pick");
});

test("seededRandom gives the same numbers for the same seed", () => {
  const first = seededRandom(7);
  const second = seededRandom(7);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
  assert.notEqual(seededRandom(7)(), seededRandom(8)());
});

test("cosine of equal vectors is 1 and of orthogonal vectors is 0", () => {
  assert.ok(Math.abs(cosine([1, 2], [1, 2]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
});

test("wordOverlap counts shared content words", () => {
  assert.equal(wordOverlap("Topuria posted a video", "Topuria posted a video"), 1);
  assert.equal(wordOverlap("alpha beta gamma", "delta epsilon zeta"), 0);
  assert.equal(wordOverlap("", "anything here"), 0);
});

test("the chain test passes only for a far entrant pulled by a late, non-anchor member", () => {
  // Members 0 and 1 are the anchors (the label source is member 1); member 2 sits between; the entrant is near member 2 only.
  const anchorA = entry([1, 0]);
  const anchorB = entry([0.95, 0.05], { claim_sentence: "the label" });
  const middle = entry([0.7, 0.7]);
  const entrant = entry([0.6, 0.8], { label_shown: "the label", closest_earlier: { position: 2, similarity: cosine([0.6, 0.8], [0.7, 0.7]) } });
  const entries = [anchorA, anchorB, middle, entrant];

  // With three members before it, far from both anchors and nearest the middle one: it passes.
  assert.equal(joinFeatures(entries, 3).passes_chain_test, true);

  // Nearest an anchor instead: it fails whatever the numbers.
  const nearAnchor = { ...entrant, closest_earlier: { position: 1, similarity: 0.99 } };
  assert.equal(joinFeatures([anchorA, anchorB, middle, nearAnchor], 3).passes_chain_test, false);

  // Fewer than three members before: there is no late member to pull it, so it fails.
  assert.equal(joinFeatures([anchorA, anchorB, { ...entrant, closest_earlier: { position: 1, similarity: 0.7 } }], 2).passes_chain_test, false);
});

test("median and countBy", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.deepEqual(countBy(["a", "b", "a"], (value) => value), { a: 2, b: 1 });
});
