// Every live number of the scores page for one period, in one call: the
// queries of lib/score-queries.ts, counted by lib/scores.ts. The page and the
// strip on the claims list both read it, so they cannot disagree.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §2.

import { careerEvents, eventsInPeriod, namedClaimIds } from "./career-events.ts";
import { periodRange, type DayRange } from "./dates.ts";
import { sameClaimGroups } from "./reviews.ts";
import { claimFacts, claimsInPeriod, digestsInPeriod, firstUsedRows, postsInPeriod, reviewTimes, sameClaimMarks, versionRows } from "./score-queries.ts";
import { overMerge, overSplit, reopenedClaims, sealedClaims, summariseEvents, thumbsDownShare, tier1Repeats, versionsInForce, type EventsSummary, type Share, type VersionsInForce } from "./scores.ts";

/** The live numbers of one period. */
export type LiveScores = {
  claims: number;
  sealed: number;
  reopened: number;
  overMerge: Share;
  overSplit: Share;
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
  const [times, versions, firstUsed, bar] = await Promise.all([reviewTimes(period.ids), versionRows(period.ids), firstUsedRows(), launchBar(range, today)]);

  return {
    claims: period.ids.length,
    sealed: sealed.length,
    reopened: reopenedClaims(period.views, times.lastMarkAt, times.joinedAt).length,
    overMerge: overMerge(sealed, period.views),
    overSplit: overSplit(sealed, period.views),
    versions: versionsInForce(versions, firstUsed),
    ...bar,
  };
}
