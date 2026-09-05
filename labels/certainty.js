// Decides whether a labelled article is "sure" (two independent readers
// agree it is not for the group) or needs Anton. Pure; no I/O.

/**
 * Do two labels agree? Same bucket; when both say dup, the same earlier
 * article — or two different articles the group already saw, which is
 * the same verdict for the reader.
 *
 * @param {object} first
 * @param {object} second
 * @param {Set<number>} postedIds
 * @returns {boolean}
 */
export function labelsAgree(first, second, postedIds) {
  if (first.bucket !== second.bucket) return false;
  if (first.reason === "dup" && second.reason === "dup") {
    const sameTarget = first.dup_of === second.dup_of;
    const bothPosted = postedIds.has(first.dup_of) && postedIds.has(second.dup_of);
    return sameTarget || bothPosted;
  }
  return true;
}

/**
 * Is this held article's label sure enough to pre-fill "as graded"?
 * Sure = bucket 3, no reader unsure, and either the wrong-subject hold
 * (146 of 148 confirmed, 0 flips in the audit) or a blind second reader
 * agreeing with the first.
 *
 * @param {string} group
 * @param {object} label    The label that stands.
 * @param {object|null} blind  An independent second reading, if any.
 * @param {Set<number>} postedIds
 * @returns {boolean}
 */
export function isSure(group, label, blind, postedIds) {
  if (label.bucket !== 3) return false;
  if (label.confidence === "low") return false;
  if (group === "wrong-subject") return label.reason === "junk";
  if (!blind) return false;
  if (blind.confidence === "low") return false;
  return labelsAgree(label, blind, postedIds);
}

/**
 * Is a graded post's derived reason plain enough to pre-fill?
 * Plain = fine or junk; dup/old/other (and a useful bucket with a
 * bucket-3 reason) need Anton's eye.
 *
 * @param {{ bucket: number, reason: string }} label
 * @returns {boolean}
 */
export function isPlainGraded(label) {
  const plain = label.reason === "fine" || label.reason === "junk";
  const consistent = (label.bucket === 3) === (label.reason !== "fine");
  return plain && consistent;
}
