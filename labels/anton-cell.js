// Reads Anton's cell in the review sheet: "as graded" accepts the reviewer's
// label; anything else is a correction — a bucket digit, a reason code,
// "dup of #N" — in any order, with any words around it. Pure.

import { REASONS } from "./validate.js";

/**
 * Turns Anton's cell into the user's label, filling gaps from the
 * reviewer's label. Returns null when the cell is blank (not reviewed).
 *
 * @param {string} cell
 * @param {{ bucket: number, reason: string, dup_of: number|null, why: string, posted?: boolean }} reviewer
 *   `posted` says whether the group saw the article: a bucket 1/2 correction
 *   without a reason word becomes "fine" when it posted, "missed" when held.
 * @returns {{ bucket: number, reason: string, dup_of: number|null, note: string, accepted: boolean } | null}
 */
export function readAntonCell(cell, reviewer) {
  const text = (cell ?? "").trim();
  if (text === "") return null;

  // "as graded" (with or without the "check reason" reminder) = accept.
  if (/^as graded\b/i.test(text)) {
    return { bucket: reviewer.bucket, reason: reviewer.reason, dup_of: reviewer.dup_of, note: reviewer.why, accepted: true };
  }

  // A correction: take whatever he wrote, keep the rest from the reviewer.
  const digit = text.match(/(?<![#\d])([123])(?![\d])/);
  const reasonWord = text.toLowerCase().match(new RegExp(`\\b(${REASONS.join("|")})\\b`));
  const dupOf = text.match(/#(\d+)/);
  let reason = reasonWord ? reasonWord[1] : dupOf ? "dup" : reviewer.reason;
  const bucket = digit ? Number(digit[1]) : ["dup", "junk", "old"].includes(reason) ? 3 : reviewer.bucket;

  // A useful bucket cannot carry a bucket-3 reason; pick the matching one.
  const usefulReasons = ["fine", "missed"];
  if (bucket !== 3 && !usefulReasons.includes(reason)) reason = reviewer.posted ? "fine" : "missed";
  if (bucket === 3 && usefulReasons.includes(reason)) reason = "junk";
  return {
    bucket,
    reason,
    dup_of: dupOf ? Number(dupOf[1]) : reason === "dup" ? reviewer.dup_of : null,
    note: text,
    accepted: false,
  };
}
