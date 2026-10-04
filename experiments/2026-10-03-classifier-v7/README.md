# Classifier v7 — the 27 labelling rules brought into the questions

**Status:** two rounds run on the tune and check sides, 2026-10-03,
`jev-1.13.0`, 0 errors, $0.11 in all. Round 2 overfitted (below). Tuning
continues; the test side has not been sent.

v6 (../2026-09-27-axes-v6) predates the labelling rules the golden key was
decided under ([golden/rules.md](../../golden/rules.md)). v7 rewrites the
nine questions to carry them, and is scored against the frozen key
([golden/labels.json](../../golden/labels.json)).

## How it is measured

- **Tune (155 articles):** errors are read, wording is changed.
- **Check (40):** scored after each round, errors never read. If tune rises
  and check does not, the wording is fitting the tune articles only. Check
  has no next-fight or status-update article, so it cannot judge those.
- **Test (105):** scored once, at the end. `run.py` refuses to send it
  without `--final`.
- An answer is **right** when it equals the key or a value accepted in
  [golden/coin-flips.json](../../golden/coin-flips.json); **near** when one
  step away on an ordered scale (how central, how firm); **far** otherwise.
- The classifier answers each question alone, so the ties the rules require
  (no fact means firmness none and no news question yes; a result, next
  fight or health fact answers its own yes/no question) are applied in code,
  in `score.py`'s `compose()`.

## Files

| File | What it is |
|---|---|
| `classifier-v7/questions.json` | the questions as they stand |
| `classifier-v7/questions-<round>.json` | the questions as sent in a round |
| `run.py` | sends a few articles (`--ids`) or one side (`--side`) |
| `score.py` | scores a round, or v6, against the key; `--selfcheck` checks its rules |

Three helper yes/no questions (`h_new_fact`, `h_others_story`, `h_callout`)
ride along in the same call. They are not scored; they are there so that
combining answers in code can be tried on stored answers without a new run.

## Rounds

Right answers, tune / check. "All nine" is articles with every answer right.

| | v6 (same scoring) | r1 |
|---|---|---|
| how central | 88% / 85% | 85% / 80% |
| whose words | 81% / 82% | 88% / 85% |
| what the source does | 85% / 88% | 84% / 72% |
| what new fact | 68% / 78% | 85% / 82% |
| how firm | 72% / 75% | 86% / 80% |
| reports his result | 94% / 95% | 99% / 100% |
| reports his next fight | 70% / 75% | 93% / 95% |
| reports his health | 86% / 92% | 88% / 92% |
| he speaks | 98% / 98% | 99% / 100% |
| **all nine** | **58 / 15** | **72 / 17** |

**r1** is v6 with the rules written in: "status update" added, next fight
narrowed to a specific fight, result only for an account of the fight,
"other fighter's side" with camps and former fighters, booked-or-fought for
the opponent's side, callouts in "how central", and "nothing regarding him"
as a described option in place of a bare "none of these".

**A tie added after r1, in code:** when the fact is a result, the source is
"no one", the act "reports an event" and the firmness "official or done"
(28 of 28 result articles in the training key). With it r1 scores **80 / 18**
articles with all nine right. The table above is r1 before that tie.

**r2** changed wording only, from reading r1's training-set misses: a
reported rumour or talks named as next-fight news in the fact question, a
preview or pick ruled out of "fight week event", a letter to his family
ruled out of "status update", the main-subject level widened to "another
fighter gives a view of him", and three act boundaries. Result: **92 / 15**.
Training rose by 12 articles and validation fell by 3; on validation the
fact fell from 33 to 30 right and the next-fight question from 38 to 33,
all of it "no fact" articles now called next fight. That is overfitting:
the rumour sentence fixed seven training articles from one story and made
the question too eager elsewhere. r2 is kept as a record, not as the
standing version.

**Tried on stored r1 answers, no new run:** letting a confident yes/no
answer overrule a "no fact" (training 84, validation 16: also overfits);
making the three news questions follow the fact answer (training +11,
validation +0, health 37 to 39 on validation).

**r3** is r1 with one change: the "no when" text of the health question.
Its third case was a fragment ("only when he will be ready to fight, ...")
that can be read as a condition, and its second covered only a writer's
*guess*, not a writer's flat summary ("recovery has gone well"). Both were
rewritten as full statements. The classifier's own health answer, before
any tie: wrong yes on the training set 17 to 9 (in three claims: 9 to 5, 6
to 3, 2 to 1), on the validation set 4 to 3, and no true yes lost on
either. Articles with all nine right: **86 / 17**.

**The noise floor, measured by the same two runs:** the other eight
questions were sent unchanged, and 19 of 1,240 of their answers on the
training set (1.5%) and 6 of 320 on the validation set (1.9%) still came
back different. So one article up or down on the validation set (18 to 17
here) is noise, not a finding.

## What the reading added (2026-10-03, before the overnight runs)

Read in full: the vendor's pages on state, structure ("Advanced"),
confidence, the three patterns (fan-out, composite scoring, confidence
routing), the cookbooks on self-consistency (nouls and choices), parallel
questions, hierarchical classification, classification using confidence and
autoresearch, and the jev-1.13 jaggedness page again. Searched the web for
practice with this model and for closed-set classification with language
models in general. Each idea, where it came from, and what became of it:

| Idea | Source | Became |
|---|---|---|
| Several questions in one call give the same answers as one call each: each is judged alone. | vendor, parallel questions cookbook (5 repeats, no batching effect) | Confirms that variants side by side in one call are a fair comparison. Used for every experiment below. |
| Identical calls mostly return identical answers; where they differ, the noise belongs to the question, not the call. A few borderline answers flip across a 0.5 line. | vendor, self-consistency cookbooks (15 repeats; noul spread 0.01, 2 of 8 choices flipped) | Lowers the expected value of avenue 5 (repeats and a vote): voting can only fix the few answers that sit on a line. Tried once, cheaply. |
| A choice's own confidence separates easy answers from hard ones; when unsure, report the level above. | vendor, classification using confidence | Not a label fix (the key needs one value), but a way to find the articles the wording is unclear on. Used to pick smoke-test articles. |
| Walk a taxonomy one level at a time, showing each option's sub-options. | vendor, Advanced and hierarchical classification | Became an experiment for the fact question: first "is there a new fact", then which kind. |
| Ask one condition per yes/no question; combine in code. "Where interpretation is unavoidable, split it into two literal questions." | vendor, noul page and jaggedness #1 | Avenue 2 (decomposition), with the fact question asked as one yes/no per kind. |
| Order of options moves answers; the model leans to the first. In general research, the cure is to average over orders, or to ask about each option separately. | vendor jaggedness #8; arXiv 2406.03009, 2603.21016 | Avenue 4 (option order), and a second reason for one yes/no per kind: a yes/no has no order. |
| Large state with unrelated detail costs accuracy. | vendor jaggedness #5, state page | Avenue 3 (what the classifier is shown). |
| Instructions as an object: the question in one field, a `focus` line in another. | vendor, Advanced | Part of avenue 8. |
| Refining label definitions from misclassified examples works, but the gains measured on the same examples overstate the real gain. | arXiv 2604.27335 (iterative definition refinement); general | The reason every change here is judged on the validation set and by leave-claims-out. |
| One example per class helps; more examples help less and less. Asking the model to explain itself does not help. | Nyckel benchmark blog | Supports keeping one or two invented examples per option, not long lists. |
| "Agents aren't great at writing questions, so expect to edit collaboratively." | vendor, agent skill page | A warning about this session's own wording: logged as a bias to check. |

Nothing read changed the limits in STRATEGY.md.

## Overnight log (2026-10-03 to 04)

Each experiment: the hypothesis written before the run, a smoke test on
selected training articles, the variants side by side with the standing
wording as control, then the decision by the rule in STRATEGY.md. Variant
files are in `variants/`; `variants.py` sends and scores them. "Question" is
the question under test right; "all nine" is articles with every answer
right. Counts are articles, with the number of claims they fall in.

**A tool note first.** `variants.py` puts each variant's answer into the
round 3 answers and applies the ties, so a variant is judged by what it
does to whole articles. Identical wordings sent in the same call do differ
a little (the `control_copy` variant), so duplicates in one call measure
noise without a second round.

### E1. The fact question, read literally (rejected)

*Hypothesis.* Three places where a literal reader would go wrong: "no fact
if it is only talk" collides with "in talks" (negotiations); health and
status update list who may state them (him, his team, the promotion, a
named report) as if no one else could, so a friend's health update falls
outside; and the definition "a fact is ... stated as fact" excludes the
rumours that next fight includes (the vendor's "contradictory instructions
and criteria"). Variants: `talk`, `named`, `rumour`, and two combinations.
Failure: validation "no fact" articles turning into next fight, as in
round 2.

*Smoke test* (19 training articles: 10 targets, 9 right today and at
risk): `talk` moved nothing; `rumour` fixed 5 of the 6 next-fight targets
and broke none of the at-risk articles.

*Two full runs* (fact right on training / validation, control 130 / 33-35):

| variant | run 1 | run 2 |
|---|---|---|
| talk | 133 / 33 (+3 in 3 claims) | 129 / 35 (+1, −2) |
| rumour | 138 / 34 (+9 in 5 claims, −1) | 133 / 34 (+7 in 3 claims, −4 in 4) |
| rumour, reworded | — | 131 / 34 |
| talk + named + rumour | 135 / 30 | — |

*Decision: rejected.* `talk` did not repeat. `rumour` does fix the
rumoured-fight articles on the fact answer in both runs, but its gains on
whole articles did not repeat (+4/−1, then +1/−3), the reworded version
lost most of the gain, and nearly all of the gain sits in the two claims
it was designed on (claim-097, claim-099), which the leave-claims-out rule
does not accept. The articles of claim-097 also miss on "what the source
does", so fixing the fact alone does not make them right. Combining all
three cost the validation set 3 to 5 articles: the same direction as
round 2.

*Learned.* The same rumour wording, sent twice, answered differently on 7
of 155 training articles; the standing wording on 2. A wording that puts
many articles near the line is noisier. From here on, every acceptance
needs two runs that agree. Averaging three runs of the standing fact
answer changed nothing (130 right each way), so repeats and a vote do not
help the standing wording: avenue 5 dropped after this test.

### E2. How central: another fighter talking about him (accepted)

*Hypothesis.* The main-subject level lists who may talk about him as the
article's topic ("a coach, an official or a pundit") and leaves out other
fighters, so when Makhachev or Gaethje talks about him the literal reading
lands one level down. That is the largest single blocker: on the training
set, 15 articles in 8 claims have "how central" as their only wrong
answer, 14 of the misses one level too low. Variants: `anyone` (adds
"another fighter" to that list), `shares` (rewords the one-of-several
level so it means other fighters' news, not another fighter speaking),
both, and round 2's wording. Failure: callout articles (only mentioned by
rule) or previews (one of several) moving up.

*Smoke test* (21 articles): `anyone` fixed 5 of 11 targets; callouts and
previews unchanged.

*Two full runs* (how central right on training / validation):

| variant | run 1 | run 2 |
|---|---|---|
| control | 132 / 30 | 132 / 29 |
| anyone | 140 / 32 (+8 in 3 claims, −0; validation +2 in 2) | 138 / 32 (+7 in 3, −1; validation +3 in 3) |
| shares | 132 / 31 | — |
| both | 139 / 32 | 138 / 32 |

*Decision: accepted* (`anyone`). Both runs agree. All nine right rises by 6
then 5 on training and 2 then 3 on validation. Leave-claims-out: it was
designed on the claims where another fighter talks about him (claim-014,
-033, -112, -008); outside them it gained #803 (claim-097, a commentator)
and 2 to 3 validation articles in 2 to 3 claims, which no design looked at.
`shares` did nothing alone, so it was not taken. Claim-033 (Tsarukyan
naming his next opponent) did not move.
