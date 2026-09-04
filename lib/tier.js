// Digest tiering: is this article ABOUT the subject, or does it merely sit
// next to news about them? Everything the matcher does not turn into a claim
// currently reaches the group as the publisher's raw headline, one bullet
// each — so the articles the system understood least are shown rawest. This
// decides which of those have earned a headline and which are folded into a
// single shared "also mentioning" line.
//
// Thresholds are MEASURED, not guessed (scripts/audit-digest-tier.js, 2026-08-09,
// over 60 archived items once scripts/backfill-bodies.js raised body coverage to
// 49/60): among items with a usable body, claim-bearing articles name the
// subject 2-12x while the junk cluster names them 0-1x. Clean gap at 1|2,
// same shape as the 0.80 dup and 0.10 drift thresholds.
//
// Two alternatives were tested and REJECTED, so don't reintroduce them:
//   - name-in-headline alone: item #26 is a genuine Subject B story headlined
//     "30-1 UFC welterweight". Epithet headlines are routine in MMA press.
//   - first-mention position: item #7 is a legitimate division story whose
//     first mention sits at 71% depth.
//
// Same-module home as lib/sources.js and for the same reason — a rule with
// copies in the hunter and the audit script is a rule that quietly forks.
//
// Rung-clustering check (2026-08-09, after body_via shipped): the 6 items the
// rule demotes came from feed-content (x3 — the RICHEST rung, full RSS
// content, not a page scrape) and json-ld/article-tag (x3 — low truncation
// risk). None came from the weak rungs (paragraphs, og-description). The
// mention counts are not an artifact of truncated extraction.

// A body shorter than this cannot support a mention count. Item #12 is a real
// claim source whose headline never names the subject and whose body — a
// 141-char og-description blurb — names them once; without this floor the rule
// would demote it. Absence of evidence is not evidence of irrelevance.
export const MIN_BODY_FOR_JUDGEMENT = Number(process.env.TIER_MIN_BODY || 300);

// Set TIER_MAX_MENTIONS=-1 to demote nothing (kill switch); a high value
// demotes nearly everything, which is how the render path gets exercised in
// a dry run when the hour happens to produce no tangential items.
export const MAX_MENTIONS_TO_DEMOTE = Number(process.env.TIER_MAX_MENTIONS || 1);

// Case-insensitive substring over the subject's surname stems, both scripts.
// Deliberately dumb: stems are chosen so declensions still match, and a
// smarter matcher here would need to be kept in sync with the stem list.
export function mentionsName(text, matchNames) {
  if (!text) return false;
  const haystack = text.toLowerCase();
  return matchNames.some((n) => haystack.includes(n.toLowerCase()));
}

export function countMentions(text, matchNames) {
  if (!text) return 0;
  const haystack = text.toLowerCase();
  let count = 0;
  for (const name of matchNames) {
    const needle = name.toLowerCase();
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) count++;
  }
  return count;
}

// Demote only on positive evidence of a non-mention. Every "we could not
// tell" case — no body, a body too short to judge, a name in the headline —
// keeps the article at full size.
export function isTangential({ title, body }, matchNames) {
  if (mentionsName(title, matchNames)) return false;
  if (!body || body.length < MIN_BODY_FOR_JUDGEMENT) return false;
  return countMentions(body, matchNames) <= MAX_MENTIONS_TO_DEMOTE;
}

// The tier decision as the digest actually asks it: the matcher's prominence
// judgement first, the measured count rule as the fallback underneath.
//
// Item #73 (2026-08-10) is why. An article about Guram Kutateladze named the
// subject twice — as an opponent's cornerman, pure background color — and two
// mentions beat the <=1 threshold, so it kept a full headline. Counting can
// only see how OFTEN a name appears; the matcher read the sentence and can say
// what the name was DOING there. So "passing" demotes on its own, with no body
// floor: it is positive evidence, not the absence of evidence the count rule
// has to guard against.
//
// The two rules are OR, not a negotiation. "central" does NOT rescue an
// article the count rule demotes — the count rule was measured against the
// archive and the role is one model's opinion, so neither gets to overrule the
// other's demotion. A null role (matcher off, matcher failed, pre-migration
// row) leaves exactly isTangential, byte for byte.
//
// The headline escape used to outrank "passing" (the residual-#23 decision:
// a name the reader can see, folded, reads as a bug). Reversed 2026-09-04:
// for a subject whose press is name-rich the escape was not an edge case but
// the main door, and the group saw a full headline for every backdrop
// mention. Now only a null/failed role leaves the headline in charge.
//
// `subjectRole` is an explicit argument rather than something read off `item`
// because the two callers hand over different shapes: the hunter passes a live
// camelCase item (`item.subjectRole`), the audit scripts pass snake_case rows
// straight from Postgres (`row.subject_role`). Making the caller name the
// field keeps this function from having to guess which world it is in.
export function digestTierFor(item, matchNames, subjectRole) {
  // "passing" first: the matcher read the article; the headline only names
  // him. Measured 64% -> 88% on the corpus with the order swapped, and every
  // 2026-08-11 complaint was a passing item saved by its headline.
  // TIER_PASSING_OVERRIDES_HEADLINE=0 restores the old order without a deploy.
  // History: docs/decisions.md#tier-reorder
  if (subjectRole === "passing" && passingOverridesHeadline()) return "tangential";
  if (mentionsName(item.title, matchNames)) return "main";
  if (subjectRole === "passing") return "tangential";
  return isTangential(item, matchNames) ? "tangential" : "main";
}

// Read at call time, not import time, so the kill switch can be flipped by
// the environment of the run that needs it.
function passingOverridesHeadline() {
  return process.env.TIER_PASSING_OVERRIDES_HEADLINE !== "0";
}
