"use client";
// Anton's note on a claim as a whole: a quiet line with the note, or "+ note"
// when there is none; a tap opens a small editor. Each save adds one row to
// review_claim_notes (app/review-actions.ts); saving it empty clears it.

import { useRef, useState } from "react";
import { noteClaim } from "../app/review-actions.ts";
import { useCloseOnOutside, useSave } from "./ReviewControls.tsx";

/** The longest note, as the server allows it. */
const NOTE_MAX = 1000;

/**
 * The note control.
 *
 * @param props.claimId  The claim.
 * @param props.note  The note in force; "" when none.
 * @param props.written  When it was written or last changed, as the page shows times; "" when none.
 * @returns The line, and the editor when open.
 */
export function ClaimNote({ claimId, note, written }: { claimId: string; note: string; written: string }) {
  const { run, saving, error } = useSave();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(note);
  const boxRef = useRef<HTMLSpanElement>(null);
  const save = (text: string) => run(() => noteClaim({ claimId, note: text }), () => setOpen(false));

  // Opening starts from the note in force; tapping the line again closes it.
  const toggle = () => {
    setTyped(note);
    setOpen(!open);
  };

  // While open, a tap outside the control, or Escape, closes it.
  useCloseOnOutside(open, boxRef, () => setOpen(false));

  return (
    <span className="review claim-note" ref={boxRef}>
      <button type="button" className={`link-button claim-note-line${note ? " has-note" : ""}`} aria-expanded={open} title={note ? "Change or clear this note" : "Write a note on this claim"} onClick={toggle}>
        {note ? (
          <>
            ✎ {note} <span className="claim-note-date">· {written}</span>
          </>
        ) : (
          "+ note"
        )}
      </button>
      {open && (
        <div className="picker note-editor" role="dialog" aria-label="Note on this claim">
          <div className="picker-title">Note on this claim</div>
          <textarea className="picker-note" rows={4} maxLength={NOTE_MAX} placeholder="What is this story, in your words? Anything worth remembering about it?" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          <div className="picker-row">
            <button type="button" className="primary" disabled={saving || typed.trim() === note.trim()} onClick={() => save(typed)}>
              {saving ? "saving…" : "save"}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              cancel
            </button>
            {note && (
              <button type="button" className="clear-mark" disabled={saving} onClick={() => save("")}>
                clear note
              </button>
            )}
          </div>
        </div>
      )}
      {error && <span className="tag bad">{error}</span>}
    </span>
  );
}
