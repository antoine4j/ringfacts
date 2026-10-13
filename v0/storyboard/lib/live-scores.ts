// Every live number of the scores page for one period, in one call: the
// queries of lib/score-queries.ts, counted by lib/scores.ts. The page and the
// strip on the claims list both read it, so they cannot disagree.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §2.

import { careerEvents, eventsInPeriod, namedClaimIds } from "./career-events.ts";
import { periodRange, type DayRange } from "./dates.ts";
import { tierMarksFor } from "./queries.ts";
import { sameClaimGroups } from "./reviews.ts";
import { claimFacts, claimsInPeriod, digestsInPeriod, firstUsedRows, postsInPeriod, reviewTimes, sameClaimMarks, versionRows } from "./score-queries.ts";
import { overMerge, overSplit, reopenedClaims, sealedClaims, summariseEvents, thumbsDownShare, tier1Repeats, versionsInForce, wrongTier, type EventsSummary, type Share, type VersionsInForce, type WrongTier } from "./scores.ts";
import { tierJudgements } from "./tier-marks.ts";

/** The live numbers of one period. */
export type LiveScores = {
  claims: number;
  sealed: number;
  reopened: number;
  overMerge: Share;
  overSplit: Share;
  wrongTier: WrongTier;
  repeats: Share;
  thumbsDown: Share & { unreacted: number };
  events: EventsSummary & { checked: string; listIsBehind: boolean };
  versions: VersionsInForce;
};

/**
 * The launch bar's numbers: career events, repeats in tier 1, and the 👎 share.
 *
 * @param range  The period, or null for all time.
 * @param today  Today's Pacific day, the end of an open period.
 * @returns The three numbers' inputs, counted.
 */
async function launchBar(range: DayRange | null, today: string): Promise<Pick<LiveScores, "repeats" | "thumbsDown" | "events">> {
  // The messages of the period, every post ever (an earlier one makes a repeat), and the links between stories.
  const [posts, allPosts, digests, sameMarks] = await Promise.all([postsInPeriod(range), postsInPeriod(null), digestsInPeriod(range), sameClaimMarks()]);
  const repeats = tier1Repeats(posts, allPosts, sameClaimGroups(sameMarks).groupOf);
  const thumbsDown = thumbsDownShare([...posts, ...digests]);

  // The career events of the period, and what the database says about the stories they name.
  const list = careerEvents();
  const events = eventsInPeriod(list.events, range?.from ?? null, range?.to ?? null);
  const facts = await claimFacts(namedClaimIds(events));
  const listIsBehind = list.checked < (range?.to ?? today);
  return { repeats, thumbsDown, events: { ...summariseEvents(events, facts), checked: list.checked, listIsBehind } };
}

/**
 * Every live number of one period.
 *
 * @param range  The period, or null for all time.
 * @param now  The current moment, for today's day.
 * @returns The numbers.
 */
export async function liveScores(range: DayRange | null, now = new Date()): Promise<LiveScores> {
  const today = periodRange("today", now)?.to ?? "";

  // The stories of the period with their reviews, and the times that tell a reopened one.
  const period = await claimsInPeriod(range);
  const sealed = sealedClaims(period.views);
  const [times, versions, firstUsed, tierMarks, bar] = await Promise.all([
    reviewTimes(period.ids), versionRows(period.ids), firstUsedRows(), tierMarksFor(period.ids), launchBar(range, today),
  ]);

  // Each story's tier today (its best reading's), and what its tier mark says about it.
  const tierOf = new Map([...period.members].map(([claimId, members]) => [claimId, bestTier(members.map((member) => member.tier))]));
  const judgements = tierJudgements(tierMarks, tierOf);

  return {
    claims: period.ids.length,
    sealed: sealed.length,
    reopened: reopenedClaims(period.views, times.lastMarkAt, times.joinedAt).length,
    overMerge: overMerge(sealed, period.views),
    overSplit: overSplit(sealed, period.views),
    wrongTier: wrongTier(sealed, judgements),
    versions: versionsInForce(versions, firstUsed),
    ...bar,
  };
}

/**
 * A story's tier: the best (lowest) of its readings' decided tiers.
 *
 * @param tiers  Each reading's latest tier, null when not decided.
 * @returns 1, 2 or 3; null when none is decided.
 */
export function bestTier(tiers: (number | null)[]): number | null {
  const decided = tiers.filter((tier): tier is number => tier !== null).map(Number);
  return decided.length > 0 ? Math.min(...decided) : null;
}
