// The production comparison (task 10.3): where v0 and production disagree
// about posting, each with buttons to mark which one was right, and the full
// table of production's outcome against v0's tier.

import Link from "next/link";
import { CompareVerdict } from "../../components/CompareVerdict.tsx";
import { Empty, TierTag } from "../../components/bits.tsx";
import { query } from "../../lib/db.ts";
import type { Params } from "../../lib/filters.ts";
import { pacificTime } from "../../lib/format.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../../lib/schema.ts";

/** A reading where the two systems disagree. */
type Disagreement = { reading_id: string; fighter: string; headline: string; url: string; outlet: string; published_at: Date; production_outcome: string | null; tier: number | null; cell: string | null; stage: string; verdict: string | null };

/**
 * The comparison page.
 *
 * @param props.searchParams  ?schema=replay, if any.
 * @returns The page.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<Params> }) {
  const schema = schemaFrom((await searchParams).schema);

  // Production posted and v0 did not put it in tier 1, or the other way round.
  const [disagreements, crossTable] = await Promise.all([
    query<Disagreement>(
      schema,
      `SELECT reading_id, fighter, headline, url, outlet, published_at, production_outcome, tier, cell, stage,
              (SELECT f.should_be FROM feedback f WHERE f.reading_id = reading_now.reading_id AND f.field = 'compare' ORDER BY f.id DESC LIMIT 1) AS verdict
       FROM reading_now
       WHERE (production_outcome = 'posted' AND tier IS DISTINCT FROM 1) OR (tier = 1 AND production_outcome IS DISTINCT FROM 'posted')
       ORDER BY published_at DESC LIMIT 500`,
    ),
    query<{ outcome: string; tier: number | null; readings: string }>(
      schema,
      "SELECT coalesce(production_outcome, '(none)') AS outcome, tier, count(*) AS readings FROM reading_now GROUP BY 1, 2 ORDER BY 1",
    ),
  ]);
  const productionPosted = disagreements.filter((row) => row.production_outcome === "posted");
  const v0Posts = disagreements.filter((row) => row.tier === 1);

  // Your marks so far: how many of the disagreements, and who was right.
  const marked = disagreements.filter((row) => row.verdict);
  const markCount = (verdict: string) => marked.filter((row) => row.verdict === verdict).length;

  return (
    <>
      <h1>Production comparison</h1>
      <p className="muted">
        You marked {marked.length} of {disagreements.length} disagreements: v0 right {markCount("v0")}, production right {markCount("production")}, neither{" "}
        {markCount("neither")}. A mark is a feedback row on the reading; click again to change it.
      </p>
      <h2>Production&apos;s outcome × v0&apos;s tier</h2>
      <CrossTable rows={crossTable} />
      <h2>Production posted, v0 did not choose tier 1 ({productionPosted.length})</h2>
      <DisagreementTable rows={productionPosted} schema={schema} />
      <h2>v0 chose tier 1, production did not post ({v0Posts.length})</h2>
      <DisagreementTable rows={v0Posts} schema={schema} />
    </>
  );
}

/**
 * Readings counted by production's outcome (rows) and v0's tier (columns).
 *
 * @param props.rows  The counts.
 * @returns The table.
 */
function CrossTable({ rows }: { rows: { outcome: string; tier: number | null; readings: string }[] }) {
  const outcomes = [...new Set(rows.map((row) => row.outcome))];
  const tiers: (number | null)[] = [1, 2, 3, null];

  // The count in one cell of the table.
  const countOf = (outcome: string, tier: number | null) => rows.find((row) => row.outcome === outcome && row.tier === tier)?.readings ?? "";

  return (
    <table style={{ width: "auto" }}>
      <thead>
        <tr>
          <th>production</th>
          {tiers.map((tier) => (
            <th key={String(tier)} className="num">
              {tier === null ? "not decided" : `tier ${tier}`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {outcomes.map((outcome) => (
          <tr key={outcome}>
            <td>{outcome}</td>
            {tiers.map((tier) => (
              <td key={String(tier)} className="num">
                {countOf(outcome, tier)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The readings the two systems disagree on.
 *
 * @param props.rows  The readings, newest first.
 * @param props.schema  Kept on links.
 * @returns The table, or a line when there are none.
 */
function DisagreementTable({ rows, schema }: { rows: Disagreement[]; schema: Schema }) {
  if (rows.length === 0) return <Empty>None.</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>published</th>
          <th>fighter</th>
          <th>outlet</th>
          <th>headline</th>
          <th>production</th>
          <th>v0 tier</th>
          <th>cell</th>
          <th>stage</th>
          <th>which was right?</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.reading_id}>
            <td className="nowrap">{pacificTime(row.published_at)}</td>
            <td className="nowrap">{row.fighter}</td>
            <td>{row.outlet}</td>
            <td>
              <Link href={`/readings/${row.reading_id}${schemaSuffix(schema)}`}>{row.headline}</Link>{" "}
              <a className="small" href={row.url} target="_blank" rel="noreferrer">
                article ↗
              </a>
            </td>
            <td>{row.production_outcome}</td>
            <td>
              <TierTag tier={row.tier} />
            </td>
            <td className="small">{row.cell}</td>
            <td>{row.stage}</td>
            <td>
              <CompareVerdict readingId={row.reading_id} schema={schema} current={row.verdict} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
