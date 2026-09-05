// Unit coverage for labels/doubts.js: which rows count as a disagreement
// with the pipeline, and which rows get pulled for a second read.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { overturns, pickDoubts } from "./doubts.js";

describe("overturns", () => {
  test("dup group: reason 'dup' agrees with the machine", () => {
    assert.equal(overturns("dup", { bucket: 1, reason: "dup" }), false);
  });

  test("dup group: reason 'missed' overturns the machine", () => {
    assert.equal(overturns("dup", { bucket: 1, reason: "missed" }), true);
  });

  test("wrong-subject group: reason 'junk' agrees with the machine", () => {
    assert.equal(overturns("wrong-subject", { bucket: 3, reason: "junk" }), false);
  });

  test("wrong-subject group: reason 'dup' also agrees with the machine", () => {
    assert.equal(overturns("wrong-subject", { bucket: 3, reason: "dup" }), false);
  });

  test("wrong-subject group: reason 'missed' overturns the machine", () => {
    assert.equal(overturns("wrong-subject", { bucket: 1, reason: "missed" }), true);
  });

  test("posted-new group: bucket 3 overturns the machine", () => {
    assert.equal(overturns("posted-new", { bucket: 3, reason: "junk" }), true);
  });

  test("posted-new group: bucket 1 agrees with the machine", () => {
    assert.equal(overturns("posted-new", { bucket: 1, reason: "fine" }), false);
  });
});

describe("pickDoubts", () => {
  test("includes low-confidence rows even when they agree", () => {
    const labels = [{ bucket: 1, reason: "fine", confidence: "low" }];
    assert.deepEqual(pickDoubts("posted-new", labels), labels);
  });

  test("includes reason 'dup' rows whose bucket is not 3 (inconsistent)", () => {
    const labels = [{ bucket: 1, reason: "dup", confidence: "high" }];
    assert.deepEqual(pickDoubts("posted-new", labels), labels);
  });

  test("a reason 'dup' row with bucket 3 is consistent, not flagged by that rule", () => {
    const labels = [{ bucket: 3, reason: "dup", confidence: "high" }];
    // posted-new: bucket 3 overturns regardless, so it is still picked —
    // use the dup group, where bucket 3 + dup is neither an overturn nor
    // inconsistent, to isolate the inconsistency rule.
    assert.deepEqual(pickDoubts("dup", labels), []);
  });

  test("excludes a confident, agreeing row", () => {
    const labels = [{ bucket: 1, reason: "fine", confidence: "high" }];
    assert.deepEqual(pickDoubts("posted-new", labels), []);
  });
});
