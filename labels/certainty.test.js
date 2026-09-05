// Unit coverage for labels/certainty.js: comparing labels, sureness, and
// plainness of graded posts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { labelsAgree, isSure, isPlainGraded } from "./certainty.js";

describe("labelsAgree", () => {
  test("same bucket non-dup → true", () => {
    const first = { bucket: 1, reason: "fine" };
    const second = { bucket: 1, reason: "fine" };
    assert.equal(labelsAgree(first, second, new Set()), true);
  });

  test("different bucket → false", () => {
    const first = { bucket: 1, reason: "fine" };
    const second = { bucket: 3, reason: "fine" };
    assert.equal(labelsAgree(first, second, new Set()), false);
  });

  test("both dup same dup_of → true", () => {
    const first = { bucket: 1, reason: "dup", dup_of: 42 };
    const second = { bucket: 1, reason: "dup", dup_of: 42 };
    assert.equal(labelsAgree(first, second, new Set()), true);
  });

  test("both dup different dup_of but both targets in postedIds → true", () => {
    const first = { bucket: 1, reason: "dup", dup_of: 42 };
    const second = { bucket: 1, reason: "dup", dup_of: 99 };
    const postedIds = new Set([42, 99]);
    assert.equal(labelsAgree(first, second, postedIds), true);
  });

  test("both dup different dup_of, one target not posted → false", () => {
    const first = { bucket: 1, reason: "dup", dup_of: 42 };
    const second = { bucket: 1, reason: "dup", dup_of: 99 };
    const postedIds = new Set([42]);
    assert.equal(labelsAgree(first, second, postedIds), false);
  });
});

describe("isSure", () => {
  test("bucket 2 → false", () => {
    const label = { bucket: 2, reason: "fine", confidence: "high" };
    assert.equal(isSure("posted-new", label, null, new Set()), false);
  });

  test("confidence low → false", () => {
    const label = { bucket: 3, reason: "junk", confidence: "low" };
    assert.equal(isSure("posted-new", label, null, new Set()), false);
  });

  test("wrong-subject group with junk and no blind → true", () => {
    const label = { bucket: 3, reason: "junk", confidence: "high" };
    assert.equal(isSure("wrong-subject", label, null, new Set()), true);
  });

  test("wrong-subject with reason dup → false", () => {
    const label = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    assert.equal(isSure("wrong-subject", label, null, new Set()), false);
  });

  test("dup group with no blind → false", () => {
    const label = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    assert.equal(isSure("dup", label, null, new Set()), false);
  });

  test("dup group with agreeing blind → true", () => {
    const label = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    const blind = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    assert.equal(isSure("dup", label, blind, new Set()), true);
  });

  test("dup group with blind of low confidence → false", () => {
    const label = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    const blind = { bucket: 3, reason: "dup", confidence: "low", dup_of: 5 };
    assert.equal(isSure("dup", label, blind, new Set()), false);
  });

  test("dup group with disagreeing blind → false", () => {
    const label = { bucket: 3, reason: "dup", confidence: "high", dup_of: 5 };
    const blind = { bucket: 3, reason: "dup", confidence: "high", dup_of: 99 };
    const postedIds = new Set();
    assert.equal(isSure("dup", label, blind, postedIds), false);
  });
});

describe("isPlainGraded", () => {
  test("{bucket 3, reason junk} → true", () => {
    const label = { bucket: 3, reason: "junk" };
    assert.equal(isPlainGraded(label), true);
  });

  test("{bucket 2, reason fine} → true", () => {
    const label = { bucket: 2, reason: "fine" };
    assert.equal(isPlainGraded(label), true);
  });

  test("{bucket 2, reason dup} → false", () => {
    const label = { bucket: 2, reason: "dup" };
    assert.equal(isPlainGraded(label), false);
  });

  test("{bucket 3, reason old} → false", () => {
    const label = { bucket: 3, reason: "old" };
    assert.equal(isPlainGraded(label), false);
  });

  test("{bucket 3, reason fine} → false", () => {
    const label = { bucket: 3, reason: "fine" };
    assert.equal(isPlainGraded(label), false);
  });
});
