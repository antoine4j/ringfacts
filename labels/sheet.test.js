// Unit coverage for labels/sheet.js: the review sheet row format round-trips,
// non-data lines parse to null, and machineSaid covers every outcome.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatSheetRow, parseSheetRow, machineSaid } from "./sheet.js";

/** A valid row, overridable per test. */
function makeRow(overrides = {}) {
  return {
    id: 16,
    url: "https://sport24.ua/x",
    date: "08-07",
    fighter: "Donchenko",
    source: "sport24.ua",
    machine: "posted",
    bucket: 1,
    author: "haiku",
    reason: "fine",
    dup_of: null,
    why: "Donchenko booked",
    anton: "",
    ...overrides,
  };
}

describe("formatSheetRow + parseSheetRow — round trip", () => {
  test("haiku author carries no suffix", () => {
    const row = makeRow({ author: "haiku" });
    const parsed = parseSheetRow(formatSheetRow(row));
    assert.equal(parsed.author, "haiku");
    assert.deepEqual(parsed, row);
  });

  test("sonnet author round-trips with a '(sonnet)' suffix", () => {
    const row = makeRow({ author: "sonnet" });
    const line = formatSheetRow(row);
    assert.match(line, /\(sonnet\)/);
    assert.deepEqual(parseSheetRow(line), row);
  });

  test("claude author round-trips with a '(claude)' suffix", () => {
    const row = makeRow({ author: "claude" });
    const line = formatSheetRow(row);
    assert.match(line, /\(claude\)/);
    assert.deepEqual(parseSheetRow(line), row);
  });

  test("dup_of null renders as an empty cell and parses back to null", () => {
    const row = makeRow({ dup_of: null });
    const line = formatSheetRow(row);
    const cells = line.split("|").map((cell) => cell.trim());
    // Cells: ["", id, date, fighter, source, machine, bucket, reason, dup_of, why, anton, ""]
    assert.equal(cells[8], "");
    assert.equal(parseSheetRow(line).dup_of, null);
  });

  test("a '|' inside why is escaped and comes back intact", () => {
    const row = makeRow({ why: "Booked: A vs B | per source" });
    const line = formatSheetRow(row);
    const parsed = parseSheetRow(line);
    assert.equal(parsed.why, row.why);
  });
});

describe("parseSheetRow — non-data lines", () => {
  test("the header row parses to null", () => {
    const header = "| # | date | fighter | source | machine | bucket | reason | dup_of | why | anton |";
    assert.equal(parseSheetRow(header), null);
  });

  test("the separator row parses to null", () => {
    const separator = "|---|---|---|---|---|---|---|---|---|---|";
    assert.equal(parseSheetRow(separator), null);
  });

  test("a prose line parses to null", () => {
    assert.equal(parseSheetRow("Some prose line, not a table row."), null);
  });

  test("a 7-column row from the old grading doc parses to null", () => {
    const oldRow = "| [#16](https://sport24.ua/x) | 08-07 | Donchenko | sport24.ua | **1** | Donchenko booked | as graded |";
    assert.equal(parseSheetRow(oldRow), null);
  });
});

describe("machineSaid", () => {
  test("posted", () => {
    assert.equal(machineSaid({ posted: true }), "posted");
  });

  test("held: dup of #N (embedding gate)", () => {
    const item = { posted: false, held_reason: "embedding", counterpart: { id: 4 } };
    assert.equal(machineSaid(item), "held: dup of #4");
  });

  test("held: matched claim #C (origin #M)", () => {
    const item = {
      posted: false,
      held_reason: "llm",
      counterpart: { claim_id: 7, origin: { id: 3 } },
    };
    assert.equal(machineSaid(item), "held: matched claim #7 (origin #3)");
  });

  test("held: matched claim #C without an origin", () => {
    const item = { posted: false, held_reason: "official", counterpart: { claim_id: 9 } };
    assert.equal(machineSaid(item), "held: matched claim #9");
  });

  test("held: wrong subject", () => {
    assert.equal(machineSaid({ posted: false, held_reason: "wrong_subject" }), "held: wrong subject");
  });

  test("held: same url as #N", () => {
    const item = { posted: false, held_reason: "url", counterpart: { id: 12 } };
    assert.equal(machineSaid(item), "held: same url as #12");
  });

  test("held: folded (anything else)", () => {
    assert.equal(machineSaid({ posted: false, held_reason: "folded" }), "held: folded");
  });
});
