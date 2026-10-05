"use client";
// The review controls (D35): ✓ and ✕ on a reading in a claim, "same claim
// as…" on a claim, "mark the rest as belonging", and the picker both open to
// choose the other claim, with an optional note. Each control saves one row
// (app/review-actions.ts) and reloads the page's data; nothing on the page is
// regrouped by a mark.

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "../app/actions.ts";
import { claimSuggestions, markReading, markRestBelonging, markSameClaim, type Suggestion } from "../app/review-actions.ts";
import type { ReadingVerdict } from "../lib/reviews.ts";

/** A reading's mark in force, as the page knows it. */
export type CurrentMark = { verdict: ReadingVerdict; belongs_in_claim_id: string | null; note: string } | null;

/** What the picker chose: another claim, a claim of its own, or no place named. */
type Choice = { kind: "claim"; id: string } | { kind: "own" } | { kind: "unknown" };

/**
 * Runs a save, then reloads the page's data; keeps the error to show.
 *
 * @returns run(save), whether one is running, and the last error.
 */
function useSave(): { run: (save: () => Promise<ActionResult>, after?: () => void) => void; saving: boolean; error: string } {
  const router = useRouter();
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (save: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await save();
      setError(result.ok ? "" : result.message);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });
  return { run, saving, error };
}

/**
 * ✓ and ✕ on one reading in one claim. ✓ marks it belonging; ✕ opens the
 * picker to say where it belongs. Pressing a set mark clears it.
 *
 * @param props.claimId  The claim.
 * @param props.readingId  The reading.
 * @param props.current  Its mark in force, or null.
 * @returns The two buttons, and the picker when open.
 */
export function ReadingReview({ claimId, readingId, current }: { claimId: string; readingId: string; current: CurrentMark }) {
  const { run, saving, error } = useSave();
  const [picking, setPicking] = useState(false);

  // The buttons show a new mark at once; the page's fresh data replaces it when it arrives.
  const [shown, setShown] = useState<{ from: CurrentMark; mark: CurrentMark } | null>(null);
  const mark = shown && shown.from === current ? shown.mark : current;
  const belongs = mark?.verdict === "belongs";
  const off = Boolean(mark) && !belongs;
  const save = (verdict: ReadingVerdict, belongsIn: string | null = null, note = "") => {
    setShown({ from: current, mark: verdict === "cleared" ? null : { verdict, belongs_in_claim_id: belongsIn, note } });
    run(() => markReading({ claimId, readingId, verdict, belongsIn, note }), () => setPicking(false));
  };

  return (
    <span className="review">
      <button type="button" className="mark yes" aria-pressed={belongs} disabled={saving} title={belongs ? "Belongs in this claim: press to clear" : "Belongs in this claim"} onClick={() => save(belongs ? "cleared" : "belongs")}>
        ✓
      </button>
      <button type="button" className="mark no" aria-pressed={off} disabled={saving} title={off ? "Does not belong: press to clear" : "Does not belong in this claim"} onClick={() => (off ? save("cleared") : setPicking(!picking))}>
        ✕
      </button>
      {picking && (
        <ClaimPicker
          claimId={claimId}
          readingId={readingId}
          question="Where does it belong?"
          allowOwn
          saving={saving}
          onCancel={() => setPicking(false)}
          onSave={(choice, note) => save(choice.kind === "own" ? "own_claim" : "does_not_belong", choice.kind === "claim" ? choice.id : null, note)}
        />
      )}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}

/**
 * The picker: suggested claims, "its own claim" and "not sure" (for a
 * reading), a claim number, and an optional note.
 *
 * @param props.claimId  The claim the mark is made in.
 * @param props.readingId  The reading being placed, if any.
 * @param props.question  The picker's title.
 * @param props.allowOwn  Offer "its own claim" and "not sure" (a reading); a claim link needs a claim.
 * @param props.saving  A save is running.
 * @param props.onCancel  Close without saving.
 * @param props.onSave  Save the choice and the note.
 * @returns The panel.
 */
function ClaimPicker(props: { claimId: string; readingId?: string; question: string; allowOwn: boolean; saving: boolean; onCancel: () => void; onSave: (choice: Choice, note: string) => void }) {
  const { claimId, readingId, question, allowOwn, saving, onCancel, onSave } = props;
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [choice, setChoice] = useState<Choice | null>(allowOwn ? { kind: "unknown" } : null);
  const [typed, setTyped] = useState("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");

  // The suggestions load when the picker opens.
  useEffect(() => {
    let open = true;
    claimSuggestions({ claimId, readingId }).then(
      (found) => open && setSuggestions(found),
      () => open && setSuggestions([]),
    );
    return () => {
      open = false;
    };
  }, [claimId, readingId]);
  const picked = (id: string) => choice?.kind === "claim" && choice.id === id && !typed;

  // A typed number is the choice as soon as it is a number.
  const type = (value: string) => {
    setTyped(value);
    const id = value.replace(/^#/, "").trim();
    if (/^\d+$/.test(id)) setChoice({ kind: "claim", id });
  };

  return (
    <div className="picker" role="dialog" aria-label={question}>
      <div className="picker-title">{question}</div>
      <div className="picker-options">
        {suggestions?.map((suggestion) => (
          <button key={suggestion.id} type="button" className="option" aria-pressed={picked(suggestion.id)} onClick={() => {
              setTyped("");
              setChoice({ kind: "claim", id: suggestion.id });
            }}>
            <span className="option-id">#{suggestion.id}</span> {suggestion.label}
            <span className="option-why">{suggestion.why}</span>
          </button>
        ))}
        {suggestions === null && <span className="muted small">Loading suggestions…</span>}
        {suggestions?.length === 0 && <span className="muted small">No suggestions; type a claim number below.</span>}
        {allowOwn && (
          <span className="picker-row">
            <button type="button" className="option short" aria-pressed={choice?.kind === "own"} onClick={() => setChoice({ kind: "own" })}>
              its own claim
            </button>
            <button type="button" className="option short" aria-pressed={choice?.kind === "unknown"} onClick={() => setChoice({ kind: "unknown" })}>
              not sure where
            </button>
          </span>
        )}
        <label className="picker-row small">
          claim #
          <input value={typed} inputMode="numeric" size={6} aria-label="claim number" onChange={(event) => type(event.target.value)} />
        </label>
      </div>
      {noting ? (
        <textarea className="picker-note" rows={2} maxLength={1000} placeholder="why (optional)" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
      ) : (
        <button type="button" className="link-button small" onClick={() => setNoting(true)}>
          add a note
        </button>
      )}
      <div className="picker-row">
        <button type="button" className="primary" disabled={saving || !choice || (choice.kind === "claim" && !/^\d+$/.test(choice.id))} onClick={() => choice && onSave(choice, note)}>
          {saving ? "saving…" : "save"}
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  );
}

/**
 * "Same claim as…" on a claim, and the claims Anton linked to it: a direct
 * link can be cleared here; one reached only through other claims cannot.
 *
 * @param props.claimId  The claim.
 * @param props.group  The other claims of its group, each with whether it is linked directly.
 * @returns The links and the button.
 */
export function SameClaimReview({ claimId, group }: { claimId: string; group: { id: string; direct: boolean }[] }) {
  const { run, saving, error } = useSave();
  const [picking, setPicking] = useState(false);

  return (
    <span className="review same-claim">
      {group.length > 0 && (
        <span className="small">
          same claim as{" "}
          {group.map((other, index) => (
            <span key={other.id}>
              {index > 0 && ", "}
              <a href={`/claims/${other.id}`}>#{other.id}</a>
              {other.direct && (
                <button type="button" className="unlink" title={`Unlink from #${other.id}`} disabled={saving} onClick={() => run(() => markSameClaim({ claimId, otherClaimId: other.id, verdict: "cleared" }))}>
                  ×
                </button>
              )}
            </span>
          ))}
        </span>
      )}
      <button type="button" className="small" disabled={saving} onClick={() => setPicking(!picking)}>
        {saving ? "saving…" : "same claim as…"}
      </button>
      {picking && (
        <ClaimPicker
          claimId={claimId}
          question="Which claim is this the same claim as?"
          allowOwn={false}
          saving={saving}
          onCancel={() => setPicking(false)}
          onSave={(choice, note) => choice.kind === "claim" && run(() => markSameClaim({ claimId, otherClaimId: choice.id, verdict: "same_claim", note }), () => setPicking(false))}
        />
      )}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}

/**
 * "Mark the rest as belonging": every reading of the claim not yet marked.
 *
 * @param props.claimId  The claim.
 * @param props.unmarked  How many readings have no mark.
 * @returns The button, or nothing when every reading is marked.
 */
export function MarkRestBelonging({ claimId, unmarked }: { claimId: string; unmarked: number }) {
  const { run, saving, error } = useSave();
  if (unmarked === 0) return null;
  return (
    <span className="review">
      <button type="button" className="small" disabled={saving} onClick={() => run(() => markRestBelonging({ claimId }))}>
        {saving ? "saving…" : `✓ mark the ${unmarked === 1 ? "last one" : `rest (${unmarked})`} as belonging`}
      </button>
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
