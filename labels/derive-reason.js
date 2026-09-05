// Turns a graded row's free-text note into one canonical reason code, so the
// feedback table can group rows without reading prose. Pure text matching —
// no database, no filesystem. corpus/graded.js supplies the parsed rows.

// Any of these anywhere in the note means "this is the same story again".
const DUPLICATE_PATTERNS = [/repeat of/i, /\bsame\b(?! kind)/i, /\brepeat\b/i, /\bduplicate\b/i, /\bposted again\b/i];

// Bucket-3-only signals, checked in the priority order the rules require.
const STALE_PATTERNS = [
  /\bstale\b/i,
  /old fight/i,
  /old news/i,
  /photo caption/i,
  /\bcaption\b/i,
  /may 9/i,
  /months ago/i,
  /resurfac/i,
];
const JUNK_PATTERNS = [
  /\bspam\b/i,
  /\bnamesake\b/i,
  /\blisticle\b/i,
  /one name among many/i,
  /\bbackdrop\b/i,
  /site furniture/i,
  /\bfurniture\b/i,
  /not about him/i,
];
const WRONG_PATTERNS = [/\bwrong\b/i, /not official/i, /unconfirmed as official/i, /misreport/i];

/**
 * Derives the canonical reason code for one graded row, and the row number
 * it duplicates when the reason is "dup".
 *
 * @param {number} bucket  The row's final bucket (1, 2 or 3).
 * @param {string} note    Claude's free-text note for the row.
 * @returns {{ reason: string, dup_of: number|null }}
 *   reason is one of: fine, junk, dup, old, wrong, loud, missed, other.
 */
export function deriveReason(bucket, note) {
  // A repeat is a repeat at any bucket: Anton may keep a bucket-2 row useful
  // while still noting in prose that it repeats an earlier post.
  const duplicate = findDuplicate(note);
  if (duplicate) return duplicate;

  // The remaining note-driven reasons only make sense on a bucket-3 row —
  // calling a row Anton kept useful "stale" or "junk" would contradict him.
  if (bucket === 3) {
    if (matchesAny(note, STALE_PATTERNS)) return { reason: "old", dup_of: null };
    if (matchesAny(note, JUNK_PATTERNS) || startsWithAbout(note)) return { reason: "junk", dup_of: null };
    if (matchesAny(note, WRONG_PATTERNS)) return { reason: "wrong", dup_of: null };
    if (isLoudNonEvent(note)) return { reason: "loud", dup_of: null };
  }

  // No note-driven reason applied: a useful bucket is "fine", the rest is
  // ordinary bucket-3 junk with no more specific signal in the note.
  return { reason: bucket === 3 ? "junk" : "fine", dup_of: null };
}

/**
 * Finds the "repeat of an earlier post" signal in a note, if any.
 *
 * @param {string} note
 * @returns {{ reason: string, dup_of: number|null } | null}
 *   null when the note carries no duplicate signal at all.
 */
function findDuplicate(note) {
  if (!matchesAny(note, DUPLICATE_PATTERNS)) return null;

  // The signal exists but there is no row number to point at — "other"
  // rather than a dangling "dup" the validator could not check.
  const numberMatch = note.match(/#(\d+)/);
  if (!numberMatch) return { reason: "other", dup_of: null };

  return { reason: "dup", dup_of: Number(numberMatch[1]) };
}

/** True for the corpus's "About <someone else>" shorthand for an off-subject piece. */
function startsWithAbout(note) {
  return /^about\s+\S/i.test(note.trim());
}

/** True for an alert-style note about something that never became an event. */
function isLoudNonEvent(note) {
  const mentionsAlert = /\balert\b/i.test(note);
  const mentionsNonEvent = /not an event/i.test(note) || /non-event/i.test(note);
  return mentionsAlert && mentionsNonEvent;
}

/** True if the note matches any of the given case-insensitive patterns. */
function matchesAny(note, patterns) {
  return patterns.some((pattern) => pattern.test(note));
}
