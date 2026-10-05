// The golden replay: a placeholder until the replay (task 13) writes its
// scores. For now it shows the replay's runs and how much it holds.

import Link from "next/link";
import { Empty } from "../../components/bits.tsx";
import { RunsTable, type RunRow } from "../../components/RunsTable.tsx";
import { query } from "../../lib/db.ts";

/**
 * The replay page. It always reads both schemas, so it ignores ?schema=.
 *
 * @returns The page.
 */
export default async function ReplayPage() {
  // Replay runs may be recorded in either schema; the replay's own readings are in "replay".
  const [liveRuns, replayRuns, held] = await Promise.all([
    query<RunRow>("public", "SELECT id, kind, started_at, finished_at, seconds, counts FROM runs WHERE kind = 'replay' ORDER BY id DESC LIMIT 50"),
    query<RunRow>("replay", "SELECT id, kind, started_at, finished_at, seconds, counts FROM runs WHERE kind = 'replay' ORDER BY id DESC LIMIT 50"),
    query<{ readings: string; claims: string; decisions: string }>(
      "replay",
      "SELECT (SELECT count(*) FROM readings) AS readings, (SELECT count(*) FROM claims) AS claims, (SELECT count(*) FROM decisions) AS decisions",
    ),
  ]);
  const runs = [...replayRuns, ...liveRuns];

  return (
    <>
      <h1>Golden replay</h1>
      <p>
        The golden replay runs the Classifier (4) to the Decider (7) over the golden set&apos;s training and validation articles and writes into the{" "}
        <code>replay</code> schema, the same tables as live data. Its scores against Anton&apos;s labels will be shown here once it exists.
      </p>
      <p>
        The replay schema holds {held[0].readings} readings, {held[0].claims} claims and {held[0].decisions} decisions. Every other page can read it:{" "}
        <Link href="/?schema=replay">claims</Link>, <Link href="/readings?schema=replay">readings</Link>, <Link href="/settings?schema=replay">settings</Link>.
      </p>
      <h2>Replay runs</h2>
      {runs.length === 0 ? <Empty>No replay has run yet.</Empty> : <RunsTable runs={runs} />}
    </>
  );
}
