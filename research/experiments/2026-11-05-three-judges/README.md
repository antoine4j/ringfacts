# Three judges label v0's whole history (2026-11-05)

**Question.** If three strong models each read every article v0 ever grouped
and, apart from one another, make the maintainer's grouping calls and the
golden set's nine labels, how often do they agree, how often is their
agreement right against his marks and the golden key, and where does the
pipeline differ from three agreeing models? The aim is a labelled history
("silver" labels: the models', not his) in which his time goes only to the
disagreements and a spot check, so that grouping, the classifier, the
extractor and the fetch can all be tuned on 1,866 articles instead of 300.

**Why.** The first agent run ([2026-10-30](../2026-10-30-agent-grouping/README.md))
matched 98 of his 108 marks with one judge, so there was no second opinion to
point him at doubtful calls. His marks are 107 "belongs" out of 111, so they
barely test splits. And the Launch Map's switch (theme 3) needs to know how
much news is lost to articles the fetch could not read, above all for Amosov
and Donchenko (G1).

## How it runs

Everything reads v0's live tables read-only and writes only to `data/`
(git-ignored: it holds article text; mirrored privately) and `results/`
(public: counts and ids only, never a sentence from an article). The model
calls are Claude Code agents on the maintainer's plan: no outside spend.

Three chains, one per model (`opus`, `fable`, `sonnet`), each in its own
folder under `data/`, sharing nothing: a model's judge sees only its own
readers.

1. **Export** (`export.mjs`): every week from 2026-07-27, as
   `data/history/week-<monday>.json` (claims, readings with the full saved
   text up to 10,000 characters, the week's *unread* readings with no saved
   text, the maintainer's marks) and `pipeline-<monday>.json` (what the
   classifier, extractor, grouping and Decider said), kept apart so a batch
   never carries them.
2. **Batches** (`make-batches.mjs <model> <monday>`): 20 readings each, in
   claim order, with headline, outlet and text only: no claim label, no
   extract, no marks. A reading read for an earlier week is reused. The
   unread go to one `screen-<monday>.in.json`.
3. **Read** (one agent per batch, [reader-prompt.md](reader-prompt.md) with
   the golden set's labelling guide inlined by `render-prompts.mjs`): per
   article, the occasion, speaker and date (for grouping), the nine answers
   with `unsure` and a note, the extractor's kind and one-sentence claim,
   where the news came from (`first_source`), the career event if any, the
   language, and a `body_problem` flag when the saved text is not the
   article. `check-batches.mjs` refuses a batch with a value off the list.
4. **Screen** (one agent per week, [screen-prompt.md](screen-prompt.md)):
   the unread readings judged from the headline alone: about him, looks
   like news, what kind. Headline-only evidence, reported as such.
5. **Judge** (`judge-input.mjs`, then one agent per week on the same model,
   [judge-prompt.md](judge-prompt.md)): the week's claims with its readers'
   lines; one call per reading (belongs, does not belong and where, own
   claim), the same-claim links, a `core` line per claim, the rule behind
   every split (so a changed ruling flips calls without a rerun), and
   `rule_gaps`: cases the rules did not settle, for the maintainer.
6. **History pass** (per fighter per model): one line per claim from the
   weekly cores; same-claim links across weeks, story threads above
   claims, and the career-event ledger.
7. **Compare** (`readers-compare.mjs`, `judges-compare.mjs`): agreement
   between the models (unanimous / majority / split, Fleiss' kappa),
   each model and the majority against the maintainer's marks and the
   golden key (training and validation only; the test side is counted and
   never scored), the pipeline against three agreeing models per station,
   the Decider re-run on the readers' answers, the text problems by fetch
   method and outlet, and the screen by fighter and outlet.
8. **Marks** (`build-marks.mjs`): one file for the storyboard with all
   three judges' calls per reading and the agreement on each.

## Rulings carried in the judge prompt

Rule 2 (reactions) and rule 4 (recurring columns) wait for the maintainer's
ruling on the open questions from the first run (#289, #383). Until he
rules, the prompt carries the proposed reading, marked as such.

## Where it stands

- 2026-11-05: export done (15 weeks, 3,487 readings in 576 claims, 691
  unread). Pilot week 2026-09-28 readers running on all three models.
