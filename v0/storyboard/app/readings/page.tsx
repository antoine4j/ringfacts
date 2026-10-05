// Readings: one row per article and fighter, newest first, with v0's tier
// beside production's outcome. Filters include any classifier answer, for
// example ?fact=next_fight&firmness=rumour.

import Link from "next/link";
import { Empty, PickTag, PostedTag } from "../../components/bits.tsx";
import { Decision } from "../../components/Decision.tsx";
import { FilterBar } from "../../components/FilterBar.tsx";
import { query } from "../../lib/db.ts";
import { readingFilter, whereSql, type Params } from "../../lib/filters.ts";
import { pacificTime } from "../../lib/format.ts";
import { fighterNames, latestReaction, outletNames } from "../../lib/queries.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../../lib/schema.ts";

/** The most readings one page shows. */
const LIMIT = 500;

/** One row of the readings list. */
type ReadingRow = {
  reading_id: string;
  fighter: string;
  stage: string;
  attempts: number;
  last_error: string | null;
  posted_at: Date | null;
  reaction: string | null;
  url: string;
  outlet: string;
  headline: string;
  published_at: Date;
  production_outcome: string | null;
  backfill: boolean;
  tier: number | null;
  cell: string | null;
  centrality: string | null;
  claim_id: string | null;
  pick: { claim?: number | null; confidence?: number; raw?: unknown } | null;
};

/**
 * The readings page.
 *
 * @param props.searchParams  The filters from the address.
 * @returns The page.
 */
export default async function ReadingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const schema = schemaFrom(params.schema);

  // The matching readings, and how many match in all.
  const filter = readingFilter(params);
  const where = whereSql(filter);
  const rows = await query<ReadingRow>(
    schema,
    `SELECT rn.reading_id, rn.fighter, rn.stage, rn.attempts, rn.last_error, rn.posted_at, ${latestReaction("rn.message_id")} AS reaction, rn.url, rn.outlet, rn.headline,
            rn.published_at, rn.production_outcome, rn.backfill, rn.tier, rn.cell, rn.classification ->> 'centrality' AS centrality, rn.claim_id, rn.pick
     FROM reading_now rn ${where}
     ORDER BY rn.published_at DESC, rn.reading_id DESC
     LIMIT ${LIMIT}`,
    filter.values,
  );
  const total = await query<{ count: string }>(schema, `SELECT count(*) FROM reading_now rn ${where}`, filter.values);

  // The filter choices: fighters, outlets, and every classifier answer seen so far.
  const [fighters, outlets, answers] = await Promise.all([fighterNames(schema), outletNames(schema), answerChoices(schema)]);

  return (
    <>
      <h1>Readings</h1>
      <FilterBar path="/readings" params={params} schema={schema} fighters={fighters} outlets={outlets} stages answers={answers} />
      <p className="muted small">
        {total[0].count} reading{total[0].count === "1" ? "" : "s"} match{rows.length < Number(total[0].count) ? `; showing the newest ${rows.length}` : ""}.
        Waiting means classify, extract, group or decide.
      </p>
      {rows.length === 0 ? <Empty>No readings match.</Empty> : <ReadingsTable rows={rows} schema={schema} />}
    </>
  );
}

/**
 * Every classifier answer name with the values seen for it, for the filter drop-downs.
 *
 * @param schema  "public" or "replay".
 * @returns Answer name → values, alphabetical.
 */
async function answerChoices(schema: Schema): Promise<Record<string, string[]>> {
  const rows = await query<{ name: string; choices: string[] }>(
    schema,
    `SELECT answer.key AS name, array_agg(DISTINCT answer.value ORDER BY answer.value) AS choices
     FROM classifications, jsonb_each_text(answers) AS answer
     GROUP BY answer.key
     ORDER BY answer.key`,
  );
  const choices: Record<string, string[]> = {};
  for (const row of rows) choices[row.name] = row.choices;
  return choices;
}

/**
 * The readings table.
 *
 * @param props.rows  The readings.
 * @param props.schema  Kept on links.
 * @returns The table.
 */
function ReadingsTable({ rows, schema }: { rows: ReadingRow[]; schema: Schema }) {
  return (
    <table>
      <thead>
        <tr>
          <th>published</th>
          <th>fighter</th>
          <th>outlet</th>
          <th>headline</th>
          <th>stage</th>
          <th>v0 decision</th>
          <th>production</th>
          <th>claim</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.reading_id} className={row.backfill ? "dim" : ""}>
            <td className="nowrap">{pacificTime(row.published_at)}</td>
            <td className="nowrap">{row.fighter}</td>
            <td>{row.outlet}</td>
            <td>
              <Link href={`/readings/${row.reading_id}${schemaSuffix(schema)}`}>{row.headline}</Link>{" "}
              <a className="small" href={row.url} target="_blank" rel="noreferrer">
                article ↗
              </a>
              {row.posted_at && <PostedTag reaction={row.reaction} />}
              {row.backfill && <span className="tag">archive</span>}
            </td>
            <td className="nowrap" title={row.last_error ?? ""}>
              {row.stage}
              {row.attempts > 0 && <span className={`tag ${row.stage === "stuck" ? "bad" : "warn"}`}>{row.attempts} failed</span>}
            </td>
            <td>
              <Decision tier={row.tier} cell={row.cell} centrality={row.centrality} schema={schema} />
            </td>
            <td className="small">{row.production_outcome}</td>
            <td className="nowrap">
              {row.claim_id && <Link href={`/claims/${row.claim_id}${schemaSuffix(schema)}`}>#{row.claim_id}</Link>} {row.claim_id && <PickTag pick={row.pick} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
