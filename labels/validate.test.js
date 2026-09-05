// Unit coverage for labels/validate.js: a valid batch reports nothing, and
// each kind of problem is reported on its own.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateBatch } from "./validate.js";

/** A valid output row for the given input row. */
function makeOutput(input, overrides = {}) {
  return {
    id: input.id,
    bucket: 1,
    reason: "fine",
    confidence: "high",
    body_quality: "good",
    dup_of: null,
    why: "a reason",
    ...overrides,
  };
}

describe("validateBatch", () => {
  test("a valid batch reports no problems", () => {
    const input = [{ id: 1 }, { id: 2 }];
    const output = input.map((row) => makeOutput(row));
    assert.deepEqual(validateBatch(input, output), []);
  });

  test("a length mismatch is reported", () => {
    const input = [{ id: 1 }, { id: 2 }];
    const output = [makeOutput(input[0])];
    const problems = validateBatch(input, output);
    assert.ok(problems.some((problem) => problem.includes("expected 2 rows, got 1")));
  });

  test("an id out of order is reported", () => {
    const input = [{ id: 1 }, { id: 2 }];
    const output = [makeOutput({ id: 2 }), makeOutput({ id: 1 })];
    const problems = validateBatch(input, output);
    assert.ok(problems.some((problem) => problem.includes("id 2, expected 1")));
  });

  test("a dup reason without dup_of is reported", () => {
    const input = [{ id: 5 }];
    const output = [makeOutput(input[0], { reason: "dup", dup_of: null })];
    const problems = validateBatch(input, output);
    assert.ok(problems.some((problem) => problem.includes("#5: dup without dup_of")));
  });

  test("a dup_of not earlier than the id is reported", () => {
    const input = [{ id: 5 }];
    const output = [makeOutput(input[0], { reason: "dup", dup_of: 5 })];
    const problems = validateBatch(input, output);
    assert.ok(problems.some((problem) => problem.includes("#5: dup_of 5 is not earlier")));
  });

  test("a bucket/reason disagreement is reported", () => {
    const input = [{ id: 5 }];
    const output = [makeOutput(input[0], { bucket: 3, reason: "fine" })];
    const problems = validateBatch(input, output);
    assert.ok(problems.some((problem) => problem.includes("#5: bucket 3 disagrees with reason fine")));
  });
});
