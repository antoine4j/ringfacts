// The pure logic behind corpus/build-graded.js: parsing grading-table rows,
// resolving Anton's final bucket, and splitting ids into prompt/tune/holdout.
// No database, no filesystem — see corpus/graded.js.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseGradingRow, finalBucket, assignSplits } from "../corpus/graded.js";

describe("parseGradingRow + finalBucket", () => {
  test("'as graded' defers to Claude's bucket", () => {
    const row = parseGradingRow(
      "| [#16](https://sport24.ua/x) | 08-07 | Donchenko | sport24.ua | **1** | Donchenko booked | as graded |"
    );
    assert.equal(row.id, 16);
    assert.equal(row.claude, 1);
    assert.equal(finalBucket(row), 1);
  });

  test("'**3** (overruled from 2)' takes Anton's digit, not Claude's", () => {
    const row = parseGradingRow(
      "| [#50](https://mmasucka.com/x) | 08-08 | Topuria | MMA Sucka | **2** | welterweight opinion | **3** (overruled from 2) |"
    );
    assert.equal(row.claude, 2);
    assert.equal(finalBucket(row), 3);
  });

  test("'2 (overruled to 3 ... back to 2 ...)' takes the first digit — the final call", () => {
    const row = parseGradingRow(
      "| [#21](https://example.test/x) | 08-07 | Amosov | Example | **2** | callout | 2 (overruled to 3 in the morning, back to 2 the same evening: a callout is about him) |"
    );
    assert.equal(finalBucket(row), 2);
  });

  test("'3 — wants a future *lifestyle* category' takes the leading digit", () => {
    const row = parseGradingRow(
      "| [#380](https://example.test/x) | 08-20 | Topuria | Example | **3** | lifestyle | 3 — wants a future *lifestyle* category for this kind |"
    );
    assert.equal(finalBucket(row), 3);
  });

  test("non-data rows (header, separator, prose) parse to null", () => {
    assert.equal(parseGradingRow("| # | date | fighter | source | Claude | why | Anton |"), null);
    assert.equal(parseGradingRow("|---|---|---|---|---|---|---|"), null);
    assert.equal(parseGradingRow("Some prose line, not a table row."), null);
  });

  test("an unrecognized Anton cell throws loudly", () => {
    const row = parseGradingRow(
      "| [#99](https://example.test/x) | 08-07 | Amosov | Example | **2** | reason | who knows |"
    );
    assert.throws(() => finalBucket(row), /could not find a bucket digit/);
  });
});

describe("assignSplits", () => {
  test("prompt ids are fixed regardless of bucket", () => {
    const rows = [
      { id: 21, bucket: 2 },
      { id: 50, bucket: 3 },
      { id: 1, bucket: 2 },
      { id: 2, bucket: 2 },
    ];
    const splits = assignSplits(rows);
    assert.equal(splits.get(21), "prompt");
    assert.equal(splits.get(50), "prompt");
  });

  test("tune/holdout alternate per bucket in ascending id order", () => {
    const rows = [
      { id: 5, bucket: 3 },
      { id: 3, bucket: 3 },
      { id: 1, bucket: 3 },
      { id: 10, bucket: 2 },
      { id: 8, bucket: 2 },
    ];
    const splits = assignSplits(rows);
    // Bucket 3, ascending: 1, 3, 5 -> tune, holdout, tune
    assert.equal(splits.get(1), "tune");
    assert.equal(splits.get(3), "holdout");
    assert.equal(splits.get(5), "tune");
    // Bucket 2, ascending: 8, 10 -> tune, holdout
    assert.equal(splits.get(8), "tune");
    assert.equal(splits.get(10), "holdout");
  });

  test("splits stay balanced per bucket (counts differ by at most one)", () => {
    const rows = [];
    for (let id = 1; id <= 11; id++) rows.push({ id, bucket: 1 });
    const splits = assignSplits(rows);
    const tuneCount = [...splits.values()].filter((s) => s === "tune").length;
    const holdoutCount = [...splits.values()].filter((s) => s === "holdout").length;
    assert.ok(Math.abs(tuneCount - holdoutCount) <= 1);
    assert.equal(tuneCount + holdoutCount, 11);
  });
});
