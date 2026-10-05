// How the reading page shows each station's rows: the answers of the
// Classifier (4) and Claim extractor (5), and Semantic dedup's (6) shortlist
// and pick. Every version is shown, newest first; older ones are dimmed.

import Link from "next/link";
import { Json, PickTag } from "../../../components/bits.tsx";
import { FeedbackForm } from "../../../components/FeedbackForm.tsx";
import { pacificTime, percent } from "../../../lib/format.ts";
import { schemaSuffix, type Schema } from "../../../lib/schema.ts";

/** A row of classifications or extracts. */
export type AnswerRow = { id: string; version: string; answers: Record<string, unknown>; raw: unknown; created_at: Date };

/** A row of groupings, without its embedding. */
export type GroupingRow = {
  id: string;
  extract_id: string;
  version: string;
  shortlist: { claimId: number; label: string; similarity: number }[];
  pick: { claim?: number | null; confidence?: number; raw?: unknown };
  claim_id: string;
  created_at: Date;
};

/** A row of decisions. */
export type DecisionRow = { id: string; classification_id: string; settings_version: number; tier: number; cell: string; created_at: Date };

/**
 * Every row of one answering station, each as a table of answer → value.
 *
 * @param props.rows  The rows, newest first.
 * @param props.prefix  "classification" or "extract": names the answers in feedback.
 * @param props.readingId  The reading, for the feedback form.
 * @param props.schema  "public" or "replay".
 * @param props.showJev  Whether to show JEV's confidence beside each answer.
 * @returns The rows.
 */
export function AnswerRows({ rows, prefix, readingId, schema, showJev = false }: { rows: AnswerRow[]; prefix: string; readingId: string; schema: Schema; showJev?: boolean }) {
  if (rows.length === 0) return <p className="muted">No answer yet.</p>;
  return (
    <>
      {rows.map((row, index) => {
        const names = Object.keys(row.answers);
        return (
          <div key={row.id} className={index > 0 ? "muted" : ""}>
            <h3>
              {row.version} <span className="muted small">#{row.id} · {pacificTime(row.created_at)}{index > 0 ? " · older version" : ""}</span>
            </h3>
            <table>
              <tbody>
                {names.map((name) => (
                  <tr key={name}>
                    <th style={{ width: "14em" }}>{name}</th>
                    <td>{formatAnswer(row.answers[name])}</td>
                    {showJev && <td className="small muted">{jevDetail(row.raw, name)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {index === 0 && <FeedbackForm target="reading" id={readingId} schema={schema} fields={names.map((name) => `${prefix}.${name}`)} />}
            <details>
              <summary className="small muted">the model&apos;s whole reply</summary>
              <Json value={row.raw} />
            </details>
          </div>
        );
      })}
    </>
  );
}

/**
 * An answer's value as text.
 *
 * @param value  The value from the answers jsonb.
 * @returns The text; "(none)" for null.
 */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * JEV's own confidence for one answer, from its whole reply.
 *
 * @param raw  JEV's reply, as classifications.raw stores it.
 * @param name  The answer's name.
 * @returns For example "confidence 89%" or "score 1.26"; "" when JEV gave none for it.
 */
function jevDetail(raw: unknown, name: string): string {
  const answers = (raw as { answers?: Record<string, { confidence?: number; score?: number }> } | null)?.answers;
  const entry = answers?.[name];
  if (!entry) return "";
  const parts: string[] = [];
  if (typeof entry.score === "number") parts.push(`score ${entry.score}`);
  if (typeof entry.confidence === "number") parts.push(`confidence ${percent(entry.confidence)}`);
  return parts.join(" · ");
}

/**
 * Every grouping of the reading: the shortlist JEV was shown, its pick, and the claim joined.
 *
 * @param props.rows  The groupings, newest first.
 * @param props.readingId  The reading, for the feedback form.
 * @param props.schema  "public" or "replay".
 * @returns The rows.
 */
export function GroupingRows({ rows, readingId, schema }: { rows: GroupingRow[]; readingId: string; schema: Schema }) {
  if (rows.length === 0) return <p className="muted">Not grouped yet.</p>;
  return (
    <>
      {rows.map((row, index) => (
        <div key={row.id} className={index > 0 ? "muted" : ""}>
          <h3>
            {row.version} <span className="muted small">#{row.id} · from extract #{row.extract_id} · {pacificTime(row.created_at)}</span>
          </h3>
          <p>
            Pick: <PickTag pick={row.pick} /> → claim <Link href={`/claims/${row.claim_id}${schemaSuffix(schema)}`}>#{row.claim_id}</Link>
            {row.pick.claim === null || row.pick.claim === undefined ? " (started by this reading)" : ""}
          </p>
          <ShortlistTable shortlist={row.shortlist} picked={row.pick.claim ?? null} schema={schema} />
          {index === 0 && <FeedbackForm target="reading" id={readingId} schema={schema} fields={["grouping", "grouping.pick", "grouping.shortlist"]} />}
          <details>
            <summary className="small muted">JEV&apos;s whole reply to the pick</summary>
            <Json value={row.pick.raw ?? null} />
          </details>
        </div>
      ))}
    </>
  );
}

/**
 * The claims JEV could choose from, with each one's similarity.
 *
 * @param props.shortlist  The shortlist, as groupings.shortlist stores it.
 * @param props.picked  The claim JEV chose, or null for "none of these".
 * @param props.schema  Kept on links.
 * @returns The table, or a line when the shortlist was empty.
 */
function ShortlistTable({ shortlist, picked, schema }: { shortlist: GroupingRow["shortlist"]; picked: number | null; schema: Schema }) {
  if (shortlist.length === 0) return <p className="small muted">The shortlist was empty: no claim of his had an article in the last 14 days.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>claim</th>
          <th className="num">similarity</th>
          <th>label JEV was shown</th>
        </tr>
      </thead>
      <tbody>
        {shortlist.map((option) => (
          <tr key={option.claimId} className={option.claimId === picked ? "" : "dim"}>
            <td className="nowrap">
              <Link href={`/claims/${option.claimId}${schemaSuffix(schema)}`}>#{option.claimId}</Link>
              {option.claimId === picked && <span className="tag good">picked</span>}
            </td>
            <td className="num">{option.similarity.toFixed(3)}</td>
            <td>{option.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
