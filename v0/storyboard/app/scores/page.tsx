// Scores: how well the pipeline does, for a visitor who does not know the
// project (scoreboard D10). Live numbers from the review marks and the chat's
// reactions, over one period (D5), and beside them, never mixed, the golden
// replay's stored result (D7). Always live data: it ignores ?schema=.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md.

import { GroomingSection, LaunchBarSection, VersionsLine } from "../../components/LiveScoreSections.tsx";
import { PeriodPicker } from "../../components/PeriodPicker.tsx";
import { ReplayReference } from "../../components/ReplayReference.tsx";
import { describeRange } from "../../lib/dates.ts";
import { dateFilter, type Params } from "../../lib/filters.ts";
import { liveScores } from "../../lib/live-scores.ts";
import { headlineAndHistory, replayResults } from "../../lib/replay-results.ts";

/**
 * The scores page.
 *
 * @param props.searchParams  The period, as the filter bar writes it (?when=last_14).
 * @returns The page.
 */
export default async function ScoresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const range = dateFilter(params);

  // The live numbers of the period, and the stored replay runs.
  const live = await liveScores(range);
  const { headline, history } = headlineAndHistory(replayResults());
  const periodWords = range ? describeRange(range) : "all time";

  return (
    <>
      <h1>Scores</h1>
      <p className="lede">
        How well the bot does, from two sources shown side by side and never mixed: the live bot, judged by its maintainer&apos;s review marks and the group&apos;s reactions,
        and a replay of the pipeline on a fixed set of hand-labelled articles. Each number carries its count, how it is measured, and what it cannot see.
      </p>
      <PeriodPicker path="/scores" params={params} />
      <h2 className="period">Live: {periodWords}</h2>
      <p className="small muted">{live.claims} stories had an article published in this period.</p>
      <VersionsLine versions={live.versions} />
      <LaunchBarSection live={live} last14="/scores?when=last_14" />
      <GroomingSection live={live} />
      <ReplayReference headline={headline} history={history} />
    </>
  );
}
