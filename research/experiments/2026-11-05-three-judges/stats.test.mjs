import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementCounts, fleissKappa, majority, share } from "./stats.mjs";

test("a share carries its Wilson range", () => {
  const result = share(70, 80);
  assert.equal(result.pct, 87.5);
  assert.ok(result.low > 78 && result.low < 80, String(result.low));
  assert.ok(result.high > 92 && result.high < 94, String(result.high));
  assert.equal(share(0, 0).text, "–");
});

test("the majority answer, its count, and whether all agreed", () => {
  assert.deepEqual(majority(["a", "a", "b"]), { answer: "a", count: 2, raters: 3, unanimous: false });
  assert.deepEqual(majority(["a", "a", "a"]), { answer: "a", count: 3, raters: 3, unanimous: true });
  assert.equal(majority(["a", null, "a"]).raters, 2);
  assert.equal(majority([null]), null);
});

test("Fleiss' kappa is 1 on full agreement and about 0 on chance", () => {
  assert.equal(fleissKappa([["a", "a", "a"], ["b", "b", "b"]]), 1);
  // Every split the same way: raters agree no more than chance.
  const kappa = fleissKappa([["a", "b", "c"], ["a", "b", "c"], ["b", "c", "a"]]);
  assert.ok(kappa <= 0, String(kappa));
  assert.equal(fleissKappa([]), null);
});

test("Fleiss' kappa matches a worked example", () => {
  // Three raters, two categories; 6 items unanimous, 4 split 2–1 one way, 2 the other.
  const items = [...Array(6).fill(["y", "y", "y"]), ...Array(4).fill(["y", "y", "n"]), ...Array(2).fill(["n", "n", "y"])];
  // P̄ = (6·1 + 6·(1/3)) / 12 = 2/3; p_y = 28/36, p_n = 8/36; Pe = (7/9)² + (2/9)² = 53/81; κ = (2/3 − 53/81) / (1 − 53/81) = 1/28.
  assert.equal(fleissKappa(items), Math.round(1000 / 28) / 1000);
});

test("items split by how many agreed", () => {
  assert.deepEqual(agreementCounts([["a", "a", "a"], ["a", "a", "b"], ["a", "b", "c"]]), { unanimous: 1, majority: 1, split: 1, items: 3 });
});
