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

`rulings.json`. Rule 2 (reactions) carries the maintainer's ruling of
2026-11-05 on #289: every person's reaction is its own claim, the fighter's
own defence stays with his claim, fans' reaction is its own claim too. Rule 4
(recurring columns) carries the proposed reading of #383, not yet ruled:
each weekly issue is its own claim. Every split names its rule, so a ruling
flips those calls without a rerun.

## Results (2026-11-05, all 15 weeks, 1,901 grouped readings)

Models: Opus 5.5, Fable 5.1 and Sonnet 5.5 as Claude Code sessions on the
maintainer's plan; no outside spend. Reader prompt r1, judge j4, history h1.

**The judge prompt's wording moved the calls more than the model did.** On
the pilot week (28 Sep, 345 readings, 80 marks), four wordings of rule 5 (a
passing mention) gave each judge between 51 and 132 "its own claim" calls.
j1 keyed rule 5 on the golden `centrality` label, which calls a callout aimed
at the fighter "only mentioned", and so split callout write-ups off their
claims; j4 keeps a claim that is wholly someone else's story grouped (its
relevance is the classifier's question) and treats an article on another
topic from the same sitting as its own claim (the maintainer's mark on
#419). Under j4 the judges were unanimous on 323 of 345 pilot readings.
`versions.mjs` prints the four side by side.

**Readers** (`history-readers.mjs`, `results/history-readers.json`):

- Agreement between the three on the nine answers: kappa 0.86 to 0.99
  (centrality lowest, the yes/no questions highest).
- Against the golden key, the 207 training and validation articles inside
  v0's history (109 test-side articles counted and never scored), all nine
  answers right: Fable 86.5%, Opus 77.8%, Sonnet 74.9%, their majority
  82.1%, classifier v7.7 55.1%. Where all three agree on all nine, they are
  wrong against the key on 39 of 1,377 answers (2.8%).
- The classifier differs from three agreeing readers on act 24.6%,
  centrality 17.3%, fact 15.7%, firmness 15.8%, the yes/no questions 1.5
  to 8.9%; about the same in English and Spanish.
- The Decider re-run on the readers' majority answers gives v0's tier on
  89.0% (87.5–90.3): 30 readings v0 put at tier 1 the readers put lower,
  1 the other way.
- The extractor's kind matches the readers' majority on 77.3%; the main
  slip is someone else's story called a remark about the fighter (128).
- 13.3% of readings are copies of another article (Yahoo Sports 65 of 167),
  2.0% of saved texts are not the article.
- Of the 691 readings with no saved text, 209 look like news of the fighter
  by headline (131 unanimously): Amosov 24 against 47 read, Donchenko 29
  against 106, Topuria 156 against 1,748. Eurosport, Bloody Elbow and
  Sherdog lose the most. Headline-only evidence.

**Judges** (`history-judges.mjs`, `results/history-judges.json`):

- Unanimous on the full call (verdict and the claim named) for 1,619 of
  1,901 readings (85.2%), majority 245, split 37; kappa 0.65 (0.76 on keep
  or change alone).
- Against the maintainer's 110 marks: each judge and the majority 99 to
  100 (90 to 91%); the unanimous calls 98 of 106. Of the ten the majority
  calls differently, nine are the three known questions (#289 two, now ruled
  his way, so the judges follow his ruling against his earlier mark; #383
  three, unruled; #421 four, where all three judges trace the articles to
  the Kolos interview) and one is new (#351, reading 1595). His one
  same-claim link (#424 with #426) all three judges made.
- The pipeline's grouping scored with the judges' calls: over-merge 14.5%
  of readings by the majority (judges 15.6 to 17.5%), over-split 22.1% of
  claims (judges 19.5 to 26.4%). The first run's single judge gave 17.9%
  and 35.5% on its five weeks under the older rules.

**History pass** (`history-pass.mjs`, `results/history-pass.json`): 178
same-claim pairs across weeks for Topuria (51 made by all three), 13 for
Donchenko, 4 for Amosov. Career events named by a majority: Donchenko's
booking and result, Amosov's booking, all at tier 1 in v0 within 7 hours of
the first article; Topuria's three (his injuries, his clearance, a ranking)
never at tier 1, because the starting map sends health and rankings to the
digest.

**Rule gaps**: the judges logged 276 cases the rules did not settle,
grouped into nine questions with candidate rules and a recommendation each
(`data/compare/rule-gaps.md`, local).

## Top-up to 18 Nov (2026-11-18)

**Question.** Can the history be extended past the first export (2026-11-06T01:12Z,
5 Nov 17:12 Pacific) with the same models, prompts (r1, s1, j4, h1) and rulings,
so that every score runs from 31 Jul to now on one method, without splitting
claims at the cut-off?

**How.** The export was taken again at 2026-11-18T17:54Z for the weeks of 2, 9
and 16 Nov. `cut-check.mjs` compares it with the first export by reading id,
not by date: 433 new grouped readings and 125 new unread. No reading is missed
or counted twice. None of the 2,592 earlier ones changed claim or gained text.
Nine came in late with a publish date before the cut. `results/cut-2026-11-18.json`
lists the new ids. The first export's 2 Nov week, the judges' first calls on it
and the first history pass are kept in `cut-2026-11-05/` folders. Only the new
articles were read (23 batches per model); earlier answers were reused
(`make-batches.mjs` now leaves a re-exported week's batches as they are).

The seam is closed the same way every week boundary was closed in the first run:

- the 2 Nov week is judged again whole, old and new articles on one page.
  Each judge's first call on an old article is shown as its earlier call
  (`judge-input.mjs` reads `cut-<date>/`);
- every claim comes with all its readings back to its first, so a claim that
  spans weeks is judged with its old articles;
- the history pass (`run-history.sh`, now headless like the rest) runs again
  over all 17 weeks, so a new claim can be linked to an old one any number of
  weeks back.

`boundary-check.mjs` (`results/boundary-check.json`) counts the seam per judge.
New articles moved into a claim that existed before the cut: 2 to 3. New claims
linked to an older one by the history pass: 7. The second judging of the 2 Nov
week changed 1 to 5 of the 128 first calls. The second history pass kept 80 to
86% of the first one's links (Opus 98 of 114, Fable 93 of 116, Sonnet 110 of
137). That is the history pass's own noise, and a reason to read its links
only where two or three models agree.

**Results over 31 Jul to 18 Nov (17 weeks, 2,334 grouped readings, 816 unread).**

- Judges: unanimous on the full call for 1,983 (85.0%), kappa 0.655 (0.762
  on keep or change alone). Against the maintainer's 110 marks: each judge 99
  to 100, the majority 100; he has made no marks since the first export.
- The pipeline's grouping by the majority: over-merge 15.2% of readings
  (Topuria 14.5%, Donchenko 16.8%, Amosov 27.0%), over-split 23.3% of claims.
- Readers: the classifier differs from three agreeing readers on act 23.9%,
  centrality 17.3%, fact 16.0%, firmness 17.0%. The Decider re-run gives v0's
  tier on 88.4%. 46 tier-1 posts the readers put lower, 4 the other way.
  The extractor's kind matches on 77.3%. 12.9% of readings are copies, 2.4%
  of saved texts are not the article. The golden-key scores are unchanged
  (the golden set ends on 17 Sep).
- Unread: 276 of 816 look like news by headline. Amosov 46 against 111
  read and grouped, Donchenko 29 against 107, Topuria 201 against 2,116.
- Career events by a majority: Amosov's booking against Machado Garry on 7 Nov
  was posted at tier 1 within the hour.
- Rule gaps: 328 logged (52 new); the nine questions in
  `data/compare/rule-gaps.md` were drawn from the first 276.

## Where it stands

- 2026-11-05: the whole history is labelled. The storyboard reads
  `data/marks/three-judges.json` from branch `storyboard-three-judges`
  (`/?agent=disputed`, `/?agent=spot`); confirming a call saves it as the
  maintainer's mark.
- 2026-11-18: topped up to 18 Nov 09:54 Pacific (above); the storyboard file is rebuilt over all 17 weeks.
- Open for the maintainer: #383, the nine rule questions, the Disputed view
  (351 readings not unanimous since the top-up; 282 before), the 40-call spot check.
- Next, once he has ruled: flip the calls whose rule changed (by their rule
  number), rescore, and use the silver labels to tune the classifier and
  the extractor against the golden key.
