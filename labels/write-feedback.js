// Writes the reviewed sheet into the feedback table, one article at a time in
// id order: the reviewer's row (author haiku|sonnet|claude, from the JSON
// outputs in tmp/labels/output) and Anton's row (author user, from the Anton
// column). UPSERT on (item_id, author), so re-running after later corrections
// updates rows in place. DRY_RUN=1 prints what would be written and stops.
//
//   DATABASE_URL=... node labels/write-feedback.js

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../lib/db.js";
import { parseSheetRow } from "./sheet.js";
import { readAntonCell } from "./anton-cell.js";
import { parseGradingRow } from "../corpus/graded.js";
import { resolveRoot } from "./stories.js";

const SHEET = "docs/grading/2026-09-05-all-articles.md";
const GRADING_DOC = "docs/grading/2026-09-04-posted-30d.md";
const OUTPUT_DIR = "tmp/labels/output";
const DRY_RUN = process.env.DRY_RUN === "1";

const UPSERT = `
  INSERT INTO feedback (item_id, claim_id, wanted_bucket, reason, dup_of, note, author, confidence, source)
  VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (item_id, author) DO UPDATE SET
    wanted_bucket = EXCLUDED.wanted_bucket, reason = EXCLUDED.reason, dup_of = EXCLUDED.dup_of,
    note = EXCLUDED.note, confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = now()`;

/**
 * Reviewer labels from the JSON outputs, keyed by item id; a stronger
 * reviewer's row replaces a weaker one's (claude > sonnet > haiku).
 *
 * @returns {Map<number, object>}
 */
function loadReviewerLabels() {
  const labels = new Map();
  for (const author of ["haiku", "sonnet", "claude"]) {
    const dir = join(OUTPUT_DIR, author);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      for (const row of JSON.parse(readFileSync(join(dir, name), "utf8"))) labels.set(row.id, { ...row, author });
    }
  }
  return labels;
}

/**
 * Ids Anton graded in the September doc — their user rows cite that doc.
 *
 * @returns {Set<number>}
 */
function loadGradedIds() {
  const ids = new Set();
  for (const line of readFileSync(GRADING_DOC, "utf8").split("\n")) {
    const row = parseGradingRow(line);
    if (row) ids.add(row.id);
  }
  return ids;
}

/**
 * Every data row of the review sheet, in id order.
 *
 * @returns {object[]}
 */
function loadSheetRows() {
  const rows = [];
  for (const line of readFileSync(SHEET, "utf8").split("\n")) {
    const row = parseSheetRow(line);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => a.id - b.id);
}

/**
 * The two feedback rows one sheet row produces.
 *
 * @param {object} sheetRow
 * @param {object|undefined} reviewer  JSON label for this id, if any.
 * @param {boolean} graded  Anton graded it in the September doc.
 * @returns {{ reviewerRow: object|null, userRow: object|null }}
 */
function rowsFor(sheetRow, reviewer, graded) {
  const reviewerRow = reviewer && sheetRow.author !== "user"
    ? { item_id: sheetRow.id, bucket: reviewer.bucket, reason: reviewer.reason, dup_of: reviewer.dup_of, note: reviewer.why, author: reviewer.author, confidence: reviewer.confidence, source: "backfill" }
    : null;

  // Anton's row: from his cell, with gaps filled from what the sheet shows.
  // A graded post with a blank cell still carries his 09-04 note as the
  // shown label, so it is read as "as graded": his word either way.
  const shown = { bucket: sheetRow.bucket, reason: sheetRow.reason, dup_of: sheetRow.dup_of, why: sheetRow.why, posted: sheetRow.machine === "posted" };
  const cell = sheetRow.anton || (sheetRow.author === "user" ? "as graded" : "");
  const decision = readAntonCell(cell, shown);
  const userRow = decision
    ? { item_id: sheetRow.id, bucket: decision.bucket, reason: decision.reason, dup_of: decision.dup_of, note: decision.note, author: "user", confidence: "high", source: graded ? "grading-doc" : "review-sheet" }
    : null;
  return { reviewerRow, userRow };
}

const sheetRows = loadSheetRows();
const reviewerLabels = loadReviewerLabels();
const gradedIds = loadGradedIds();

// Build every row first, so a bad sheet line fails before any write.
const pending = [];
let unreviewed = 0;
for (const sheetRow of sheetRows) {
  const { reviewerRow, userRow } = rowsFor(sheetRow, reviewerLabels.get(sheetRow.id), gradedIds.has(sheetRow.id));
  if (reviewerRow) pending.push(reviewerRow);
  if (userRow) pending.push(userRow);
  else unreviewed += 1;
  if ((reviewerRow?.reason === "dup" && !reviewerRow.dup_of) || (userRow?.reason === "dup" && !userRow.dup_of)) {
    throw new Error(`#${sheetRow.id}: dup without dup_of`);
  }
}
// Every dup points at its story's root: follow chains through the user
// rows (Anton's word) where they exist, else the reviewer's.
const currentByItem = new Map();
for (const row of pending) {
  const existing = currentByItem.get(row.item_id);
  if (!existing || row.author === "user") currentByItem.set(row.item_id, { reason: row.reason, dup_of: row.dup_of });
}
let rerooted = 0;
for (const row of pending) {
  if (row.reason !== "dup") continue;
  const root = resolveRoot(row.item_id, currentByItem);
  if (root !== row.dup_of) { row.dup_of = root; rerooted += 1; }
}
console.error(`${sheetRows.length} sheet rows -> ${pending.length} feedback rows; ${unreviewed} rows have an empty Anton cell; ${rerooted} dup links re-pointed at their root`);
if (DRY_RUN) { console.error("DRY_RUN=1: nothing written"); process.exit(0); }

// Write in id order, one statement per row.
const db = await openDb();
for (const row of pending) {
  await db.query(UPSERT, [row.item_id, row.bucket, row.reason, row.dup_of, row.note, row.author, row.confidence, row.source]);
}
const { rows } = await db.query("SELECT author, count(*) FROM feedback GROUP BY author ORDER BY author");
await db.end();
console.error("feedback rows per author:", rows.map((row) => `${row.author}=${row.count}`).join(" "));
