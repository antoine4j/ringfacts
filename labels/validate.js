// Checks a reviewer output file against its input batch: same ids in the
// same order, allowed values only, dup_of present when reason is dup.
// Pure; used by labels/check-outputs.js and the tests.

export const REASONS = ["fine", "junk", "dup", "old", "wrong", "loud", "missed", "other"];
export const CONFIDENCES = ["high", "medium", "low"];
export const BODY_QUALITIES = ["good", "truncated", "furniture", "none"];

/**
 * Validates one output array against its input rows.
 *
 * @param {object[]} input   Rows from tmp/labels/input/<batch>.json.
 * @param {object[]} output  Rows the reviewer wrote.
 * @returns {string[]}  Problems found; empty means valid.
 */
export function validateBatch(input, output) {
  const problems = [];
  if (!Array.isArray(output)) return ["output is not an array"];
  if (output.length !== input.length) problems.push(`expected ${input.length} rows, got ${output.length}`);

  // Check each row's values against the enums and its input twin.
  output.forEach((row, index) => {
    const expectedId = input[index]?.id;
    if (row.id !== expectedId) problems.push(`row ${index}: id ${row.id}, expected ${expectedId}`);
    if (![1, 2, 3].includes(row.bucket)) problems.push(`#${row.id}: bucket ${row.bucket}`);
    if (!REASONS.includes(row.reason)) problems.push(`#${row.id}: reason ${row.reason}`);
    if (!CONFIDENCES.includes(row.confidence)) problems.push(`#${row.id}: confidence ${row.confidence}`);
    if (!BODY_QUALITIES.includes(row.body_quality)) problems.push(`#${row.id}: body_quality ${row.body_quality}`);
    if (row.reason === "dup" && !Number.isInteger(row.dup_of)) problems.push(`#${row.id}: dup without dup_of`);
    if (row.reason === "dup" && row.dup_of >= row.id) problems.push(`#${row.id}: dup_of ${row.dup_of} is not earlier`);
    const bucketAgrees = row.bucket === 3 ? !["fine", "missed"].includes(row.reason) : ["fine", "missed"].includes(row.reason);
    if (!bucketAgrees) problems.push(`#${row.id}: bucket ${row.bucket} disagrees with reason ${row.reason}`);
    if (typeof row.why !== "string" || row.why.length === 0) problems.push(`#${row.id}: empty why`);
  });
  return problems;
}
