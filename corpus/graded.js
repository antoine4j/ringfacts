// Pure logic for building the graded-2026-09 corpus: parsing the grading
// table's markdown rows, resolving Anton's final bucket, and splitting items
// into prompt / tune / holdout. No database or filesystem access here — that
// lives in build-graded.js — so these functions can be unit tested directly.

/**
 * Parses one markdown table row from the grading doc into its fields.
 * Row shape: `| [#16](url) | 08-07 | Donchenko | sport24.ua | **1** | reason | anton |`
 *
 * @param {string} line  One raw markdown table row.
 * @returns {{ id: number, url: string, date: string, fighter: string,
 *   source: string, claude: number, reason: string, anton: string } | null}
 *   null if the line is not a data row (header, separator, blank).
 */
export function parseGradingRow(line) {
  const cells = splitRowCells(line);
  if (cells.length !== 7) return null;

  const idMatch = cells[0].match(/^\[#(\d+)\]\(([^)]+)\)$/);
  const claudeMatch = cells[4].match(/\*\*(\d)\*\*/);
  if (!idMatch || !claudeMatch) return null;

  return {
    id: Number(idMatch[1]),
    url: idMatch[2],
    date: cells[1],
    fighter: cells[2],
    source: cells[3],
    claude: Number(claudeMatch[1]),
    reason: cells[5],
    anton: cells[6],
  };
}

/**
 * Splits a markdown table row into its trimmed cell strings, dropping the
 * empty strings the leading/trailing "|" produce.
 *
 * @param {string} line
 * @returns {string[]}
 */
function splitRowCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const raw = trimmed.split("|");
  return raw.slice(1, -1).map((cell) => cell.trim());
}

/**
 * Resolves a row's final bucket (1, 2 or 3) from Claude's bucket and Anton's
 * cell. "as graded" defers to Claude; anything else is Anton's own call, read
 * as the first digit in his cell — covering plain digits, "**N** (overruled
 * from M)", "N (confirmed)", "N (overruled to ... )" and "N — free text".
 *
 * @param {{ claude: number, anton: string }} row
 * @returns {number}  1, 2 or 3.
 * @throws {Error} if no bucket digit can be found.
 */
export function finalBucket(row) {
  const anton = row.anton.trim();

  // "as graded" means Anton left Claude's pre-grading standing.
  if (anton === "as graded") return requireBucket(row.claude, row);

  const digitMatch = anton.match(/[123]/);
  if (!digitMatch) {
    throw new Error(`Row #${row.id}: could not find a bucket digit in Anton's cell "${anton}"`);
  }
  return requireBucket(Number(digitMatch[0]), row);
}

/** Confirms a bucket value is 1, 2 or 3; throws with the row id otherwise. */
function requireBucket(bucket, row) {
  if (![1, 2, 3].includes(bucket)) {
    throw new Error(`Row #${row.id}: bucket ${bucket} is not 1, 2 or 3`);
  }
  return bucket;
}

// Worked examples in docs/goals.md, reserved as few-shot prompt material
// rather than tune/holdout evaluation data.
const PROMPT_IDS = new Set([21, 50, 256, 43, 318, 340, 194, 226, 279, 523, 291, 320, 547, 380]);

/**
 * Assigns each row a split: "prompt" for the fixed worked-example ids;
 * otherwise "tune" and "holdout" alternate within each bucket, in ascending
 * id order, so the two splits stay balanced per bucket.
 *
 * @param {{ id: number, bucket: number }[]} rows  Any order.
 * @returns {Map<number, string>}  id -> split.
 */
export function assignSplits(rows) {
  const splitById = new Map();
  const byBucket = new Map([[1, []], [2, []], [3, []]]);

  // Fixed prompt ids first; everything else queues up per bucket for the
  // tune/holdout alternation.
  for (const row of rows) {
    if (PROMPT_IDS.has(row.id)) {
      splitById.set(row.id, "prompt");
    } else {
      byBucket.get(row.bucket).push(row.id);
    }
  }

  for (const ids of byBucket.values()) {
    const sorted = [...ids].sort((a, b) => a - b);
    sorted.forEach((id, index) => {
      splitById.set(id, index % 2 === 0 ? "tune" : "holdout");
    });
  }

  return splitById;
}
