// A reading's decision: its tier, and the classifier answers behind it, each
// carrying the classifier's definition on hover. The answers link to their
// card on the settings page, where the cell can be moved to another tier. A
// plain link, not next/link: a full load is what makes the browser highlight
// the card (:target) and keep it clear of the pinned header (scroll-margin).

import { answersBehind, cellAnchor } from "../lib/answers.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { TierTag } from "./bits.tsx";

const QUESTION_NAMES: Record<string, string> = { centrality: "How central", fact: "What new fact", firmness: "How firm" };

/**
 * The tier and why.
 *
 * @param props.tier  The decided tier, or null when not decided yet.
 * @param props.cell  The decision's cell name.
 * @param props.centrality  The reading's centrality answer, read for a gate decision.
 * @param props.schema  Kept on the link to the settings page.
 * @returns The tier badge and the answers.
 */
export function Decision({ tier, cell, centrality, schema }: { tier: number | null; cell: string | null; centrality: string | null; schema: Schema }) {
  const answers = answersBehind(cell, centrality);
  return (
    <span className="decision">
      <TierTag tier={tier} />
      {cell && (
        <a href={`/settings${schemaSuffix(schema)}#${cellAnchor(cell)}`} className="why">
          {answers.map((answer, index) => (
            <span key={answer.question} title={`${QUESTION_NAMES[answer.question]}: ${answer.words}. ${answer.definition}`}>
              {index > 0 && " · "}
              {answer.words}
            </span>
          ))}
        </a>
      )}
    </span>
  );
}
