// Runs: one row per run of the job, newest first, and where every reading is now.

import { Empty } from "../../components/bits.tsx";
import { RunsTable, type RunRow } from "../../components/RunsTable.tsx";
import { query } from "../../lib/db.ts";
import { STAGES, type Params } from "../../lib/filters.ts";
import { schemaFrom, schemaSuffix } from "../../lib/schema.ts";

/**
 * The runs page.
 *
 * @param props.searchParams  ?schema=replay, if any.
 * @returns The page.
 */
export default async function RunsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const schema = schemaFrom((await searchParams).schema);

  // The latest runs, and every reading's stage counted per fighter.
  const [runs, stages] = await Promise.all([
    query<RunRow>(schema, "SELECT id, kind, started_at, finished_at, seconds, counts FROM runs ORDER BY id DESC LIMIT 200"),
    query<{ stage: string; fighter: string; readings: string }>(schema, "SELECT stage, fighter, count(*) AS readings FROM readings GROUP BY stage, fighter"),
  ]);
  const fighters = [...new Set(stages.map((row) => row.fighter))].sort();

  return (
    <>
      <h1>Runs</h1>
      <h2>Where the readings are now</h2>
      <StageTable stages={stages} fighters={fighters} schemaLink={schemaSuffix(schema, "&")} />
      <h2>The latest runs</h2>
      {runs.length === 0 ? <Empty>No runs yet.</Empty> : <RunsTable runs={runs} />}
    </>
  );
}

/**
 * Stage × fighter counts, each linking to those readings.
 *
 * @param props.stages  The counts.
 * @param props.fighters  The fighters, as columns.
 * @param props.schemaLink  "&schema=replay" when reading the replay, else "".
 * @returns The table.
 */
function StageTable({ stages, fighters, schemaLink }: { stages: { stage: string; fighter: string; readings: string }[]; fighters: string[]; schemaLink: string }) {
  // How many readings sit at one stage, for one fighter or all of them.
  const countOf = (stage: string, fighter?: string) => {
    const matching = stages.filter((row) => row.stage === stage && (fighter === undefined || row.fighter === fighter));
    return matching.reduce((sum, row) => sum + Number(row.readings), 0);
  };

  return (
    <table style={{ width: "auto" }}>
      <thead>
        <tr>
          <th>stage</th>
          {fighters.map((fighter) => (
            <th key={fighter} className="num">
              {fighter}
            </th>
          ))}
          <th className="num">all</th>
        </tr>
      </thead>
      <tbody>
        {STAGES.map((stage) => (
          <tr key={stage} className={countOf(stage) === 0 ? "dim" : ""}>
            <td>
              <a href={`/readings?stage=${stage}${schemaLink}`}>{stage}</a>
            </td>
            {fighters.map((fighter) => (
              <td key={fighter} className="num">
                {countOf(stage, fighter)}
              </td>
            ))}
            <td className="num">
              <strong>{countOf(stage)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
