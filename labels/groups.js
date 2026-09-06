// Pure helpers for the labelling export: which review group an archived
// item belongs to, and what text the reviewer gets to read. No database.

/** Longest article text handed to a reviewer. */
export const BODY_CLIP = 1200;

/**
 * Is this hold the matcher's own "same story" answer? Two names for one
 * decision: "llm" is what the old matcher's MATCH wrote, "story" is what the
 * story decider's join writes, and "official" is the retired exemption.
 *
 * @param {string|null} heldReason
 * @returns {boolean}
 */
export function isMatchHold(heldReason) {
  return heldReason === "llm" || heldReason === "story" || heldReason === "official";
}

/**
 * Sorts an archived item into its review group. Each group gets one
 * question in the labelling pass (see the plan in TODO 3e).
 *
 * @param {{ posted: boolean, held_reason: string|null, id: number }} item
 * @param {Set<number>} gradedIds  Posted items Anton already graded.
 * @returns {"posted-graded"|"posted-new"|"dup"|"matched"|"wrong-subject"|"folded"}
 */
export function groupOf(item, gradedIds) {
  if (item.posted) return gradedIds.has(item.id) ? "posted-graded" : "posted-new";
  if (item.held_reason === "embedding") return "dup";
  if (isMatchHold(item.held_reason)) return "matched";
  if (item.held_reason === "wrong_subject") return "wrong-subject";
  return "folded";
}

/**
 * The text the pipeline had for an article: the body clipped to BODY_CLIP
 * characters, else the RSS description, else nothing.
 *
 * @param {string|null} body
 * @param {string|null} rssDescription
 * @returns {{ text: string, from: "body"|"body-clipped"|"rss"|"none" }}
 */
export function clipBody(body, rssDescription) {
  if (body && body.length > BODY_CLIP) return { text: body.slice(0, BODY_CLIP), from: "body-clipped" };
  if (body) return { text: body, from: "body" };
  if (rssDescription) return { text: rssDescription, from: "rss" };
  return { text: "", from: "none" };
}
