// Unit coverage for labels/story-gate.js on tiny hand-made vectors: the
// root guard blocks drift, the baseline ignores held anchors, a story's root
// is its first arrival whatever the labels name, and swallowing junk is not
// counted as a cost.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cosine, rootOf, storiesByArrival, observe, score, scoreBaseline, simulate, quantiles } from "./story-gate.js";

const day = (n) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString();
const item = (id, vec, extra = {}) => ({ id, subject: "Topuria", posted: false, seen_at: day(id), bucket: 3, reason: "junk", dup_of: null, vec, ...extra });

describe("cosine and rootOf", () => {
  test("cosine of a vector with itself is 1, orthogonal is 0", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
    assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  });

  test("rootOf follows dup_of to the root and stops on a cycle", () => {
    const a = item(1, [1, 0]);
    const b = item(2, [1, 0], { reason: "dup", dup_of: 1 });
    const c = item(3, [1, 0], { reason: "dup", dup_of: 2 });
    const byId = new Map([[1, a], [2, b], [3, c]]);
    assert.equal(rootOf(c, byId), 1);
    const x = item(9, [1, 0], { reason: "dup", dup_of: 10 });
    const y = item(10, [1, 0], { reason: "dup", dup_of: 9 });
    assert.ok([9, 10].includes(rootOf(x, new Map([[9, x], [10, y]]))));
  });
});

describe("storiesByArrival", () => {
  test("the story id is the first arrival, even when the labels root it at a later item", () => {
    const late = item(8, [1, 0], { seen_at: day(2) });                       // labelled root, arrived second
    const early = item(9, [1, 0], { seen_at: day(1), reason: "dup", dup_of: 8 }); // member, arrived first
    const storyOf = storiesByArrival([late, early]);
    assert.equal(storyOf.get(8), 9);
    assert.equal(storyOf.get(9), 9);
  });
});

describe("observe and score", () => {
  // Root R (posted), a near copy M1, a drifted M2 near M1 but far from R,
  // and a new useful story N that resembles M2 only.
  const R = item(1, [1, 0, 0], { posted: true, bucket: 2, reason: "fine" });
  const M1 = item(2, [0.95, 0.31, 0], { reason: "dup", dup_of: 1 });
  const M2 = item(3, [0.6, 0.8, 0], { reason: "dup", dup_of: 1 });
  const N = item(4, [0.3, 0.95, 0], { bucket: 2, reason: "missed" });
  const records = observe([R, M1, M2, N]);

  test("records name the nearest earlier item and the root similarity", () => {
    const m2 = records.find((r) => r.id === 3);
    assert.equal(m2.nearest.id, 2);
    assert.equal(m2.nearest.root, 1);
    assert.ok(m2.rootSimilarity < m2.nearest.similarity);
    assert.equal(records.find((r) => r.id === 1).isMember, false);
  });

  test("without a root guard the drifted member is caught and the useful stranger swallowed", () => {
    const s = score(records, 0.8, 0);
    assert.deepEqual([s.caught, s.missed, s.swallowedUseful, s.swallowedJunk, s.members, s.newStories], [2, 0, 1, 0, 2, 2]);
  });

  test("a root guard refuses the stranger at the price of the drifted member", () => {
    const s = score(records, 0.8, 0.7);
    assert.deepEqual([s.caught, s.missed, s.swallowedUseful], [1, 1, 0]);
  });

  test("a swallowed bucket-3 item counts as junk, not as a cost", () => {
    const J = item(5, [0.3, 0.95, 0], { seen_at: day(4) });
    const s = score(observe([R, M1, M2, J]), 0.8, 0);
    assert.deepEqual([s.swallowedUseful, s.swallowedJunk], [0, 1]);
  });

  test("the baseline sees only posted anchors", () => {
    const b = scoreBaseline(records, 0.8);
    // M1 is near the posted root; M2 and N have no posted item within 0.8.
    assert.deepEqual([b.caught, b.missed, b.swallowedUseful], [1, 1, 0]);
  });

  test("items outside the window or another subject are not neighbours", () => {
    const far = item(30, [1, 0, 0], { reason: "dup", dup_of: 1 });
    const other = item(5, [1, 0, 0], { subject: "Amosov" });
    const recs = observe([R, far, other]);
    assert.equal(recs.find((r) => r.id === 30).nearest, null);
    assert.equal(recs.find((r) => r.id === 5).nearest, null);
  });
});

describe("quantiles", () => {
  test("returns the requested cut points", () => {
    assert.deepEqual(quantiles([1, 2, 3, 4, 5], [0, 0.5, 1]), [1, 3, 5]);
    assert.deepEqual(quantiles([], [0.5]), [null]);
  });
});

describe("simulate (cascade)", () => {
  const item = (id, vec, extra = {}) => ({ id, subject: "Topuria", posted: false, seen_at: new Date(Date.UTC(2026, 7, 1 + id)).toISOString(), bucket: 3, reason: "junk", dup_of: null, vec, ...extra });
  // A → B → C drift: each is near the previous, C is far from A and is a new useful story.
  const A = item(1, [1, 0, 0], { posted: true, bucket: 2, reason: "fine" });
  const B = item(2, [0.85, 0.53, 0], { reason: "dup", dup_of: 1 });
  const C = item(3, [0.5, 0.87, 0], { bucket: 2, reason: "missed" });

  test("with held anchors and no root guard, the chain swallows the new story", () => {
    const s = simulate([A, B, C], 0.8, 0);
    assert.deepEqual([s.caught, s.swallowedUseful], [1, 1]);
  });

  test("a root guard breaks the chain", () => {
    const s = simulate([A, B, C], 0.8, 0.7);
    assert.deepEqual([s.caught, s.swallowedUseful], [1, 0]);
  });

  test("posted-only anchors never see the held member, so no chain", () => {
    const s = simulate([A, B, C], 0.8, 0, { postedOnly: true });
    assert.deepEqual([s.caught, s.swallowedUseful], [1, 0]);
  });
});
