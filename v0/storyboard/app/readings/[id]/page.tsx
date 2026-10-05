// One reading: the article, then every station's answers in pipeline order,
// every version of each (newest first), each with a feedback form, then the
// feedback already given.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Decision } from "../../../components/Decision.tsx";
import { FeedbackForm } from "../../../components/FeedbackForm.tsx";
import { FeedbackList } from "../../../components/FeedbackList.tsx";
import { query } from "../../../lib/db.ts";
import type { Params } from "../../../lib/filters.ts";
import { pacificTime } from "../../../lib/format.ts";
import { feedbackOn, latestReaction } from "../../../lib/queries.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../../../lib/schema.ts";
import { AnswerRows, GroupingRows, type AnswerRow, type DecisionRow, type GroupingRow } from "./stations.tsx";

/** The reading and its article, as this page shows them. */
type ReadingDetail = {
  reading_id: string;
  article_id: string;
  fighter: string;
  found_by: string;
  stage: string;
  stuck_from: string | null;
  attempts: number;
  last_error: string | null;
  posted_at: Date | null;
  message_id: string | null;
  reaction: string | null;
  production_item_id: string;
  url: string;
  outlet: string;
  headline: string;
  published_at: Date;
  has_body: boolean;
  body: string | null;
  body_via: string | null;
  production_subject: string;
  production_outcome: string | null;
  backfill: boolean;
  created_at: Date;
};

/**
 * The reading page.
 *
 * @param props.params  The reading id from the address.
 * @param props.searchParams  ?schema=replay, if any.
 * @returns The page.
 */
export default async function ReadingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  const schema = schemaFrom((await searchParams).schema);
  if (!/^\d+$/.test(id)) notFound();

  // The reading with its article.
  const readings = await query<ReadingDetail>(
    schema,
    `SELECT rn.*, a.body, r.created_at, ${latestReaction("rn.message_id")} AS reaction
     FROM reading_now rn JOIN readings r ON r.id = rn.reading_id JOIN articles a ON a.id = rn.article_id
     WHERE rn.reading_id = $1`,
    [id],
  );
  const reading = readings[0];
  if (!reading) notFound();

  // Every station's rows for it, newest first, and the feedback on it.
  const [classifications, extracts, groupings, decisions, feedback, siblings] = await Promise.all([
    query<AnswerRow>(schema, "SELECT id, version, answers, raw, created_at FROM classifications WHERE reading_id = $1 ORDER BY id DESC", [id]),
    query<AnswerRow>(schema, "SELECT id, version, answers, raw, created_at FROM extracts WHERE reading_id = $1 ORDER BY id DESC", [id]),
    query<GroupingRow>(schema, "SELECT id, extract_id, version, shortlist, pick, claim_id, created_at FROM groupings WHERE reading_id = $1 ORDER BY id DESC", [id]),
    query<DecisionRow>(schema, `SELECT d.id, d.classification_id, d.settings_version, d.tier, d.cell, d.created_at, c.answers ->> 'centrality' AS centrality
       FROM decisions d JOIN classifications c ON c.id = d.classification_id
       WHERE d.reading_id = $1 ORDER BY d.id DESC`, [id]),
    feedbackOn(schema, "reading", id),
    query<{ id: string; fighter: string }>(schema, "SELECT id, fighter FROM readings WHERE article_id = $1 AND id <> $2 ORDER BY id", [reading.article_id, id]),
  ]);

  return (
    <>
      <h1>
        Reading #{reading.reading_id} <span className="muted small">{reading.fighter}</span>
      </h1>
      <ArticleSection reading={reading} siblings={siblings} schema={schema} />
      <section className="section">
        <h2>Classifier (4)</h2>
        <AnswerRows rows={classifications} prefix="classification" readingId={id} schema={schema} showJev />
      </section>
      <section className="section">
        <h2>Claim extractor (5)</h2>
        <AnswerRows rows={extracts} prefix="extract" readingId={id} schema={schema} />
      </section>
      <section className="section">
        <h2>Semantic dedup (6)</h2>
        <GroupingRows rows={groupings} readingId={id} schema={schema} />
      </section>
      <section className="section">
        <h2>Decider (7)</h2>
        <DecisionTable rows={decisions} readingId={id} schema={schema} />
        <p>
          Production&apos;s outcome: <strong>{reading.production_outcome ?? "none recorded"}</strong>
          {reading.posted_at ? ` · v0 posted it ${pacificTime(reading.posted_at)} (message ${reading.message_id})${reading.reaction ? `, you reacted ${reading.reaction}` : ""}` : " · v0 has not posted it"}
        </p>
      </section>
      <section className="section">
        <h2>Feedback on this reading</h2>
        <FeedbackList rows={feedback} />
      </section>
    </>
  );
}

/**
 * The article and the reading's state.
 *
 * @param props.reading  The reading.
 * @param props.siblings  The same article's readings for other fighters.
 * @param props.schema  Kept on links.
 * @returns The section.
 */
function ArticleSection({ reading, siblings, schema }: { reading: ReadingDetail; siblings: { id: string; fighter: string }[]; schema: Schema }) {
  return (
    <section>
      <h2>
        <a href={reading.url} target="_blank" rel="noreferrer">
          {reading.headline} ↗
        </a>
      </h2>
      <dl className="kv">
        <dt>outlet · published</dt>
        <dd>
          {reading.outlet} · {pacificTime(reading.published_at)}
        </dd>
        <dt>body</dt>
        <dd>{reading.has_body ? `yes, ${reading.body?.length ?? 0} characters, via ${reading.body_via ?? "?"}` : "none (never classified)"}</dd>
        <dt>found by</dt>
        <dd>
          {reading.found_by} (production filed it under {reading.production_subject})
        </dd>
        <dt>stage</dt>
        <dd>
          {reading.stage}
          {reading.stuck_from ? ` (stuck at ${reading.stuck_from})` : ""}
          {reading.attempts > 0 ? ` · ${reading.attempts} failed attempts · last error: ${reading.last_error}` : ""}
        </dd>
        <dt>ids</dt>
        <dd>
          article {reading.article_id} · production item {reading.production_item_id} · made {pacificTime(reading.created_at)}
          {reading.backfill ? " · archive (never posted)" : ""}
        </dd>
        {siblings.length > 0 && <dt>also read for</dt>}
        {siblings.length > 0 && (
          <dd>
            {siblings.map((sibling) => (
              <Link key={sibling.id} href={`/readings/${sibling.id}${schemaSuffix(schema)}`}>
                {sibling.fighter} (#{sibling.id}){" "}
              </Link>
            ))}
          </dd>
        )}
      </dl>
      {reading.body && (
        <details>
          <summary className="small">the article body</summary>
          <pre className="json pre">{reading.body}</pre>
        </details>
      )}
    </section>
  );
}

/**
 * Every decision for the reading, newest first.
 *
 * @param props.rows  The decisions.
 * @param props.readingId  The reading, for the feedback form.
 * @param props.schema  "public" or "replay".
 * @returns The table and a feedback form.
 */
function DecisionTable({ rows, readingId, schema }: { rows: DecisionRow[]; readingId: string; schema: Schema }) {
  if (rows.length === 0) return <p className="muted">Not decided yet.</p>;
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>decided</th>
            <th>decision</th>
            <th>settings</th>
            <th>from classification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={index > 0 ? "dim" : ""}>
              <td className="nowrap">{pacificTime(row.created_at)}</td>
              <td>
                <Decision tier={row.tier} cell={row.cell} centrality={row.centrality} schema={schema} />
              </td>
              <td>v{row.settings_version}</td>
              <td>#{row.classification_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FeedbackForm target="reading" id={readingId} schema={schema} fields={["tier", "cell"]} label="feedback on the tier" />
    </>
  );
}

