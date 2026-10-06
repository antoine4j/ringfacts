"use client";
// The review controls (D35): ✓ and ✕ on a reading in a claim, "same claim
// as…" on a claim, and the picker both open to
// choose the other claim, with an optional note. Each control saves one row
// (app/review-actions.ts) and reloads the page's data; nothing on the page is
// regrouped by a mark. The picker's suggestions start loading when the pointer
// reaches the button, and fill a box of fixed height, so nothing in the picker
// moves when they arrive.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "../app/actions.ts";
import { claimSuggestions, markReading, markSameClaim, type Suggestion } from "../app/review-actions.ts";
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
 * The picker's suggestions, fetched once and kept: started by preload (the
 * pointer on the button, or the picker opening), read again by the picker.
 *
 * @param fetch  Asks the server for the suggestions.
 * @returns preload() starts the fetch if it has not started and returns it; known() is the list if it has arrived; forget() drops it after a save, which can change the list.
 */
function usePreloaded(fetch: () => Promise<Suggestion[]>): { preload: () => Promise<Suggestion[]>; known: () => Suggestion[] | null; forget: () => void } {
  const kept = useRef<{ promise: Promise<Suggestion[]>; found: Suggestion[] | null } | null>(null);
  const preload = () => {
    if (!kept.current) {
      const entry: { promise: Promise<Suggestion[]>; found: Suggestion[] | null } = { promise: Promise.resolve([]), found: null };
      entry.promise = fetch().then(
        (found) => (entry.found = found),
        () => (entry.found = []),
      );
      kept.current = entry;
    }
    return kept.current.promise;
  };
  return { preload, known: () => kept.current?.found ?? null, forget: () => (kept.current = null) };
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
  const suggestions = usePreloaded(() => claimSuggestions({ claimId, readingId }));

  // The buttons show a new mark at once; the page's fresh data replaces it when it arrives.
  const [shown, setShown] = useState<{ from: CurrentMark; mark: CurrentMark } | null>(null);
  const mark = shown && shown.from === current ? shown.mark : current;
  const belongs = mark?.verdict === "belongs";
  const off = Boolean(mark) && !belongs;
  const save = (verdict: ReadingVerdict, belongsIn: string | null = null, note = "") => {
    setShown({ from: current, mark: verdict === "cleared" ? null : { verdict, belongs_in_claim_id: belongsIn, note } });
    run(() => markReading({ claimId, readingId, verdict, belongsIn, note }), () => {
      setPicking(false);
      suggestions.forget();
    });
  };

  return (
    <span className="review">
      <button type="button" className="mark yes" aria-pressed={belongs} disabled={saving} title={belongs ? "Belongs in this claim: press to clear" : "Belongs in this claim"} onClick={() => save(belongs ? "cleared" : "belongs")}>
        ✓
      </button>
      <button type="button" className="mark no" aria-pressed={off} disabled={saving} title={off ? "Does not belong: press to clear" : "Does not belong in this claim"} onPointerEnter={() => off || suggestions.preload()} onFocus={() => off || suggestions.preload()} onClick={() => (off ? save("cleared") : setPicking(!picking))}>
        ✕
      </button>
      {picking && (
        <ClaimPicker
          suggestions={suggestions}
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
 * @param props.suggestions  The suggested claims, perhaps already loaded.
 * @param props.question  The picker's title.
 * @param props.allowOwn  Offer "its own claim" and "not sure" (a reading); a claim link needs a claim.
 * @param props.saving  A save is running.
 * @param props.onCancel  Close without saving.
 * @param props.onSave  Save the choice and the note.
 * @returns The panel.
 */
function ClaimPicker(props: { suggestions: ReturnType<typeof usePreloaded>; question: string; allowOwn: boolean; saving: boolean; onCancel: () => void; onSave: (choice: Choice, note: string) => void }) {
  const { question, allowOwn, saving, onCancel, onSave } = props;
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(props.suggestions.known);
  const [choice, setChoice] = useState<Choice | null>(allowOwn ? { kind: "unknown" } : null);
  const [typed, setTyped] = useState("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");

  // The suggestions arrive (if the pointer did not already fetch them) while the picker is open.
  const { preload } = props.suggestions;
  useEffect(() => {
    let open = true;
    preload().then((found) => open && setSuggestions(found));
    return () => {
      open = false;
    };
    // Once per opening: preload is a new function each render but returns the same fetch.
  }, []);
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
      <div className="picker-suggestions" aria-busy={suggestions === null}>
        {suggestions?.map((suggestion) => (
          <button key={suggestion.id} type="button" className="option" aria-pressed={picked(suggestion.id)} onClick={() => {
              setTyped("");
              setChoice({ kind: "claim", id: suggestion.id });
            }}>
            <span className="option-id">#{suggestion.id}</span> {suggestion.label}
            <span className="option-why">{suggestion.why}</span>
          </button>
        ))}
        {suggestions === null && [0, 1, 2].map((row) => <span key={row} className="option placeholder" aria-hidden />)}
        {suggestions?.length === 0 && <span className="muted small">No suggestions; type a claim number below.</span>}
      </div>
      <div className="picker-options">
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
  const suggestions = usePreloaded(() => claimSuggestions({ claimId }));

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
      <button type="button" className="small" disabled={saving} onPointerEnter={suggestions.preload} onFocus={suggestions.preload} onClick={() => setPicking(!picking)}>
        {saving ? "saving…" : "same claim as…"}
      </button>
      {picking && (
        <ClaimPicker
          suggestions={suggestions}
          question="Which claim is this the same claim as?"
          allowOwn={false}
          saving={saving}
          onCancel={() => setPicking(false)}
          onSave={(choice, note) => choice.kind === "claim" && run(() => markSameClaim({ claimId, otherClaimId: choice.id, verdict: "same_claim", note }), () => {
              setPicking(false);
              suggestions.forget();
            })}
        />
      )}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
