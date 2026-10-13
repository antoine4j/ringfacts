// The live numbers of the scores page, worked out from rows the database
// returns: which claims are sealed or reopened, the grooming shares, the
// launch bar's shares, and the versions behind them. Nothing here queries;
// lib/score-queries.ts fetches, this counts, the page shows.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §2 and §7.

import { eventStatus, type CareerEvent, type ClaimFacts, type EventStatus, type MissCause } from "./career-events.ts";
import type { ClaimReviewView } from "./reviews.ts";
import type { TierJudgement } from "./tier-marks.ts";

/** A share: how many of how many. */
export type Share = { count: number; of: number };

/** The stations whose versions the live sections name (scoreboard D6). */
export type Station = "classifier" | "grouping" | "settings";

/** How many counted readings carry one combination of versions. */
export type VersionRow = { classifier_version: string | null; grouping_version: string | null; settings_version: string | number | null; readings: string | number };

/** When a station's version was first used. */
export type FirstUsedRow = { station: Station; version: string; first_used: Date };

/** A tier-1 post: the claim, and when it went out. */
export type Post = { claimId: string; postedAt: Date };

/** Below this many, a slice is greyed out instead of trusted (scoreboard D9). */
export const THIN_BELOW = 30;

/**
 * A claim's tier: the best tier among its readings (design §2).
 *
 * @param memberTiers  Each reading's latest tier, null when not decided.
 * @returns "post" for any 1, else "digest" for any 2, else "drop" for any 3; null when none is decided.
 */
export function claimTier(memberTiers: (number | null)[]): "post" | "digest" | "drop" | null {
  if (memberTiers.includes(1)) return "post";
  if (memberTiers.includes(2)) return "digest";
  if (memberTiers.includes(3)) return "drop";
  return null;
}

/**
 * The sealed claims: every reading carries a mark in force (scoreboard D4).
 *
 * @param views  Claim → its review view.
 * @returns The sealed claims' ids.
 */
export function sealedClaims(views: Map<string, ClaimReviewView>): string[] {
  return [...views].filter(([, view]) => view.review.state === "reviewed").map(([claimId]) => claimId);
}

/**
 * The reopened claims: sealed once, then joined by a reading nobody has
 * marked yet. A claim marked only in part is not reopened, only unfinished.
 *
 * @param views  Claim → its review view.
 * @param lastMarkAt  Claim → when its newest reading mark was made.
 * @param joinedAt  Claim → reading → when the reading joined the claim.
 * @returns The reopened claims' ids.
 */
export function reopenedClaims(views: Map<string, ClaimReviewView>, lastMarkAt: Map<string, Date>, joinedAt: Map<string, Map<string, Date>>): string[] {
  const reopened: string[] = [];
  for (const [claimId, view] of views) {
    const markedAt = lastMarkAt.get(claimId);
    if (view.review.state !== "has_new" || !markedAt) continue;

    // Every unmarked reading came after the last mark: the claim was whole before them.
    const joins = joinedAt.get(claimId) ?? new Map<string, Date>();
    const unmarked = [...joins].filter(([readingId]) => !view.marks[readingId]);
    if (unmarked.length > 0 && unmarked.every(([, at]) => at > markedAt)) reopened.push(claimId);
  }
  return reopened;
}

/**
 * Over-merge: the readings of sealed claims marked as not belonging there.
 *
 * @param sealed  The sealed claims.
 * @param views  Claim → its review view.
 * @returns ✕ readings of all readings, both in sealed claims.
 */
export function overMerge(sealed: string[], views: Map<string, ClaimReviewView>): Share {
  let count = 0;
  let of = 0;
  for (const claimId of sealed) {
    // In a sealed claim every reading has a mark, so the marks are the readings.
    const marks = Object.values(views.get(claimId)?.marks ?? {});
    of += marks.length;
    count += marks.filter((mark) => mark.verdict !== "belongs").length;
  }
  return { count, of };
}

/**
 * Over-split: the sealed claims linked "same claim as" another.
 *
 * @param sealed  The sealed claims.
 * @param views  Claim → its review view.
 * @returns Linked claims of sealed claims.
 */
export function overSplit(sealed: string[], views: Map<string, ClaimReviewView>): Share {
  const linked = sealed.filter((claimId) => (views.get(claimId)?.group.length ?? 0) > 0);
  return { count: linked.length, of: sealed.length };
}

/** The wrong-tier rate, with the counts behind it. */
export type WrongTier = Share & { unjudged: number; overPromoted: number; junk: number };

/**
 * Wrong tier: of the sealed claims whose tier was judged, how many were
 * judged wrong (scoreboard D3). Only an explicit mark counts, so a sealed
 * claim with none is "not judged" and in neither number (Q2). Over-promotion
 * (a Digest claim posted as Post) is one of the wrongs; junk (a claim that
 * should have been dropped but reached the group) is counted apart, for G2.
 *
 * @param sealed  The sealed claims.
 * @param judgements  Claim → its tier judgement.
 * @returns Wrong of judged, and how many sealed claims are not judged, over-promoted, or junk.
 */
export function wrongTier(sealed: string[], judgements: Map<string, TierJudgement>): WrongTier {
  const states = sealed.map((claimId) => judgements.get(claimId) ?? { state: "not_judged" as const, staleMark: null });
  const wrong = states.filter((judgement) => judgement.state === "wrong");
  const judged = states.filter((judgement) => judgement.state !== "not_judged").length;
  return {
    count: wrong.length,
    of: judged,
    unjudged: states.length - judged,
    overPromoted: wrong.filter((judgement) => judgement.promoted && !judgement.junk).length,
    junk: wrong.filter((judgement) => judgement.junk).length,
  };
}

/**
 * Repeats in tier 1: posts of a story the group had already been sent as a
 * tier-1 post, by the maintainer's "same claim as" links. A group of three
 * posted claims holds two repeats.
 *
 * @param postsInPeriod  The tier-1 posts sent in the period.
 * @param allPosts  Every tier-1 post, so an earlier one outside the period still counts.
 * @param groupOf  Claim → the other claims of its group, from sameClaimGroups.
 * @returns Repeats of posts, both in the period.
 */
export function tier1Repeats(postsInPeriod: Post[], allPosts: Post[], groupOf: Map<string, string[]>): Share {
  const postedAt = new Map(allPosts.map((post) => [post.claimId, post.postedAt]));

  // A repeat: another claim of its group went out before it.
  const repeats = postsInPeriod.filter((post) => {
    const others = groupOf.get(post.claimId) ?? [];
    return others.some((other) => wentOutFirst(other, postedAt.get(other), post));
  });
  return { count: repeats.length, of: postsInPeriod.length };
}

/**
 * Whether another claim's post went out before this one; at the same moment,
 * the smaller claim id counts as first, so one of the two is the repeat.
 *
 * @param otherId  The other claim.
 * @param otherAt  When its post went out, or undefined when it was never posted.
 * @param post  This post.
 * @returns True when the other post came first.
 */
function wentOutFirst(otherId: string, otherAt: Date | undefined, post: Post): boolean {
  if (otherAt === undefined) return false;
  if (otherAt.getTime() !== post.postedAt.getTime()) return otherAt < post.postedAt;
  return BigInt(otherId) < BigInt(post.claimId);
}

/**
 * The 👎 share: messages whose latest reaction is 👎.
 *
 * @param messages  The tier-1 posts and digests sent in the period, each with its latest reaction.
 * @returns 👎 of messages, and how many have no reaction at all.
 */
export function thumbsDownShare(messages: { latest: string | null }[]): Share & { unreacted: number } {
  const thumbsDown = messages.filter((message) => message.latest === "👎").length;
  const unreacted = messages.filter((message) => message.latest === null).length;
  return { count: thumbsDown, of: messages.length, unreacted };
}

/** What became of the career events in a period. */
export type EventsSummary = { notPosted: Share; posted: number; late: number; missed: number; causes: Partial<Record<MissCause, number>> };

/**
 * The career events of a period, counted by what the bot did with them.
 *
 * @param events  The events in the period.
 * @param facts  Claim id → its facts.
 * @returns Not posted (late plus missed) of all, and each outcome and cause.
 */
export function summariseEvents(events: CareerEvent[], facts: Map<number, ClaimFacts>): EventsSummary {
  const statuses: EventStatus[] = events.map((event) => eventStatus(event, facts));
  const causes: Partial<Record<MissCause, number>> = {};
  for (const status of statuses) if (status.status === "missed") causes[status.cause] = (causes[status.cause] ?? 0) + 1;
  const posted = statuses.filter((status) => status.status === "posted").length;
  const late = statuses.filter((status) => status.status === "late").length;
  const missed = statuses.length - posted - late;
  return { notPosted: { count: late + missed, of: statuses.length }, posted, late, missed, causes };
}

/** The versions behind the live numbers: the one in force per station, and any station that changed among the counted readings. */
export type VersionsInForce = { inForce: Partial<Record<Station, string>>; mixed: { station: Station; versions: { version: string; firstUsed: Date | null }[] }[] };

/**
 * The versions behind the counted readings (scoreboard D6): the newest of
 * each station is in force; a station with more than one is "mixed".
 *
 * @param rows  The version combinations among the counted readings.
 * @param firstUsed  When each version was first used.
 * @returns The versions in force, and the mixed stations with each version's first day.
 */
export function versionsInForce(rows: VersionRow[], firstUsed: FirstUsedRow[]): VersionsInForce {
  const columns: Record<Station, keyof VersionRow> = { classifier: "classifier_version", grouping: "grouping_version", settings: "settings_version" };
  const result: VersionsInForce = { inForce: {}, mixed: [] };
  for (const station of Object.keys(columns) as Station[]) {
    // The versions this station shows among the readings, oldest first use first.
    const present = [...new Set(rows.map((row) => row[columns[station]]).filter((value) => value !== null).map(String))];
    const firstOf = (version: string) => firstUsed.find((row) => row.station === station && String(row.version) === version)?.first_used ?? null;
    const ordered = present.map((version) => ({ version, firstUsed: firstOf(version) })).sort((one, other) => (one.firstUsed?.getTime() ?? 0) - (other.firstUsed?.getTime() ?? 0));

    // The newest is in force; more than one means the numbers mix them.
    if (ordered.length > 0) result.inForce[station] = ordered[ordered.length - 1].version;
    if (ordered.length > 1) result.mixed.push({ station, versions: ordered });
  }
  return result;
}

/**
 * Whether a slice is too small to trust, and so greyed out (scoreboard D9).
 *
 * @param share  The slice.
 * @returns True under 30.
 */
export function isThin(share: Share): boolean {
  return share.of < THIN_BELOW;
}

/** Each number's method and weakness, in words for a visitor (scoreboard D10). */
export const EXPLAIN = {
  events_not_posted: {
    how: "Career events known to have happened (a fight booked or won, an injury, a return, a retirement, a contract), kept by hand in a list, each checked against what the bot did: posted it, sent it only in a digest, or never sent it.",
    weakness: "The list holds only what the maintainer found; an event nobody noticed is in neither number.",
  },
  tier1_repeats: {
    how: "Posts of a story the group had already been sent as a post, found where the maintainer linked two of the bot's stories as one.",
    weakness: "Only repeats someone noticed and linked are counted.",
  },
  thumbs_down: {
    how: "Posts and digests whose latest reaction in the chat is 👎.",
    weakness: "A message nobody reacted to counts as fine; the line beside it says how many there are.",
  },
  over_merge: {
    how: "The share of reviewed articles the maintainer marked as not belonging in the story the bot put them in.",
    weakness: "Only stories the maintainer chose to review are counted, not a random sample.",
  },
  over_split: {
    how: "The share of reviewed stories the maintainer linked as the same story as another one.",
    weakness: "Only stories the maintainer chose to review are counted, not a random sample.",
  },
  wrong_tier: {
    how: "Of the reviewed stories whose tier the maintainer judged, the share marked as deserving another tier (posted, put in the digest, or dropped). A story posted that belonged in the digest counts here.",
    weakness: "Only stories the maintainer chose to review and then judged are counted; a story nobody judged is in neither number.",
  },
} as const;

/** The numbers EXPLAIN covers. */
export type NumberKey = keyof typeof EXPLAIN;
