// The scores page's reference section: the golden replay's stored result
// (scoreboard D7), newest in full and older runs a line each. It does not
// follow the period picker: the golden articles' dates are fixed.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §6.

import type { ReactNode } from "react";
import { countWithShare, intervalWords } from "../lib/format.ts";
import type { Count, ReplayResult, SideScores, Versions } from "../lib/replay-results.ts";
import { THIN_BELOW } from "../lib/scores.ts";
import { wilson } from "../lib/wilson.ts";

/** The three sides, in the order the table shows them. */
const SIDES = ["training", "validation", "test"] as const;

/**
 * A run's versions in one line.
 *
 * @param versions  The versions, or null when the file did not record them.
 * @returns Such as "classifier v7.7 · extractor p4 · grouping g1 · settings 1".
 */
export function versionWords(versions: Versions | null): string {
  if (!versions) return "versions not recorded";
  return `classifier ${versions.classifier} · extractor ${versions.extractor} · grouping ${versions.grouping} · settings ${versions.settings}`;
}

/**
 * A headline count with its share and Wilson range.
 *
 * @param props.share  How many of how many.
 * @returns The cell's content.
 */
function Headline({ share }: { share: Count }) {
  return (
    <>
      {countWithShare(share.count, share.of)}
      <br />
      <span className="small muted">{intervalWords(wilson(share.count, share.of))}</span>
    </>
  );
}

/**
 * A slice's count, greyed when too few were counted (scoreboard D9).
 *
 * @param props.share  How many of how many.
 * @returns The cell's content.
 */
function Slice({ share }: { share: Count }) {
  return <span className={share.of < THIN_BELOW ? "muted" : ""}>{countWithShare(share.count, share.of)}</span>;
}

/**
 * One row of the reference table: a name, and a cell per side.
 *
 * @param props.name  What the row shows.
 * @param props.result  The run.
 * @param props.cell  What one side's cell holds.
 * @returns The row.
 */
function SideRow({ name, result, cell }: { name: string; result: ReplayResult; cell: (side: SideScores) => ReactNode }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      {SIDES.map((side) => {
        const scores = result.sides[side];
        return (
          <td key={side} className="num">
            {scores ? cell(scores) : <span className="muted">not yet run</span>}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Pair precision and recall, with the pair counts when the file kept them.
 *
 * @param props.side  One side's scores.
 * @returns The cell's content.
 */
function Pairs({ side }: { side: SideScores }) {
  const counts = side.pairs ? `${side.pairs.bothSame} of ${side.pairs.v0Same} · ${side.pairs.bothSame} of ${side.pairs.ruledSame} pairs` : "pair counts not recorded";
  return (
    <>
      {side.pairPrecision.toFixed(2)} / {side.pairRecall.toFixed(2)}
      <br />
      <span className="small muted">{counts}</span>
    </>
  );
}

/**
 * The reference section.
 *
 * @param props.headline  The newest stored run, or null when there is none.
 * @param props.history  The older runs, newest first.
 * @returns The section.
 */
export function ReplayReference({ headline, history }: { headline: ReplayResult | null; history: ReplayResult[] }) {
  if (!headline) return <p className="muted">No replay result is stored yet.</p>;
  return (
    <section>
      <h2>Reference: the golden replay</h2>
      <p className="small muted">
        The pipeline re-run on a fixed, hand-labelled set of articles (the golden set: 300 articles from 31 July to 17 September, of which the 195 in training and
        validation are replayed) and scored against the labels. Stored result of {headline.runDate}, {versionWords(headline.versions)}. It does not follow the period
        above. The 105 test articles are scored once, before the launch.
      </p>
      <ReferenceTable result={headline} />
      <QuestionDetails result={headline} />
      {history.length > 0 && <HistoryLines history={history} />}
    </section>
  );
}

/**
 * The reference table: the pass marks with their ranges, then grouping and posting.
 *
 * @param props.result  The run.
 * @returns The table.
 */
function ReferenceTable({ result }: { result: ReplayResult }) {
  const heading = (side: (typeof SIDES)[number]) => `${side[0].toUpperCase()}${side.slice(1)}${result.sides[side] ? ` (${result.sides[side]!.articles})` : ""}`;
  return (
    <div className="table-scroll">
    <table className="score-reference">
      <thead>
        <tr>
          <th />
          {SIDES.map((side) => (
            <th key={side} className="num">
              {heading(side)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <SideRow name="All nine classifier answers right" result={result} cell={(side) => <Headline share={side.allNineRight} />} />
        <SideRow name="Career-event stories recognised (G1)" result={result} cell={(side) => <Headline share={side.g1Recognised} />} />
        <SideRow name="Articles wrongly called a career event (G2)" result={result} cell={(side) => <Headline share={side.g2FalseAlarms} />} />
        <SideRow name="Rumours called official (G4)" result={result} cell={(side) => side.g4WeakerCalledOfficial} />
        <SideRow name="Grouping: pair precision / recall" result={result} cell={(side) => <Pairs side={side} />} />
        <SideRow name="Labelled stories split" result={result} cell={(side) => <Slice share={side.ruledClaimsSplit} />} />
        <SideRow name="Bot's stories mixing labelled ones" result={result} cell={(side) => <Slice share={side.v0ClaimsMixingRuled} />} />
        <SideRow
          name="Stories due a post that got one"
          result={result}
          cell={(side) => <Slice share={{ count: side.posting.posted, of: side.posting.shouldPost }} />}
        />
        <SideRow name="Posts not due, posted twice" result={result} cell={(side) => `${side.posting.notDue}, ${side.posting.postedTwice}`} />
      </tbody>
    </table>
    </div>
  );
}

/**
 * Each classifier question's right answers, folded away by default.
 *
 * @param props.result  The run.
 * @returns The details block.
 */
function QuestionDetails({ result }: { result: ReplayResult }) {
  const questions = Object.keys(result.sides.training.rightPerQuestion);
  return (
    <details>
      <summary className="small">Right answers per classifier question</summary>
      <table className="score-details">
        <tbody>
          {questions.map((question) => (
            <SideRow key={question} name={question} result={result} cell={(side) => <Slice share={{ count: side.rightPerQuestion[question], of: side.articles }} />} />
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * Older runs, one line each, so a change can be read across them.
 *
 * @param props.history  The older runs, newest first.
 * @returns The list.
 */
function HistoryLines({ history }: { history: ReplayResult[] }) {
  return (
    <>
      <h3>Earlier runs</h3>
      <ul className="small">
        {history.map((run) => (
          <li key={run.name}>
            {run.runDate} ({versionWords(run.versions)}): all nine right on {countWithShare(run.sides.training.allNineRight.count, run.sides.training.allNineRight.of)} training and{" "}
            {countWithShare(run.sides.validation.allNineRight.count, run.sides.validation.allNineRight.of)} validation articles; validation pair precision{" "}
            {run.sides.validation.pairPrecision.toFixed(2)}. <span className="muted">({run.name})</span>
          </li>
        ))}
      </ul>
    </>
  );
}
