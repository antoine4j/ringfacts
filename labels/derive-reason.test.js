// Unit coverage for labels/derive-reason.js, plus a run over every row of
// the real Sept 4 grading doc: it must not throw and must only ever produce
// an allowed code. Real notes come from docs/grading/2026-09-04-posted-30d.md.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deriveReason } from "./derive-reason.js";
import { parseGradingRow, finalBucket } from "../corpus/graded.js";

const ALLOWED_REASONS = ["fine", "junk", "dup", "old", "wrong", "loud", "missed", "other"];
const GRADING_DOC_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs/grading/2026-09-04-posted-30d.md"
);

describe("deriveReason — one rule at a time", () => {
  test("repeat of #N is a duplicate, pointing at that row", () => {
    const result = deriveReason(2, "Same Masvidal quote, Ukrainian edition *(repeat of #4)*");
    assert.equal(result.reason, "dup");
    assert.equal(result.dup_of, 4);
  });

  test("a bucket-2 row can still be a duplicate — a repeat is a repeat", () => {
    const result = deriveReason(2, "Masvidal touts him as future champ *(repeat of #4)*");
    assert.equal(result.reason, "dup");
    assert.equal(result.dup_of, 4);
  });

  test("stale event language is 'old' on a bucket-3 row", () => {
    const result = deriveReason(3, "Photo caption of the May fight, no content; stale event");
    assert.deepEqual(result, { reason: "old", dup_of: null });
  });

  test("a listicle is 'junk' on a bucket-3 row", () => {
    const result = deriveReason(3, "Ibiza celebrity listicle");
    assert.deepEqual(result, { reason: "junk", dup_of: null });
  });

  test("an 'About <someone else>' note is 'junk' on a bucket-3 row", () => {
    const result = deriveReason(3, "About Gaethje staying on");
    assert.deepEqual(result, { reason: "junk", dup_of: null });
  });

  test("a wrong/unofficial note is 'wrong' on a bucket-3 row", () => {
    const result = deriveReason(3, "Booking reported as confirmed but it was wrong — not official");
    assert.deepEqual(result, { reason: "wrong", dup_of: null });
  });

  test("an alert about something that never became an event is 'loud' on a bucket-3 row", () => {
    const result = deriveReason(3, "Sent as an alert, but this never became an event — non-event");
    assert.deepEqual(result, { reason: "loud", dup_of: null });
  });

  test("bucket 1 with no special signal is 'fine'", () => {
    const result = deriveReason(1, "Donchenko booked: Sept 5 UFC Paris vs Soriano");
    assert.deepEqual(result, { reason: "fine", dup_of: null });
  });

  test("bucket 2 with no special signal is 'fine'", () => {
    const result = deriveReason(2, "Donchenko on where his win bonus goes — his own interview");
    assert.deepEqual(result, { reason: "fine", dup_of: null });
  });

  test("bucket 3 with no special signal is 'junk'", () => {
    const result = deriveReason(3, "Ruffy's training footage");
    assert.deepEqual(result, { reason: "junk", dup_of: null });
  });

  test("stale/junk/wrong/loud language on a bucket-1 or bucket-2 row does not override 'fine'", () => {
    assert.deepEqual(deriveReason(2, "This is spam, stale, and wrong"), { reason: "fine", dup_of: null });
    assert.deepEqual(deriveReason(1, "About someone else entirely"), { reason: "fine", dup_of: null });
  });

  test("a bare 'repeat'/'again' with no #N in the note is 'other'", () => {
    assert.deepEqual(deriveReason(3, "This looks like a repeat, no source given"), {
      reason: "other",
      dup_of: null,
    });
  });
});

describe("deriveReason — every row of the real grading doc", () => {
  test("runs on all 103 rows without throwing, and only ever returns an allowed code", () => {
    const lines = readFileSync(GRADING_DOC_PATH, "utf8").split("\n");
    const rows = lines.map(parseGradingRow).filter((row) => row !== null);
    assert.equal(rows.length, 103);

    const tally = new Map();
    for (const row of rows) {
      const bucket = finalBucket(row);
      const { reason } = deriveReason(bucket, row.reason);
      assert.ok(ALLOWED_REASONS.includes(reason), `Row #${row.id}: "${reason}" is not an allowed reason`);
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    }

    console.log("Reason tally over 103 rows:", Object.fromEntries(tally));
  });
});
