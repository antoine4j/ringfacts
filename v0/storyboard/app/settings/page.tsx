// Settings (section 7 of the design): the tier map as three columns, Post,
// Digest and Drop, each combination of "what new fact · how firm" a card with
// its count of readings. Moving cards makes a draft; saving writes a new
// settings version. Below: each fighter's digest schedule, and the history.

import { cellName } from "../../../pipeline/settings/tiers.ts";
import { Empty } from "../../components/bits.tsx";
import { query } from "../../lib/db.ts";
import type { Params } from "../../lib/filters.ts";
import { pacificTime } from "../../lib/format.ts";
import { fighterNames, latestSettings, type SettingsRow } from "../../lib/queries.ts";
import { schemaFrom, type Schema } from "../../lib/schema.ts";
import type { AnswerGroup } from "../../lib/tier-draft.ts";
import { TierBoard, type CardCounts } from "./TierBoard.tsx";

/**
 * The settings page.
 *
 * @param props.searchParams  ?schema=replay, if any.
 * @returns The page.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const schema = schemaFrom((await searchParams).schema);
  const current = await latestSettings(schema);
  if (!current) return <Empty>There are no settings yet: the migration writes version 1.</Empty>;

  // What the cards show, what the preview re-decides, and the history.
  const [cards, groups, fighters, history] = await Promise.all([
    cardCounts(schema, current),
    answerGroups(schema, current),
    fighterNames(schema),
    query<SettingsRow>(schema, "SELECT version, author, note, classifier_version, created_at FROM settings ORDER BY version DESC"),
  ]);

  return (
    <>
      <h1>
        Settings <span className="muted small">v{current.version}, for classifier {current.classifier_version}</span>
      </h1>
      <p className="muted small">
        Counts are readings in this database classified by {current.classifier_version} (archive included). Drag a card, or use its buttons, to make a
        draft; the box below the columns shows what the draft would change before you save it.
      </p>
      <TierBoard current={current} cards={cards} groups={groups} fighters={fighters} readOnly={schema === "replay"} />
      <h2>History</h2>
      <table>
        <thead>
          <tr>
            <th>version</th>
            <th>saved</th>
            <th>by</th>
            <th>classifier</th>
            <th>note</th>
          </tr>
        </thead>
        <tbody>
          {history.map((row) => (
            <tr key={row.version}>
              <td>v{row.version}</td>
              <td className="nowrap">{pacificTime(row.created_at)}</td>
              <td>{row.author}</td>
              <td>{row.classifier_version}</td>
              <td className="pre">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Each combination's count of readings and its three newest headlines, plus
 * the same for the not-about-him gate (kept under the key "gate").
 *
 * @param schema  "public" or "replay".
 * @param settings  The settings in force: they name the answers the map reads.
 * @returns Cell name (or "gate") → readings and example headlines.
 */
async function cardCounts(schema: Schema, settings: SettingsRow): Promise<Record<string, CardCounts>> {
  const { gate, rows, columns } = settings.tiers;
  const counted = await query<{ fact: string; firmness: string; is_gate: boolean; readings: string; examples: string[] }>(
    schema,
    `SELECT is_gate, CASE WHEN is_gate THEN '' ELSE fact END AS fact, CASE WHEN is_gate THEN '' ELSE firmness END AS firmness,
            count(*) AS readings, (array_agg(headline ORDER BY published_at DESC))[1:3] AS examples
     FROM (
       SELECT rn.headline, rn.published_at, rn.classification ->> $1 AS fact, rn.classification ->> $2 AS firmness,
              coalesce(rn.classification ->> $3, '') = ANY($4::text[]) AS is_gate
       FROM reading_now rn
       WHERE rn.classification IS NOT NULL AND rn.classifier_version = $5
     ) answered
     GROUP BY 1, 2, 3`,
    [rows, columns, gate.question, gate.notAboutHim, settings.classifier_version],
  );

  // Key each count by the cell it falls in, as the Decider names cells.
  const cards: Record<string, CardCounts> = {};
  for (const row of counted) {
    const key = row.is_gate ? "gate" : cellName(row.fact, row.firmness);
    cards[key] = { readings: Number(row.readings), examples: row.examples };
  }
  return cards;
}

/**
 * The readings grouped by the three answers the map reads, for the draft preview.
 *
 * @param schema  "public" or "replay".
 * @param settings  The settings in force.
 * @returns One group per distinct set of answers, with how many readings share it.
 */
async function answerGroups(schema: Schema, settings: SettingsRow): Promise<AnswerGroup[]> {
  const { gate, rows, columns } = settings.tiers;
  const grouped = await query<{ gate_answer: string; row_answer: string; column_answer: string; readings: string }>(
    schema,
    `SELECT classification ->> $1 AS gate_answer, classification ->> $2 AS row_answer, classification ->> $3 AS column_answer, count(*) AS readings
     FROM reading_now
     WHERE classification IS NOT NULL AND classifier_version = $4
     GROUP BY 1, 2, 3`,
    [gate.question, rows, columns, settings.classifier_version],
  );

  // Rebuild each group's answers under the names the Decider reads.
  return grouped.map((group) => ({
    answers: { [gate.question]: group.gate_answer, [rows]: group.row_answer, [columns]: group.column_answer },
    readings: Number(group.readings),
  }));
}
