"use client";
// "Which one was right?" on one disagreement between v0 and production
// (task 10.3). Each click adds a feedback row on the reading: field "compare",
// should_be "v0", "production" or "neither". The latest one is shown chosen.

import { useActionState } from "react";
import { addFeedback, type ActionResult } from "../app/actions.ts";

/** The three answers, as stored and as shown. */
const VERDICTS: [value: string, label: string][] = [
  ["v0", "v0"],
  ["production", "production"],
  ["neither", "neither"],
];

/**
 * The three buttons for one reading.
 *
 * @param props.readingId  The reading the two systems disagree on.
 * @param props.schema  "public" or "replay".
 * @param props.current  The latest verdict saved, or null.
 * @returns The buttons, and a line when a save failed.
 */
export function CompareVerdict({ readingId, schema, current }: { readingId: string; schema: string; current: string | null }) {
  const [result, send, sending] = useActionState<ActionResult | null, FormData>(addFeedback, null);

  // What was just saved wins over what the page was loaded with.
  const saved = result?.ok ? (result.message.match(/should be "(\w+)"/)?.[1] ?? current) : current;

  return (
    <form action={send} className="verdict">
      <input type="hidden" name="target" value="reading" />
      <input type="hidden" name="id" value={readingId} />
      <input type="hidden" name="schema" value={schema} />
      <input type="hidden" name="field" value="compare" />
      {VERDICTS.map(([value, label]) => (
        <button key={value} type="submit" name="should_be" value={value} disabled={sending} aria-pressed={saved === value}>
          {label}
        </button>
      ))}
      {result && !result.ok && <span className="bad small">{result.message}</span>}
    </form>
  );
}
