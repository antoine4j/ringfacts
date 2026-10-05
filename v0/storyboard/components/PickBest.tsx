"use client";
// "Best" on one digest of a side-by-side week (task 0.5, D25). A click adds a
// feedback row on the digest: field "model_pick", should_be "best". The week's
// latest pick is the one that counts.

import { useActionState } from "react";
import { addFeedback, type ActionResult } from "../app/actions.ts";

/**
 * The button for one digest.
 *
 * @param props.digestId  The digest.
 * @param props.schema  "public" or "replay".
 * @param props.chosen  Whether it is the week's current pick.
 * @returns The button, and a line when a save failed.
 */
export function PickBest({ digestId, schema, chosen }: { digestId: string; schema: string; chosen: boolean }) {
  const [result, send, sending] = useActionState<ActionResult | null, FormData>(addFeedback, null);
  // The page reloads its data after a save, so "chosen" is always the stored truth.
  const isChosen = chosen;

  return (
    <form action={send} className="verdict">
      <input type="hidden" name="target" value="digest" />
      <input type="hidden" name="id" value={digestId} />
      <input type="hidden" name="schema" value={schema} />
      <input type="hidden" name="field" value="model_pick" />
      <button type="submit" name="should_be" value="best" disabled={sending} aria-pressed={isChosen}>
        {isChosen ? "✓ best this week" : "best"}
      </button>
      {result && !result.ok && <span className="bad small">{result.message}</span>}
    </form>
  );
}
