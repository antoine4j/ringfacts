// Builds corpus/graded-2026-09.json from Anton's 2026-09-04 grading pass —
// the September counterpart to corpus/build.js. Reads the graded table in
// docs/grading/2026-09-04-posted-30d.md for the final buckets, then pulls
// each item's body and production metadata from the items table.
//
//   DATABASE_URL=$(neonctl connection-string test --project-id calm-mouse-60802247 \
//     --database-name prod) node corpus/build-graded.js
//
// Read-only against the database: one SELECT, no writes, no deletes.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";
import { parseGradingRow, finalBucket, assignSplits } from "./graded.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GRADING_DOC = "docs/grading/2026-09-04-posted-30d.md";
const OUTPUT_PATH = join(HERE, "graded-2026-09.json");

/**
 * Reads the grading markdown file and returns every parsed, bucketed row.
 *
 * @param {string} path  Path to the grading markdown file.
 * @returns {{ id: number, url: string, date: string, fighter: string,
 *   source: string, claude: number, reason: string, anton: string,
 *   bucket: number }[]}
 */
function parseGradingTable(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const rows = [];
  for (const line of lines) {
    const row = parseGradingRow(line);
    if (!row) continue;
    rows.push({ ...row, bucket: finalBucket(row) });
  }
  return rows;
}

/**
 * Turns a "MM-DD" grading-table date into a full 2026-MM-DD string.
 *
 * @param {string} shortDate
 * @returns {string}
 */
function fullDate(shortDate) {
  return `2026-${shortDate}`;
}

/**
 * Builds one corpus item, joining a parsed grading row with its database
 * record. Field names mirror corpus/tune.json where they overlap.
 *
 * @param {object} row      Output of parseGradingTable, plus `bucket`.
 * @param {object|null} dbRow  The matching items-table row, or null if missing.
 * @param {string} split    "prompt" | "tune" | "holdout".
 * @returns {object}
 */
function buildCorpusItem(row, dbRow, split) {
  const body = dbRow?.body ?? null;
  return {
    key: `a${row.id}`,
    archive_id: row.id,
    split,
    class: "graded",
    subject: dbRow?.subject ?? null,
    title: dbRow?.title ?? null,
    source: dbRow?.source ?? row.source,
    url: dbRow?.resolved_url ?? dbRow?.url ?? row.url,
    published_at: dbRow?.published_at ?? null,
    edition: dbRow?.edition ?? null,
    body,
    body_chars: body ? body.length : 0,
    body_via: dbRow?.body_via ?? null,
    production: {
      posted: dbRow?.posted ?? null,
      held_reason: dbRow?.held_reason ?? null,
      digest_tier: dbRow?.digest_tier ?? null,
      subject_role: dbRow?.subject_role ?? null,
    },
    expect: { bucket: row.bucket },
    grading: {
      claude: row.claude,
      anton: row.anton,
      reason: row.reason,
      date: fullDate(row.date),
      fighter: row.fighter,
    },
    note: row.reason,
  };
}

/** Fetches the items rows this corpus needs, keyed by id. */
async function fetchArchiveItems(db, ids) {
  const { rows } = await db.query(
    `SELECT id, url, resolved_url, subject, title, source, published_at, posted,
            held_reason, digest_tier, subject_role, body_via, edition, body
       FROM items WHERE id = ANY($1)`,
    [ids]
  );
  return new Map(rows.map((dbRow) => [Number(dbRow.id), dbRow]));
}

const gradingRows = parseGradingTable(join(HERE, "..", GRADING_DOC));
console.error(`Parsed ${gradingRows.length} graded rows from ${GRADING_DOC}`);

const splitById = assignSplits(gradingRows);

const db = await openDb();
const byId = await fetchArchiveItems(db, gradingRows.map((row) => row.id));
await db.end();

// Sorted by id, per the output spec.
const sortedRows = [...gradingRows].sort((a, b) => a.id - b.id);

const items = sortedRows.map((row) =>
  buildCorpusItem(row, byId.get(row.id) ?? null, splitById.get(row.id))
);

const output = {
  split: "graded-2026-09",
  source: GRADING_DOC,
  built_at: new Date().toISOString(),
  items,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.error(`Wrote ${items.length} items to ${OUTPUT_PATH}`);

// Reporting: counts per bucket per split, null bodies, missing db rows.
const missingIds = sortedRows.filter((row) => !byId.has(row.id)).map((row) => row.id);
const nullBodyCount = items.filter((item) => item.body === null).length;
const counts = new Map();
for (const item of items) {
  const bucketKey = `${item.expect.bucket}/${item.split}`;
  counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
}
console.error("Counts per bucket/split:");
for (const [key, count] of [...counts.entries()].sort()) {
  console.error(`  ${key}: ${count}`);
}
console.error(`Items with null body: ${nullBodyCount}`);
console.error(`Ids missing from items table: ${missingIds.length ? missingIds.join(", ") : "none"}`);
