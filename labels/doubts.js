// Picks the rows a stronger reviewer must re-read: any row where the first
// reviewer disagreed with the machine's diagnosis, or was not confident.
// Pure; see labels/build-doubts.js for the file plumbing.

/**
 * Is the reviewer's label a disagreement with what the pipeline did?
 * Held groups: anything but "dup" (or "junk" for wrong-subject/folded) is a
 * disagreement. Posted: bucket 3 is.
 *
 * @param {string} group
 * @param {{ bucket: number, reason: string }} label
 * @returns {boolean}
 */
export function overturns(group, label) {
  if (group === "dup" || group === "matched") return label.reason !== "dup";
  if (group === "wrong-subject" || group === "folded") return !["junk", "dup"].includes(label.reason);
  return label.bucket === 3;
}

/**
 * Selects the rows to re-read.
 *
 * @param {string} group
 * @param {object[]} labels  Reviewer output rows.
 * @returns {object[]}
 */
export function pickDoubts(group, labels) {
  const inconsistent = (label) => label.reason === "dup" && label.bucket !== 3;
  return labels.filter((label) => overturns(group, label) || label.confidence === "low" || inconsistent(label));
}
