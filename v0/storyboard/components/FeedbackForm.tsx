"use client";
// A small "feedback" toggle under an answer: which answer, what it should be,
// and a note. Sending it adds one row to the feedback table.

import { useActionState } from "react";
import { addFeedback, type ActionResult } from "../app/actions.ts";
import type { FeedbackTarget } from "../lib/queries.ts";

/** What the form needs to know about the thing being commented on. */
type Props = {
  target: FeedbackTarget;
  id: string;
  schema: string;
  fields: string[];
  label?: string;
};

/**
 * The feedback form, folded until clicked.
 *
 * @param props.target  A reading, a claim or a digest.
 * @param props.id  Its id.
 * @param props.schema  "public" or "replay".
 * @param props.fields  The answer names to offer; the first is preselected.
 * @param props.label  The toggle's text.
 * @returns The form.
 */
export function FeedbackForm({ target, id, schema, fields, label = "feedback" }: Props) {
  const [result, send, sending] = useActionState<ActionResult | null, FormData>(addFeedback, null);
  const listId = `fields-${target}-${id}-${fields[0]}`;

  return (
    <details className="feedback-form">
      <summary>{label}</summary>
      <form action={send}>
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="schema" value={schema} />
        <input name="field" defaultValue={fields[0]} list={listId} size={22} aria-label="answer" required />
        <datalist id={listId}>
          {fields.map((field) => (
            <option key={field} value={field} />
          ))}
        </datalist>
        <input name="should_be" placeholder="should be (optional)" size={18} aria-label="should be" />
        <input name="note" placeholder="note" size={40} aria-label="note" />
        <button type="submit" disabled={sending}>
          {sending ? "saving…" : "save"}
        </button>
        {result && <span className={`tag ${result.ok ? "good" : "bad"}`}>{result.message}</span>}
      </form>
    </details>
  );
}
