# Storyboard: notes on ✓, and editing a review mark in place

**Status:** designed 6 Oct 2026, not built. A one-off tactical change to the
review controls of D35 ([v0 design](2026-10-04-v0-design.md), section 11,
"Reviewing claims"); that section stays the reference for what a review is.

## The problem

Two gaps showed up in the first days of live review.

1. **A reading that belongs cannot carry a note.** ✓ saves in one tap with
   nowhere to write. The case that showed it: reading #1964 in claim #419.
   O'Malley reacts to the idea of Pimblett and Topuria coaching TUF; the rest
   of #419 is Dana White reacting to the same idea. It belongs, on the grounds
   that all of them react to one thing, but it could also be a claim of its
   own within a larger story (the layer above claims, discussed, not
   designed). That remark has nowhere to go.
2. **A ✕ cannot be edited.** To change "its own claim" to "belongs in #419",
   or to fix its note, Anton copies the note, clears the mark, presses ✕
   again, pastes and edits. And one stray tap on any set mark clears it, note
   included.

## The rule

**Tap a mark that is not set to set it; tap a mark that is set, or the line
under the headline, to change it.** A mark with a note is cleared only from
inside the editor, so a note is never lost to one tap. A ✓ with no note has
nothing to lose, so tapping it clears it at once, as today.

| Anton taps | What happens |
|---|---|
| ✓, not set | Saved as "belongs" at once; nothing opens. The usual one-tap review, unchanged. A quiet **add note** link appears beside it, and stays until Anton marks another reading or leaves the page. |
| ✓, set, no note | Cleared at once: nothing is lost. |
| ✕, not set | The picker, as today: where it belongs, and an optional note. |
| ✓, set, with a note | A small editor under the buttons: the note box with the note in force, **save**, **cancel**, and **clear mark and note** apart on the right in the warning colour. |
| **add note**, after setting ✓ | The same editor, with an empty note box. |
| ✕, set | The picker, filled in with the choice in force (its own claim, a claim number, or not sure) and the note; **save**, **cancel**, **clear mark**. |
| The line under the headline | The same editor as tapping the set mark. The claim number in "belongs in #419" stays a link to that claim; the rest of the line opens the editor. |
| ✓ while ✕ is set | Switched to "belongs" at once. The ✕ note is not carried over: it explained why the reading did not belong. |
| ✕ while ✓ is set | The picker, to say where it belongs instead. |
| Outside the editor, or cancel | Closed; nothing changed. |

## Details

- **Clearing a mark with a note takes two deliberate taps**: open the
  editor, then **clear mark and note**, which names what would go. Every ✕
  opens its picker when tapped, since a ✕ always holds a choice (where it
  belongs) even without a note; its button reads **clear mark** or **clear
  mark and note**.
- **A note on an older bare ✓**: tap it (cleared, nothing lost), tap ✓
  again, then **add note**. Three taps for a rare case, in exchange for
  keeping the everyday ✓ free of dialogs. The **add note** link is not on a
  timer: it goes when Anton moves on to another reading.
- **The editor is the confirmation.** An armed button (the first tap turns ✓
  into "clear?", a second within a few seconds clears) was considered and set
  aside: the editor already asks for a second tap where something would be
  lost, and a state that disarms itself on a timer is easy to miss on a
  phone.
- **Notes show under the headline on both marks**, in the muted line ✕ uses
  today: "belongs in #419 · *note*" for ✕, "· *note*" for ✓. A ✓ with no note
  shows no line; its way in is **add note** right after setting it. On a wide screen the
  line takes a dotted underline on hover, as the decision's answers do. A
  ✓ reading is not dimmed; only ✕ readings are.
- **No dot or icon on the buttons.** A dot on a mark with a note was
  considered; the line under the headline already says a note exists, more
  plainly.
- **Notes stay inside the claim.** The claims list does not count them.

## Panels

- **The ✓ editor fetches nothing**, so it opens complete and never changes
  shape.
- **The ✕ picker is the one built on 6 Oct** (commit 1cc0929): suggestions in
  a fixed-height box with placeholder rows, loading when the pointer reaches
  the button. That preloading extends to a set ✕, which today skips it.
  Opened on a set ✕, the picker shows the full suggestion list with the
  choice in force selected, rather than a short summary with "change…": one
  panel to learn, and moving a reading is the common reason to open it.
- Both panels share the picker's frame (floating card, shadow, position), so
  they read as one family.

## Storage

**Nothing new.** `review_readings.note` already takes a note on any verdict,
and `markReading` already accepts one. Save adds a row with the verdict and
note as they now stand; clear adds a `cleared` row; the newest row is in
force. An edit is a newer row, so every earlier version of a note stays in
the history.

## What changes in the code

- `components/ReviewControls.tsx`: a set mark with a note, or any set ✕,
  opens the editor instead of clearing; a bare ✓ still clears in one tap;
  **add note** after setting ✓; the ✓ editor; the ✕ picker accepts the mark in force as its
  starting choice and note, and gains **clear mark**.
- `components/ClaimReadings.tsx`: the note line shows for ✓ notes too, and
  opens the editor.
- The v0 design's use-case table (section 11, case 8, "Press it again") then
  reads "tap it (with a note, or a ✕: then clear mark)".

## Tests

- The pure parts get unit tests: which line a mark shows, what a tap on a
  set mark does (clear at once, or open the editor), and the label of the
  clear button with and without a note.
- The flows are checked in the browser on a throwaway Neon branch, never on
  live data: set ✓, add a note, edit it, clear it; set ✕ as its own claim,
  move it to a claim, edit the note, clear it; switch ✓ to ✕ and back; tap
  a bare ✓ and see it clear with no dialog. After
  each, the newest row in `review_readings` matches what the page shows.

## Left for later

- **A ready-made choice** such as "same story, could be its own claim" beside
  the free text. The notes are read first, when stories are designed;
  categories fixed before then would guess at them.

## Building it

After the other session has finished with `ReviewControls.tsx`, in its own
worktree, starting from the newest commit.
