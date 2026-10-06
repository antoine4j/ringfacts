# Storyboard: reviewing the classifier's answers behind a tier

**Status:** idea, parked 6 Oct 2026. Options laid out, nothing decided,
nothing built. Builds on the review controls of D35
([v0 design](2026-10-04-v0-design.md), section 11, "Reviewing claims").

## The problem

Anton can mark whether a reading belongs in its claim, but not whether its
tier is right. The case that showed it: reading #944 in claim #209,
Sport.ua's "What next for Donchenko? Five options for the Ukrainian". It is
a column weighing possible next opponents, yet it was posted (tier 1).

## How a tier is made

The tier is not a judgement of its own; the Decider looks it up from the
classifier's answers (`decideTier` in `v0/pipeline/settings/tiers.ts`):

1. **The gate.** If "how central" says he is only mentioned or absent, the
   reading is dropped (tier 3).
2. **The cell.** Otherwise "what new fact" × "how firm" names one cell of
   the settings map, and the cell's tier is the tier.

#944 was answered fact = `result`, firmness = `official_or_done`, so it
landed in "result · official_or_done", which posts. A plausible reading is
"next fight · wish" or no new fact: the answers were wrong, not the map.

So a disagreement with a tier has one of two causes, and only the answers
tell them apart:

1. **The classifier answered wrong.** Correct the answer, and the map gives
   the right tier.
2. **The answers are right, the map is wrong.** The cell should hold another
   tier; the settings page already changes that.

A bare "should be Digest" cannot tell the two apart. Corrected answers can.

## What the corrections are for

- Telling model errors from map errors, case by case.
- Counting how often each question is wrong on live articles ("how often is
  *fact* wrong?").
- Later, new labelled test articles beyond the golden set's 300.

## Points to settle

- **Anton's time.** Nine answers per reading. Correct only what is wrong;
  an untouched answer counts as **not checked**, never as confirmed.
- **The labelling rules.** The golden set's answers follow 27 written rules
  ([golden/rules.md](../../../golden/rules.md)); a quick correction on the
  storyboard will not always. These are their own kind of label
  ("storyboard correction"), never folded into the golden set without a
  check.
- **Version.** Answers belong to a classifier version (v7.7 today). A
  correction records which classification it corrects, so it keeps its
  meaning when a later version re-reads the article.

## Storage

The v0 database can hold it only loosely today. `feedback` has a reading,
a free-text `field`, a free-text `should_be` and a note, and the storyboard
may write to it (0 rows on 6 Oct). The v0 design already set it aside for
verdicts (D35): no list of allowed values, and no link to the
classification that was corrected.

Proposed: a `review_answers` table shaped like `review_readings`. One row
per corrected answer: the reading, the classification it corrects, the
question, Anton's answer (or `cleared`), an optional note, author and time.
Append-only, the newest row in force, `v0_editor` may insert. A schema
change on the live v0 database and one grant; nothing existing changes.

## Where it lives: options

**A. A panel from the decision column (recommended).** Clicking the tier
or its answers opens a floating card in the family of the ✕ picker. On top,
the three answers the tier reads (how central, what new fact, how firm),
each a row of choices with the classifier's choice marked; tap another to
correct it. The other six under "6 more". The panel shows **the tier these
answers would give**, worked out by `decideTier` itself, for example
"Post → Digest". If the answers are corrected and the tier still seems
wrong, the fault is the map, and the panel links to that cell on the
settings page. Once saved, the decision column shows a quiet
"Post → Digest". Cost: the answers' link to the settings page moves inside
the panel.

**B. The reading's own page** (`/readings/[id]`), which already lists all
nine answers with the generic feedback form under them: replace that form
with the same choices. Cheaper, and room for the article, but it leaves the
claim card; wrong for reviewing many readings in a row.

**C. Expanding the row inline.** Rejected: the busier card it was meant to
avoid.

## Open decisions

1. Option A or B.
2. The new `review_answers` table, or `feedback` as it stands.

## A side finding

#944's saved text is exactly 10,000 characters, so it was likely cut.
Where, and whether the cut helped produce the `result` answer, is not
checked yet.
