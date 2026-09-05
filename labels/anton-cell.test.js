// Unit coverage for labels/anton-cell.js: empty cells parse to null,
// "as graded" accepts the reviewer's label, and corrections override
// bucket/reason/dup_of while keeping gaps filled from the reviewer.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readAntonCell } from "./anton-cell.js";

/** A valid reviewer object, overridable per test. */
function makeReviewer(overrides = {}) {
  return {
    bucket: 3,
    reason: "dup",
    dup_of: 45,
    why: "Same quote as #45",
    ...overrides,
  };
}

describe("readAntonCell — empty cells", () => {
  test('empty string returns null', () => {
    const result = readAntonCell("", makeReviewer());
    assert.equal(result, null);
  });

  test('whitespace-only string returns null', () => {
    const result = readAntonCell("   ", makeReviewer());
    assert.equal(result, null);
  });
});

describe("readAntonCell — 'as graded' acceptance", () => {
  test('"as graded" accepts reviewer values with accepted: true', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("as graded", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 45,
      note: "Same quote as #45",
      accepted: true,
    });
  });

  test('"as graded — <his words>" accepts the reviewer values and keeps his words as the note', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("as graded — check reason", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 45,
      note: "as graded — check reason",
      accepted: true,
    });
  });

  test('"AS GRADED" (uppercase) accepts with accepted: true', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("AS GRADED", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 45,
      note: "Same quote as #45",
      accepted: true,
    });
  });
});

describe("readAntonCell — 'as graded' consistency", () => {
  test("accepting a dup label on a bucket-2 row stores bucket 3", () => {
    const result = readAntonCell("as graded — yes, dup", { bucket: 2, reason: "dup", dup_of: 4, why: "repeat of #4" });
    assert.deepEqual([result.bucket, result.reason, result.dup_of, result.note], [3, "dup", 4, "as graded — yes, dup"]);
  });
});

describe("readAntonCell — held and posted sides", () => {
  test('"2 fine" on a held row is recorded as missed, with no dup_of', () => {
    const result = readAntonCell("2 — fine, I want to hear it", makeReviewer());
    assert.equal(result.reason, "missed");
    assert.equal(result.dup_of, null);
  });

  test("a #N mention on a useful row does not leave a dup_of behind", () => {
    const result = readAntonCell("2 — same remarks as #46, borderline", makeReviewer());
    assert.deepEqual([result.bucket, result.reason, result.dup_of], [2, "missed", null]);
  });
});

describe("readAntonCell — bucket digit overrides", () => {
  test('bare digit "2" on a held row becomes "missed"; on a posted row "fine"', () => {
    const held = readAntonCell("2", makeReviewer());
    assert.deepEqual(held, { bucket: 2, reason: "missed", dup_of: null, note: "2", accepted: false });
    const posted = readAntonCell("2", { ...makeReviewer(), posted: true });
    assert.equal(posted.reason, "fine");
  });

  test('"2 missed" sets bucket 2, reason "missed", dup_of null', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("2 missed", reviewer);
    assert.deepEqual(result, {
      bucket: 2,
      reason: "missed",
      dup_of: null,
      note: "2 missed",
      accepted: false,
    });
  });

  test('"3 (overruled from 2)" sets bucket 3 and keeps reason from reviewer', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("3 (overruled from 2)", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 45,
      note: "3 (overruled from 2)",
      accepted: false,
    });
  });
});

describe("readAntonCell — reason code and dup_of overrides", () => {
  test('"dup of #12" sets reason "dup" and dup_of 12, bucket from reviewer', () => {
    const reviewer = makeReviewer({ bucket: 2 });
    const result = readAntonCell("dup of #12", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 12,
      note: "dup of #12",
      accepted: false,
    });
  });

  test('"junk — one name among many" sets reason "junk", bucket 3, dup_of null', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell("junk — one name among many", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "junk",
      dup_of: null,
      note: "junk — one name among many",
      accepted: false,
    });
  });

  test('"#7" alone sets reason "dup", dup_of 7, bucket 3', () => {
    const reviewer = makeReviewer({ bucket: 1, reason: "fine", dup_of: null });
    const result = readAntonCell("#7", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "dup",
      dup_of: 7,
      note: "#7",
      accepted: false,
    });
  });
});

describe("readAntonCell — edge cases", () => {
  test("digit with reason override (e.g., '2 fine') uses both overrides on a posted row", () => {
    const reviewer = makeReviewer({ reason: "dup", posted: true });
    const result = readAntonCell("2 fine", reviewer);
    assert.deepEqual(result, {
      bucket: 2,
      reason: "fine",
      dup_of: null,
      note: "2 fine",
      accepted: false,
    });
  });

  test('null cell handled gracefully', () => {
    const reviewer = makeReviewer();
    const result = readAntonCell(null, reviewer);
    assert.equal(result, null);
  });

  test('"old" reason without digit defaults bucket to 3', () => {
    const reviewer = makeReviewer({ reason: "fine", bucket: 1 });
    const result = readAntonCell("old", reviewer);
    assert.deepEqual(result, {
      bucket: 3,
      reason: "old",
      dup_of: null,
      note: "old",
      accepted: false,
    });
  });
});
