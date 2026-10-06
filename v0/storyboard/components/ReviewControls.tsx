"use client";
// The review controls (D35): ✓ and ✕ on a reading in a claim, the line under
// its headline, "same claim as…" on a claim, and the panels they open. A tap
// sets a mark that is not set; a tap on a set mark, or on the line, opens an
// editor where the note and the place can change and the mark can be cleared,
// so no single tap loses a mark. Each save adds one row (app/review-actions.ts)
// and reloads the page's data; nothing on the page is regrouped by a mark. The
// picker's suggestions start loading when the pointer reaches the button, and
// fill a box of fixed height, so nothing in the picker moves when they arrive.
// Design: docs/superpowers/specs/2026-10-06-review-mark-editing.md.

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import type { ActionResult } from "../app/actions.ts";
import { claimSuggestions, markReading, markSameClaim, type Suggestion } from "../app/review-actions.ts";
import { choiceVerdict, clearLabel, markChanged, markLine, startingChoice, tapAction, type Choice, type CurrentMark, type ReadingVerdict } from "../lib/reviews.ts";

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

/** Which panel a reading has open: the ✓ note editor, the picker for a new ✕, or the picker editing the ✕ in force. */
type Panel = "note" | "pick" | "edit-pick" | null;

/** What a reading's controls share: the mark shown, the open panel, and saving. */
type RowReview = {
  claimId: string;
  readingId: string;
  mark: CurrentMark;
  panel: Panel;
  tap: (button: "yes" | "no" | "line") => void;
  close: () => void;
  save: (verdict: ReadingVerdict, belongsIn?: string | null, note?: string) => void;
  saving: boolean;
  error: string;
  suggestions: ReturnType<typeof usePreloaded>;
  controlsRef: RefObject<HTMLSpanElement | null>;
  lineRef: RefObject<HTMLSpanElement | null>;
};

const RowContext = createContext<RowReview | null>(null);

/**
 * One reading's row in a reviewed claim. Holds what its ✓ and ✕ (in the first
 * cell) and the line under its headline (in another) share: the mark shown and
 * which panel is open. A tap outside them, or Escape, closes the panel.
 *
 * @param props.claimId  The claim.
 * @param props.readingId  The reading.
 * @param props.current  Its mark in force, or null.
 * @param props.children  The row's cells.
 * @returns The row, dimmed while the reading is marked ✕.
 */
export function ReviewRow({ claimId, readingId, current, children }: { claimId: string; readingId: string; current: CurrentMark; children: ReactNode }) {
  const { run, saving, error } = useSave();
  const [panel, setPanel] = useState<Panel>(null);
  const suggestions = usePreloaded(() => claimSuggestions({ claimId, readingId }));
  const controlsRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);

  // A new mark shows at once; the page's fresh data replaces it when it arrives.
  const [shown, setShown] = useState<{ from: CurrentMark; mark: CurrentMark } | null>(null);
  const mark = shown && shown.from === current ? shown.mark : current;
  const save = (verdict: ReadingVerdict, belongsIn: string | null = null, note = "") => {
    setShown({ from: current, mark: verdict === "cleared" ? null : { verdict, belongs_in_claim_id: belongsIn, note: note.trim() } });
    run(() => markReading({ claimId, readingId, verdict, belongsIn, note }), () => {
      setPanel(null);
      suggestions.forget();
    });
  };

  // A tap sets what is not set, and opens the editor of what is; the same tap again closes it.
  const tap = (button: "yes" | "no" | "line") => {
    const action = button === "line" ? "edit" : tapAction(button, mark);
    if (action === "set_belongs") return save("belongs");
    const wanted: Panel = action === "pick" ? "pick" : mark?.verdict === "belongs" ? "note" : "edit-pick";
    setPanel(panel === wanted ? null : wanted);
  };

  // While a panel is open, a tap outside the controls and the line, or Escape, closes it.
  useEffect(() => {
    if (!panel) return;
    const inside = (target: EventTarget | null) => target instanceof Node && [controlsRef, lineRef].some((ref) => ref.current?.contains(target));
    const onClick = (event: MouseEvent) => inside(event.target) || setPanel(null);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPanel(null);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const off = mark !== null && mark.verdict !== "belongs";
  const shared: RowReview = { claimId, readingId, mark, panel, tap, close: () => setPanel(null), save, saving, error, suggestions, controlsRef, lineRef };
  return (
    <RowContext.Provider value={shared}>
      <div className={`reading${off ? " is-off" : ""}`}>{children}</div>
    </RowContext.Provider>
  );
}

/**
 * ✓ and ✕ on one reading, and the panel either opens. ✓ marks it belonging
 * in one tap; ✕ opens the picker to say where it belongs; a set mark opens
 * its editor. Inside a ReviewRow.
 *
 * @returns The two buttons, and the panel when open.
 */
export function ReadingReview() {
  const row = useContext(RowContext);
  if (!row) return null;
  const { mark, panel, tap, close, save, saving, error, suggestions } = row;
  const belongs = mark?.verdict === "belongs";
  const off = mark !== null && !belongs;

  return (
    <span className="review" ref={row.controlsRef}>
      <button type="button" className="mark yes" aria-pressed={belongs} aria-expanded={panel === "note"} disabled={saving} title={belongs ? "Belongs in this claim: tap to write a note, or to clear" : "Belongs in this claim"} onClick={() => tap("yes")}>
        ✓
      </button>
      <button type="button" className="mark no" aria-pressed={off} aria-expanded={panel === "pick" || panel === "edit-pick"} disabled={saving} title={off ? "Does not belong: tap to change where, the note, or to clear" : "Does not belong in this claim"} onPointerEnter={suggestions.preload} onFocus={suggestions.preload} onClick={() => tap("no")}>
        ✕
      </button>
      {panel === "note" && mark && <NoteEditor note={mark.note} saving={saving} onCancel={close} onSave={(note) => save("belongs", null, note)} onClear={() => save("cleared")} />}
      {panel === "pick" && (
        <ClaimPicker suggestions={suggestions} question="Where does it belong?" allowOwn saving={saving} onCancel={close} onSave={(choice, note) => saveChoice(save, choice, note)} />
      )}
      {panel === "edit-pick" && (
        <ClaimPicker suggestions={suggestions} question="Where does it belong?" allowOwn current={mark} saving={saving} onCancel={close} onSave={(choice, note) => saveChoice(save, choice, note)} onClear={() => save("cleared")} />
      )}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}

/**
 * Saves a picker choice as the reading's mark.
 *
 * @param save  The row's save.
 * @param choice  Where it belongs.
 * @param note  The note.
 */
function saveChoice(save: RowReview["save"], choice: Choice, note: string): void {
  const { verdict, belongsIn } = choiceVerdict(choice);
  save(verdict, belongsIn, note);
}

/**
 * The line under a reading's headline: where a ✕ reading belongs and its
 * note, or a ✓ reading's note. Tapping it opens the mark's editor; the claim
 * it names stays a link. Inside a ReviewRow.
 *
 * @returns A quiet line, or nothing when there is nothing to say.
 */
export function MarkLine() {
  const row = useContext(RowContext);
  const line = markLine(row?.mark ?? null);
  if (!row || !line) return null;
  const { where, note } = line;

  // A tap on the line opens the editor; a tap on the claim it names follows the link.
  const open = (target: EventTarget) => (target instanceof Element && target.closest("a")) || row.tap("line");
  return (
    <span className={`mark-note${where ? "" : " on-belongs"}`} ref={row.lineRef} tabIndex={0} title="Change this mark or its note" onClick={(event) => open(event.target)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), row.tap("line"))}>
      {where?.kind === "own" && "its own claim"}
      {where?.kind === "unknown" && "doesn't belong"}
      {where?.kind === "claim" && (
        <>
          belongs in <a href={`/claims/${where.id}`}>#{where.id}</a>
        </>
      )}
      {note && <span className="mark-why"> · {note}</span>}
    </span>
  );
}

/**
 * The ✓ editor: the note on a reading that belongs, and clearing the mark.
 *
 * @param props.note  The note in force.
 * @param props.saving  A save is running.
 * @param props.onCancel  Close without saving.
 * @param props.onSave  Save the note.
 * @param props.onClear  Clear the mark, and the note with it.
 * @returns The panel.
 */
function NoteEditor({ note, saving, onCancel, onSave, onClear }: { note: string; saving: boolean; onCancel: () => void; onSave: (note: string) => void; onClear: () => void }) {
  const [typed, setTyped] = useState(note);
  return (
    <div className="picker note-editor" role="dialog" aria-label="Note on a reading that belongs">
      <div className="picker-title">Belongs in this claim</div>
      <textarea className="picker-note" rows={3} maxLength={1000} placeholder="note (optional)" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
      <div className="picker-row">
        <button type="button" className="primary" disabled={saving || typed.trim() === note.trim()} onClick={() => onSave(typed)}>
          {saving ? "saving…" : "save"}
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        <button type="button" className="clear-mark" disabled={saving} onClick={onClear}>
          {clearLabel(note)}
        </button>
      </div>
    </div>
  );
}

/**
 * The picker: suggested claims, "its own claim" and "not sure" (for a
 * reading), a claim number, and an optional note. Given the mark in force, it
 * starts from that mark's choice and note, and offers to clear it.
 *
 * @param props.suggestions  The suggested claims, perhaps already loaded.
 * @param props.question  The picker's title.
 * @param props.allowOwn  Offer "its own claim" and "not sure" (a reading); a claim link needs a claim.
 * @param props.current  The ✕ mark being edited, if any.
 * @param props.saving  A save is running.
 * @param props.onCancel  Close without saving.
 * @param props.onSave  Save the choice and the note.
 * @param props.onClear  Clear the mark being edited.
 * @returns The panel.
 */
function ClaimPicker(props: { suggestions: ReturnType<typeof usePreloaded>; question: string; allowOwn: boolean; current?: CurrentMark; saving: boolean; onCancel: () => void; onSave: (choice: Choice, note: string) => void; onClear?: () => void }) {
  const { question, allowOwn, current = null, saving, onCancel, onSave, onClear } = props;
  const start = current ? startingChoice(current) : allowOwn ? ({ kind: "unknown" } as Choice) : null;
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(props.suggestions.known);
  const [choice, setChoice] = useState<Choice | null>(start);
  const [typed, setTyped] = useState("");
  const [noting, setNoting] = useState(Boolean(current?.note));
  const [note, setNote] = useState(current?.note ?? "");

  // The suggestions arrive (if the pointer did not already fetch them) while the picker is open; a claim in force that is not among them shows as typed.
  const { preload } = props.suggestions;
  useEffect(() => {
    let open = true;
    preload().then((found) => {
      if (!open) return;
      setSuggestions(found);
      if (start?.kind === "claim" && !found.some((suggestion) => suggestion.id === start.id)) setTyped(start.id);
    });
    return () => {
      open = false;
    };
    // Once per opening: preload is a new function each render but returns the same fetch.
  }, []);
  const picked = (id: string) => choice?.kind === "claim" && choice.id === id && !typed;

  // Editing, save waits for a change.
  const chosen = choice && choiceVerdict(choice);
  const unchanged = current !== null && chosen !== null && !markChanged(current, chosen.verdict, chosen.belongsIn, note);

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
        <textarea className="picker-note" rows={2} maxLength={1000} placeholder="why (optional)" value={note} onChange={(event) => setNote(event.target.value)} autoFocus={!current?.note} />
      ) : (
        <button type="button" className="link-button small" onClick={() => setNoting(true)}>
          add a note
        </button>
      )}
      <div className="picker-row">
        <button type="button" className="primary" disabled={saving || unchanged || !choice || (choice.kind === "claim" && !/^\d+$/.test(choice.id))} onClick={() => choice && onSave(choice, note)}>
          {saving ? "saving…" : "save"}
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        {onClear && current && (
          <button type="button" className="clear-mark" disabled={saving} onClick={onClear}>
            {clearLabel(current.note)}
          </button>
        )}
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
