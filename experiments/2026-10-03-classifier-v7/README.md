# Classifier v7 — the 27 labelling rules brought into the questions

**Status:** standing version is v7.7: v7.6, the result of an unattended
night of ten experiments (2026-10-03 to 04, `jev-1.13.0`), plus a narrower
callout sentence in "how central" (E13, 2026-10-04). v7.7 gets all nine
answers right on 96 of 155 training and 20 of 40 validation articles.
**Scored once on the 105 test articles (2026-10-05): all nine right on 40
(38%); pass marks G1 7 of 9 stories (fails), G4 0 (passes), G2 5 of 90,
5.6% (fails by under one article).** Details in item 5 below and in
docs/decisions.md#classifier-pass-marks.

## Morning report

Written after the night (v7.6) and updated on 2026-10-04 for v7.7, which
adds one accepted change from the day after (item 5 below).

**Where it stands.** Right answers per question, and articles with all
nine answers right, training set / validation set:

| | v6 | v7.3 (before the night) | v7.6 (after the night) | v7.6, sent again | v7.7 (now) |
|---|---|---|---|---|---|
| how central | 136 / 34 | 133 / 31 | 139 / 32 | 138 / 32 | 139 / 32 |
| whose words | 130 / 32 | 142 / 35 | 145 / 36 | 144 / 36 | 145 / 36 |
| what the source does | 130 / 34 | 128 / 30 | 129 / 32 | 129 / 31 | 129 / 32 |
| what new fact | 105 / 31 | 130 / 33 | 134 / 34 | 133 / 33 | 135 / 33 |
| how firm | 113 / 30 | 133 / 32 | 136 / 35 | 134 / 34 | 136 / 34 |
| reports his result | 146 / 38 | 154 / 40 | 154 / 40 | 154 / 40 | 154 / 40 |
| reports his next fight | 109 / 30 | 144 / 38 | 146 / 39 | 145 / 39 | 146 / 39 |
| reports his health | 134 / 37 | 144 / 38 | 144 / 38 | 145 / 38 | 145 / 38 |
| he speaks | 152 / 39 | 153 / 40 | 154 / 40 | 153 / 40 | 155 / 40 |
| **all nine right** | **63 / 16** | **87 / 17** | **94 / 20** | **94 / 19** | **96 / 20** |

**v7.7 gets all nine answers right on 96 of 155 training articles (62%)
and 20 of 40 validation articles (50%)**, up from 87 and 17 before the
night and 63 and 16 for v6. Every single answer right: 92% of training
answers and 90% of validation answers. The gain is modest and it is real:
v7.6 held when sent twice, and v7.7's one change held in two side-by-side
runs. The step from v7.6 to v7.7 (2 training articles in the full run) is
within run-to-run noise; the side-by-side runs are the better measure of
it. The validation set is small: 20 of 40 has a 95% interval of about 35%
to 65%. The test set will say.

**What was accepted, and why** (each passed the rule in STRATEGY.md in two
runs):

1. **E2, "how central":** the main-subject level now names "another
   fighter" among those who may talk about him as the article's topic. The
   old list left fighters out, so Makhachev or Gaethje talking about him
   read one level down. +6 training, +2 to 3 validation.
2. **E4, examples:** 18 examples that paraphrased golden articles were
   replaced with invented ones. Several paraphrased **test-set** articles
   (the rules cite them), which would have flattered the final score. No
   loss, once "how firm" stated its rule instead of leaning on the Dana
   White example.
3. **E8, shorter questions:** "what the source does" and "how firm" are
   now half as long (definitions only). Same on training, 1 to 2 better
   on validation. The other seven questions need their extra text.
4. **E10, previews:** the "what new fact" question had drifted from the rule: it
   listed "how to watch" under "fight week event". Aligned with the rule,
   and a preview or pick is now named as no fact. +5 training, +1
   validation.
5. **E13, "how central", the day after (v7.7):** the sentence "an article
   built on another fighter's wish to fight him is that other fighter's
   story" also caught articles where another fighter talks about his
   future (Makhachev on his comeback). Narrowed to "a callout alone, where
   another fighter names him as the opponent he wants". +4 and +5
   training, validation within 1, the callouts the rule cites kept. E12
   showed the opening "judge by what is new about him" is what holds
   those callouts, so it stays.

**What was tried and rejected:** a sharper definition of a fact that
includes reported rumours (E1: works on the rumoured-fight claims only,
and they also need a second fix); option order (E3: moves answers but no
order is better); two fixes to "what the source does" that work only on the
claims they were built on (E5, held for you); the "what new fact" question as one
yes/no per kind (E6: +12 on training, nothing on validation); cleaning or
cutting the article text (E7: no difference, and cutting hurts); a fact
question written from scratch (E9: worse on validation); a wording for
"absent" against "only mentioned" (E11: moved nothing); and, on stored
answers at no cost, cut-offs and rounding for the two scales, repeats with
a vote, and a breakdown by language (no effect anywhere).

**What was learned about the model:**

- **Read literally, as the vendor says.** Both accepted wording fixes
  (E2, E10) were places where the question's text said something narrower
  or different from what was meant. A list of examples is read as the
  whole list, and a rule sentence as widely as its words allow (E13).
- **An example can carry a whole claim.** Without the paraphrase of
  claim-113, nine of its ten articles changed answer. Training scores can
  measure memory of the prompt.
- **Asked one at a time, kinds of fact are read generously**: they catch
  news given as talk, and also over-call it. Every change that made the
  fact question more willing to see news (v7.2, E1, E6, E9) gained on
  training and lost on validation.
- **The noise is larger for unsettled wording.** The standing questions
  change 1.5 to 2% of answers between identical calls; a wording that puts
  many articles near the line changed 7 of 155. Every decision used two
  runs.
- **Option order matters about three times as much as noise, but no order
  was better.** Averaging over orders did not help either.

**Money:** $1.30 measured from stored token counts tonight (30.8 million
input tokens), plus about $0.05 of smoke tests that were not stored (an
estimate). With the $0.18 before, about $1.53 in all for v7. The $2.50 line
was not reached; the session stopped because the remaining misses are one
or two articles per claim, and fixing those is fitting single occasions.
The day after, E12, E13 and the v7.7 run cost $0.15 more, measured from
token counts: about $1.68 in all for v7.

## For Anton

Each item: what it is, the case for and against, options, and my
recommendation. None of these were decided overnight.

**1. Two fixes that work but only on the claims they were built on (E5).**
"A prediction is about a booked fight" moves a rival camp's boast ("Usman
would make him quit", claim-003) from "predicts his fight" to "calls him
out". "A report of what is planned for him is news, not steering" fixes
Dana White's "top two potential opponents" and the rumoured rematch.
*For:* both agree with the rules and with the key's own usage (every
training prediction is about a booked fight); both lost nothing in two
runs. *Against:* the validation set did not move, so nothing outside the
design shows them working. *Options:* (a) adopt both now; (b) keep them
out and test them on a new labelled slice; (c) adopt only "booked", which
restates the key's usage. *Recommendation: (c)*, and judge "plans" with
the next slice.

**2. Whether the three news questions stay independent.** In v7.6, as the
model gives them, "reports his next fight" is right on 150 training articles and 35
validation; after the code ties (no fact makes every news question no), 146 and 39.
Training prefers the raw answers, validation prefers the ties. Of 23
training disagreements between a news question and the "what new fact" answer, the news question is
right in 11 (4 claims), "what new fact" in 10 (6 claims), both wrong in 2.
*Options:* (a) keep the ties for the labels and log every disagreement for
review, as now; (b) let a confident news question stand against "no fact"; (c) drop
the three news questions. *Recommendation: (a)*: the ties win on the validation set, and
the disagreements are a cheap list of articles worth a second look.

**3. Text cleaning (E7).** Cleaning the saved text made no difference;
cutting it short hurt. One thing the wording cannot fix: on 4 training and
2 validation articles the key says he is absent from the article, while
his name sits in an inline "LATEST NEWS:" headline or a digest of other
headlines inside the saved text. *Options:* (a) nothing now; (b) have the
body extractor drop inline headline blocks; (c) treat those labels as
"only mentioned". *Recommendation: (a)* for now, and note it for the
body-extraction station.

**4. Labels where the classifier's reading looks defensible.** Not
changed, for you to look at if you wish:
- **#746** (claim-095), "Daniil Donchenko Octagon Interview", key fact
  "result". By the rule "result only for an account of the fight itself",
  a post-fight interview is not a result, unless the saved page also
  carries the fight report. The yes/no kind questions said no; the choice
  said result at 0.55.
- **#655** (claim-066), key "absent", but the headline names him; the body
  does not. Is a headline-only mention "absent" or "only mentioned"?
- **#510** (claim-058), a preview giving "start time, full card and how to
  watch", key no fact. Now right, but it sits on the line between the
  preview rule and the fight-week rule.

**5. The test set.** Pass marks adopted 2026-10-04 (docs/decisions.md#classifier-pass-marks): every career-event story (result, next fight or health) recognised, zero rumours called official, false alarms at most 5%. v7.7: no rumour called official on either set; false alarms 4.5% on training and 5.3% on validation; every training career-event story recognised except claim-127, a past infection that is under review with health, and 1 of 2 on validation. v7.7 was scored once on the 105
test articles on 2026-10-05 (`ROUND=r7 python3 run.py --side test --yes --final`, then
`python3 score.py --round r7 --final`; $0.026, 0 errors):

| test side, 105 articles | right | of which one step off |
|---|---|---|
| how central | 82 (78%) | 23 near, 0 far |
| whose words | 85 (81%) | |
| what the source does | 84 (80%) | |
| what new fact | 87 (83%) | |
| how firm | 83 (79%) | 8 near, 14 far |
| reports his result | 103 (98%) | |
| reports his next fight | 98 (93%) | |
| reports his health | 99 (94%) | |
| he speaks | 100 (95%) | |
| **all nine right** | **40 (38%, 95% interval 29% to 48%)** | |

Pass marks on the test side: G1 7 of 9 career-event stories recognised
(fails), G4 no rumour called official (passes), G2 5 of 90 quiet articles
called a career event, 5.6% against a 5% mark (fails by under one
article). The test interval lies wholly below training's (54% to 69%), so
the night's experiments fitted the training articles more than their
numbers showed. Which test articles were missed was not read, and v7.7
is not sent the test set again. Note too that E4 removed the paraphrases of test
articles from the prompt; the rules file still cites test articles as
examples, which is fine for the labels but worth remembering whenever a
prompt is built from the rules.

v6 (../2026-09-27-axes-v6) predates the labelling rules the golden key was
decided under ([golden/rules.md](../../golden/rules.md)). v7 rewrites the
nine questions to carry them, and is scored against the frozen key
([golden/labels.json](../../golden/labels.json)).

## The names of the questions

Each of the nine questions has one short name, used everywhere for v7: in
this README, on the pages (wording page, claim map, plan) and in reports.
The code keeps its own keys. A later version may rename a question when its
meaning changes, and says so.

| Name in v7 | Code key | The question |
|---|---|---|
| how central | `centrality` | How central is he to the article? |
| whose words | `source` | Whose words or act is the new information? |
| what the source does | `act` | What does the source do regarding him? |
| what new fact | `fact` | What new fact about him does the article carry? |
| how firm | `firmness` | How firm is that fact? |
| reports his result | `reports_his_result` | Does it report his result? |
| reports his next fight | `reports_his_next_fight` | Does it report his next fight? |
| reports his health | `reports_his_health` | Does it report his health? |
| he speaks | `he_speaks` | Does he speak? |

The last four are yes/no; "reports his result", "reports his next fight"
and "reports his health" together are **the three news questions**.

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
  (no fact means "how firm" is none and no news question is yes; a result, next
  fight or health fact answers its own yes/no question) are applied in code,
  in `score.py`'s `compose()`.

## Files

| File | What it is |
|---|---|
| `classifier-v7/questions.json` | the questions as they stand |
| `classifier-v7/questions-<round>.json` | the questions as sent in a round |
| `run.py` | sends a few articles (`--ids`) or one side (`--side`) |
| `score.py` | scores a round, or v6, against the key; `--selfcheck` checks its rules |
| `variants.py` | several wordings of one or more questions side by side in one call, with the standing wording as control, scored inside a base round |
| `variants/<experiment>.json` | the wordings each experiment sent, with its hypothesis |
| `decompose.py` | the "what new fact" question as one yes/no per kind, combined in code under several rules (E6) |
| `states.py` | the standing questions sent with a cleaned or shortened article text (E7) |
| `health_variants.py` | the first side-by-side test, three health wordings (v7.3) |
| `consolidate.py` | writes the standing version's scored answers to `golden/answers/classifier-v7.json` for the claim map |
| `disagreements-r3.md` | where a news question and the "what new fact" answer disagreed in v7.3 |

Three helper yes/no questions (`h_new_fact`, `h_others_story`, `h_callout`)
ride along in the same call. They are not scored; they are there so that
combining answers in code can be tried on stored answers without a new run.

## The versions of v7, one by one

**How they are named.** v6 and v7 are question designs. v7.1, v7.2 and so
on are successive versions of v7, each sent in full to every training and
validation article and scored. Each adds one step to the version before.
The code and files call a full run a "round", so v7.N is stored as round
N: `classifier-v7/questions-rN.json`, `raw/<id>-rN.json`, and
`ROUND=rN python3 run.py ...`. The experiments E1 to E13 are not versions:
each sent only the question under test, in several wordings beside the
standing one, and a new version was run when one was accepted.

| Version | What it adds |
|---|---|
| v7.1 | v6 with the 27 labelling rules written in |
| v7.2 | fixes from reading v7.1's misses; overfitted, kept only as a record |
| v7.3 | v7.1 plus the "reports his health" question's "no when" text rewritten |
| v7.4 | v7.3 plus E2 (another fighter talking about him counts for the main subject) |
| v7.5 | v7.4 plus E4 (invented examples) |
| v7.6 | v7.5 plus E8 (shorter "what the source does" and "how firm") and E10 (previews) |
| v7.7 | v7.6 plus E13 (a narrower callout sentence in "how central"); standing |

Right answers, tune / check. "All nine" is articles with every answer right.

| | v6 (same scoring) | v7.1 |
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

**v7.1** is v6 with the rules written in: "status update" added, next fight
narrowed to a specific fight, result only for an account of the fight,
"other fighter's side" with camps and former fighters, booked-or-fought for
the opponent's side, callouts in "how central", and "nothing regarding him"
as a described option in place of a bare "none of these".

**A tie added after v7.1, in code:** when "what new fact" is a result, "whose
words" is "no one", "what the source does" is "reports an event" and "how
firm" is "official or done"
(28 of 28 result articles in the training key). With it v7.1 scores **80 / 18**
articles with all nine right. The table above is v7.1 before that tie.

**v7.2** changed wording only, from reading v7.1's training-set misses: a
reported rumour or talks named as next-fight news in the "what new fact" question, a
preview or pick ruled out of "fight week event", a letter to his family
ruled out of "status update", the main-subject level widened to "another
fighter gives a view of him", and three boundaries in "what the source does". Result: **92 / 15**.
Training rose by 12 articles and validation fell by 3; on validation the
"what new fact" fell from 33 to 30 right and the "reports his next fight" question from 38 to 33,
all of it "no fact" articles now called next fight. That is overfitting:
the rumour sentence fixed seven training articles from one story and made
the question too eager elsewhere. v7.2 is kept as a record, not as the
standing version.

**Tried on stored v7.1 answers, no new run:** letting a confident yes/no
answer overrule a "no fact" (training 84, validation 16: also overfits);
making the three news questions follow the "what new fact" answer (training +11,
validation +0, health 37 to 39 on validation).

**v7.3** is v7.1 with one change: the "no when" text of the "reports his health" question.
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
| Walk a taxonomy one level at a time, showing each option's sub-options. | vendor, Advanced and hierarchical classification | Became an experiment for the "what new fact" question: first "is there a new fact", then which kind. |
| Ask one condition per yes/no question; combine in code. "Where interpretation is unavoidable, split it into two literal questions." | vendor, noul page and jaggedness #1 | Avenue 2 (decomposition), with the "what new fact" question asked as one yes/no per kind. |
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
v7.3 answers and applies the ties, so a variant is judged by what it
does to whole articles. Identical wordings sent in the same call do differ
a little (the `control_copy` variant), so duplicates in one call measure
noise without a second round.

### E1. "What new fact", read literally (rejected)

*Hypothesis.* Three places where a literal reader would go wrong: "no fact
if it is only talk" collides with "in talks" (negotiations); health and
status update list who may state them (him, his team, the promotion, a
named report) as if no one else could, so a friend's health update falls
outside; and the definition "a fact is ... stated as fact" excludes the
rumours that next fight includes (the vendor's "contradictory instructions
and criteria"). Variants: `talk`, `named`, `rumour`, and two combinations.
Failure: validation "no fact" articles turning into next fight, as in
v7.2.

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
rumoured-fight articles on the "what new fact" answer in both runs, but its gains on
whole articles did not repeat (+4/−1, then +1/−3), the reworded version
lost most of the gain, and nearly all of the gain sits in the two claims
it was designed on (claim-097, claim-099), which the leave-claims-out rule
does not accept. The articles of claim-097 also miss on "what the source
does", so fixing the fact alone does not make them right. Combining all
three cost the validation set 3 to 5 articles: the same direction as
v7.2.

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
both, and v7.2's wording. Failure: callout articles (only mentioned by
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

**v7.4** = v7.3 plus E2. A full round on both sets ($0.052):
articles with all nine right **90 of 155** on training and **19 of 40** on
validation (v7.3: 87 and 17). From here on variants are scored inside
v7.4's answers.

### E3. Option order (rejected; the avenue is closed)

*Hypothesis.* The vendor says jev-1.13 leans to the first option. If so,
reversing or shuffling the options of "whose words", "what the source does"
and "what new fact" moves more answers than an identical copy does, and
either one order is better or averaging the probabilities over several
orders fixes answers that sit near a line. Variants per question: a copy,
all options reversed, reversed with the last-resort options kept last, and
shuffled (fixed seed) with the last-resort options kept last.

*Smoke test* (8 articles): confidence moved with order, the chosen option
rarely did.

*Full run.* Answers that changed against the control, training set (copy /
reversed / reversed keeping the last / shuffled): whose words 3 / 7 / 7 / 6,
what the source does 3 / 11 / 8 / 8, what new fact 2 / 8 / 11 / 7. So order
does matter, about three times the noise of a copy. But it does not
help: averaging over the four orders scored 141, 124 and 132 against the
control's 144, 127 and 130. Whose words lost 3 to 4 articles under every
other order. One order of the fact options (shuffled, last-resort options
kept last) gained 4 articles in 3 claims and lost none; the second run gave
+2 and −0 on training and −1 on validation, and reversed gave +1 then
validation +2/−1.

*Decision: rejected.* Neither order passed the rule in both runs. The
standing order is kept. The pattern behind the first run's gains is worth
knowing: preview articles stop being read as "fight week event" when that
option is not near the top, which fits the vendor's warning, but the effect
is about the size of the noise.

### E4. Examples that paraphrase golden articles (adopted)

*Hypothesis (a bias check).* Some examples in the questions paraphrase
golden articles. Tracing each one found that several come from articles
the labelling rules cite, and some of those are on the **test** side: "a
fighter answers him with an insult" (#889), "a rival says a fight with him
is not his own next fight" (#492), "a fighter says the watched fighter
invited him to his gym" (#975), "his coach says the fractures have healed"
(#152, #412), "a rival guesses he will not fight until next year" (#462),
"his camp demanding a rematch" (#129). Others paraphrase training claims:
the promotion's president saying he is ready to fight (claim-113, ten
articles), the denied December fight (#820), the podcaster on internal
talks (claim-097), the rival's "easy fight" (#287). A prompt that
paraphrases a test article makes the test score look better than the
classifier is. All 18 were replaced with invented cases from other
situations. Decision rule, set before the run: adopt if no question loses
more than noise (2 training articles, 1 validation article) in two runs,
since removing leakage protects the one number that matters.

*Result, two runs each* (question right on training / validation, control
first):

| question | control | invented, run 1 | invented, run 2 |
|---|---|---|---|
| whose words | 143 / 35 | 143 / 36 | 144 / 36 |
| what the source does | 128 / 30, 29 | 130 / 30 | 129 / 29 |
| what new fact | 131 / 33, 130 / 33 | 130 / 32 | 130 / 34 |
| how firm, examples only | 133 / 32 | 124 / 32 (−9, all in claim-113) | — |
| how firm, rule stated as a status signal | 132 / 33, 132 / 32 | 132 / 32 | 133 / 32 |

*Decision: adopted.* The three choice questions lost nothing. On how firm,
the leaked example was carrying a whole claim: without it, nine of the ten
copies of the Dana White statement fell from "official or done" to
"reported". The fix is not the example but the rule it stood for, stated
plainly as a signal of the top level: "the promotion or he himself states
his status: available to fight, out injured, or moving weight class". With
that, nothing is lost.

*Learned.* An example lifted from a training article can carry a whole
claim, and the training score then measures memory of the prompt, not
reading. The rules file cites test-set articles as examples, which is fine
for the rules (they are the labelling guide) but means every prompt built
from the rules has to be checked for paraphrases of them.

### E5. What the source does, read literally (rejected by leave-claims-out; held for Anton)

*Hypothesis.* Three literal readings: "a pick or forecast for a specific
fight of his" lets a boast about a fight nobody has booked ("Usman would
make him quit") read as a prediction; "whether a rematch should happen" in
"steers him" pulls a report of talks about a rematch into steering; and
"reports an event" never says the event must be his. Variants: `booked`
(a forecast for a fight of his that is booked), `booked_notfor` (also names
the boast as a callout), `plans` (a report of what is planned or discussed
for him is giving news, not steering), `event_his`, and all together.

*Two runs* ("what the source does" right, training / validation; control
129 / 29, then 128 / 30):

| variant | run 1 | run 2 |
|---|---|---|
| booked | 131 / 30 (+3 in 1 claim, −1) | 132 / 30 (+5 in 3 claims, −1) |
| plans | 131 / 29 (+3 in 3 claims, −1) | 131 / 29 (+3 in 3 claims, −0) |
| booked + plans | — | 133 / 29 (+6 in 4 claims, −1) |
| event_his | 126 / 29 (−3) | — |

*Decision: rejected by the leave-claims-out rule.* Both fixes do what they
were built to do, in both runs, and lose nothing beyond noise: `booked`
fixes the three articles of claim-003 (a rival's manager boasting) and once
claim-008; `plans` fixes claim-113's "top two potential opponents" and
claim-097's "strongly considered". But those are the claims they were
designed on, and the validation set did not move (0 or ±1), so nothing
outside the design shows them working. They go to the "For Anton" list as
candidates. One supporting fact: every training article the key labels
"predicts his fight" is a pick for a booked fight, so `booked` agrees with
the key's own usage. `event_his` made things worse and is dropped.

*Learned.* The claim-097 articles cannot be fixed one question at a time:
with `plans` the model answers "gives news of him", but the "what new fact" answer is
still "no fact", and the tie "gives news never goes with no fact" then
replaces it. The fact rumour fix (E1) and this act fix are both needed,
and both were designed on that one claim.

### E6. "What new fact" decomposed into one yes/no per kind (rejected)

*Hypothesis.* The vendor's main advice: ask one condition per yes/no
question and combine in code. Seven yes/no questions, one per kind of fact
(next fight, result, fight week event, health, career move, personal life,
status update), each built from that option's own text in the standing
choice, so the test is about the shape, not new wording. A yes/no has no
option order. Combined in `decompose.py` under five rules: the most likely
kind or no fact below 0.5 (`kinds`); a separate "is there a new fact"
question first (`kinds_gated`); the three news questions standing in for their
kinds (`flags_and_kinds`); the standing choice, but a confident kind
overrides its "no fact" (`control_rescued`); the standing choice, but "no
fact" when no kind is a clear yes (`control_vetoed`). The line is 0.5
throughout, not fitted. Failure: "no fact" articles getting a kind on the
validation set, as in v7.2.

*Smoke test* (18 articles): the kind questions answered the rumoured
fights, the friend's health update and the letter correctly where the
choice had not, and left previews without a kind.

*Two runs* (fact right, training / validation; control 129-130 / 32-33):

| rule | run 1 | run 2 |
|---|---|---|
| kinds | 141 / 32 (+18 in 10 claims, −6; validation +4 −4) | 142 / 33 (+17 −5; validation +3 −3) |
| flags and kinds | 140 / 31 | 141 / 32 |
| kinds gated | 127 / 33 | 127 / 33 |
| control rescued | 135 / 30 | 137 / 31 |
| control vetoed | 132 / 34 (+8 in 6 claims, −5; validation +2 −0) | 132 / 35 (+7 in 6, −5; validation +2 −0) |

A second version of the result and fight-week questions, whose opening
line matched their own criteria (a results page that lists him counts),
fixed results pages but drew previews into "fight week", and was no
better overall.

*Decision: rejected.* The pure decomposition gains 12 articles on the
training set in both runs and nothing on the validation set, where it
calls "no fact" articles health (3) or next fight (2): the v7.2 pattern
again, in a new shape. The veto is the safe direction (it can only say "no
fact") and gains on both sets, but in both runs it loses the same five
real facts: two weigh-in pages, a results page, a post-fight interview the
key calls a result, and one health article. The rule says no true case may
be lost.

*Learned.* Asked one at a time, the kinds are read more literally and more
generously: they catch news given as talk, which the single choice files
under "no fact", and they over-call kinds on articles that only mention a
subject. The disagreement between the choice and the kind questions marks
the hard articles well, which is useful for review even where it does not
make a better label.

**v7.5** = v7.4 plus E4 (examples invented), run in full ($0.052):
**91 of 155** on training, **18 of 40** on validation. Later experiments
are scored beside v7.5.

### E7. What the classifier is shown (cleaning reported, not adopted)

*Hypothesis.* The vendor lists a large state full of unrelated detail as a
weak spot, and some saved texts open with a site's menus (#619, #958) or end
with lists of other headlines. Showing only the article's own text should
help; cutting long texts short might help or hurt. `states.py` builds two
states, in the runner only (golden/articles.json is untouched):
`cleaned` starts at the headline's repeat above the article (or the first
stretch of running sentences), ends before lists of other headlines and at
the last stretch of running sentences; `short` is the cleaned text cut at
4,000 characters. The cleaner keeps 99% of the median article and cuts 23
of 195 articles by more than 30%. All nine questions are sent, so each
state is a full round. Failure: any question worse beyond noise.

*Result* (articles with all nine right, training / validation):

| state | all nine | notes |
|---|---|---|
| v7.5, as saved | 91 / 18 | |
| cleaned | 92 / 17 | "what new fact" 128 → 131 and "how firm" 131 → 134 on training, "how central" 138 → 133; validation "what new fact" 33 → 32 |
| short (4,000 characters) | 83 / 17 | worse on training by 8 |

*Decision: cleaning makes no measurable difference, so nothing is adopted
and there is nothing to hand to the body-extraction station on these
numbers.* The gains and losses per question are the size of the noise and
point both ways. Cutting the text short costs whole articles: the news of
a long interview is often deep in it. As agreed, cleaning was tried as an
experiment and is reported, not adopted.

### E8. Adding, never cutting (two questions made shorter)

*Hypothesis (a bias check).* Every round so far made the questions longer
(the nine scored questions are now 16,800 characters). A lean version of
each keeps only each option's definition (no "not for" lists, no
examples), each level's summary (no signals), or for a yes/no question the
question alone (no true/false text, which the vendor says to try both
ways). Rule set before the run: adopt a lean question only if two runs show
it no worse than noise (2 training, 1 validation); shorter and equal is
better. The lean set is 8,100 characters.

*Result, first run* (question right, training / validation, control first):

| question | standing | lean |
|---|---|---|
| how central | 139 / 32 | 122 / 32 (−19 in 11 claims) |
| whose words | 144 / 36 | 138 / 30 |
| what the source does | 129 / 31 | 129 / 32 |
| what new fact | 129 / 33 | 122 / 31 |
| how firm | 131 / 32 | 130 / 34 |
| reports his result | 154 / 40 | 150 / 38 |
| reports his next fight | 144 / 38 | 134 / 37 |
| reports his health | 144 / 38 | 138 / 38 |
| he speaks | 153 / 40 | 152 / 40 |

The second run of the two that held gave the same counts: what the source
does 129 / 32 against 129 / 30, how firm 130 / 34 against 131 / 32.

*Decision: "what the source does" and "how firm" adopted in their lean
form; the other seven keep their text.* The bias check mostly came out in
the wording's favour: the signals of "how central", the "not for" lines of
"whose words" (which lose 6 articles on the validation set too) and the
true/false text of the yes/no questions all earn their place. But the
"not for" lines and examples of "what the source does", and the signals of
"how firm", carried nothing measurable; without them the two questions are
half as long and score the same on training and one or two better on
validation. That includes the status signal E4 added to "how firm": the
level's own summary ("the promotion or he himself states it") is enough
once no example points elsewhere.

### E9. Bias checks on "what new fact": a fragment, and anchoring on v6 (rejected)

*Hypotheses.* (1) The scan for negations and "only" found the health
option of the "what new fact" question still opening with the fragment "Only when he
will be ready to fight again, ...", the same kind of fragment Anton caught
in the health yes/no question; rewritten as a full sentence. (2) Every
version so far keeps v6's structure. A fact question written from
golden/rules.md alone, with the instructions as named fields (the vendor's
structured form) and one plain definition per option, tests whether that
structure is a habit or knowledge.

*Smoke test.* The from-scratch version fixed the friend's health update,
the letter and both rumoured fights, but called every preview "next fight"
with confidence above 0.85. A second version added the rule that a booked
fight a preview starts from is no fact; it still called some previews next
fight.

*Full run* (fact right, training / validation; control 128 / 33):
fragment rewrite 128 / 33; from scratch 120 / 28; from scratch, second
version 130 / 28 (+13 in 6 claims, −11 in 6; validation −7 +2).

*Decision: rejected.* The fragment rewrite changes nothing measurable on
its own. The from-scratch question loses 5 validation articles even where
it gains on training. *Learned:* the "not for" lines that v6 and the
rounds since accumulated are not habit; they carry what earlier tuning
found (E8 showed the same from the other side). Anchoring on that
structure is justified.

### E10. Previews are not fight week events (accepted)

*Hypothesis.* Five training articles in three claims are previews or
picks that the "what new fact" question calls "fight week event". The question's
definition of that option lists "how to watch" and its example is "Start
time and how to watch his fight tonight", but the rule (golden/rules.md,
"An interview is a place, not a fact") lists only the routine: weigh-in,
face-off, open workout, card order, start times. The question had drifted
from the rule. Change: drop "how to watch", replace the example with an
invented card-order one, and add to "not for": "A preview or a pick for
his fight, even one that gives the start time or the card (that is no
fact)." Variants with and without E9's fragment rewrite. Failure: real
weigh-in or card articles lost.

*Smoke test* (11 articles): all five previews fixed, every weigh-in and
results article kept.

*Two runs* (fact right, training / validation; control 129 / 32 both
times):

| variant | run 1 | run 2 |
|---|---|---|
| preview | 132 / 33 (+5 in 4 claims, −2) | 134 / 33 (+5 in 3, −0) |
| preview + fragment rewrite | 134 / 33 (+5 in 4 claims, −0; validation +1) | 134 / 33 (+6 in 4, −1; validation +1) |

*Decision: accepted* (preview + fragment rewrite). Both runs agree; all
nine right rises by 4 and 5 on training and 0 and 1 on validation.
Leave-claims-out: it was designed on the preview misses of claim-058, -066
and -073.0; beyond them it gained #977 (claim-112) in the first run, #636
(claim-080) in the second, and one validation article in both.

### E11 and the last checks (no change)

*E11.* On 4 training and 2 validation articles the key says he is absent
from the article's own text and the model says "only mentioned". Each
level is judged alone, and the "only mentioned" level did not say "in the
article's own text". Adding it, and saying what "absent" means, moved
nothing in the smoke test (12 articles), so no full run. Reading the
articles showed why: his name sits in inline "LATEST NEWS:" headlines or a
digest of other headlines inside the saved text, which the model fairly
reads as text. That is for body extraction (For Anton, item 3).

*On stored answers, no cost:* scoring the scales by their most likely
level instead of the rounded average gained 2 to 3 "how central" answers
on training and lost 1 to 2 on validation in each of v7.3 to v7.6:
rejected. A tie "only mentioned means no fact" (31 of 33 training key
articles agree) changed nothing: the answers already obey it.

**v7.6** = v7.5 plus E8 and E10. Sent twice: 94 / 20 and 94 / 19.

## After the night (2026-10-04)

### E12. How central: "how much of the article", not "what is new" (no change)

*Hypothesis.* v7.1 replaced v6's opening, "judge by how much of the
article is about him", with "judge by what the article says that is new
about him". That widens the rule "new, not long" (golden/rules.md), which
decides only the boundary between "only mentioned" and "shares the
article", to the whole scale, and leans on the "what new fact" question's idea of
news. The v7.6 levels already carry the rule in their signals. Variants,
levels unchanged: *how_much* (v6's opening, no callout sentence) and
*how_much_callout* (the same with "An article built on another fighter's
wish to fight him is that other fighter's story" kept). Failure: the
callout cases of the rules lost.

*Two runs* (how central right, training / validation; control 138 / 32,
then 139 / 33):

| variant | run 1 | run 2 |
|---|---|---|
| how_much | 140 / 33 (+7 in 4 claims, −5 in 2) | 142 / 33 (+8 in 5, −5 in 2) |
| how_much_callout | 139 / 33 (+3 in 3 claims, −2 in 2) | 139 / 33 (+3 in 3, −3 in 2) |

*What it shows.* The two halves of the change act separately.
"How much" against "what is new" (how_much_callout against control) moves
nothing beyond noise in either run. The callout sentence is what moves:
without it, five articles in claim-014 and claim-033 come right (#170,
#174 Makhachev on Topuria's comeback; #256, #269, #287 Tsarukyan naming
Topuria's next opponent), and four callouts in claim-099 that the rule is
built on (#843, #871, #921, #892) go wrong, both runs. Read literally, the
sentence takes any article where another fighter talks about his future
as "another fighter's wish". #78 (claim-003) is lost in every variant.

*Decision: no change yet.* how_much passes the counts, but its losses are
the cases a written rule cites, so it is not accepted. The opening wording
is Anton's call (it is neutral either way); the lever is the callout
sentence, which a narrower wording might keep for claim-099 without
catching claim-014 and -033.

### E13. How central: a narrower callout sentence (accepted)

*Hypothesis.* E12 showed the sentence "An article built on another
fighter's wish to fight him is that other fighter's story" is read as
covering any article where another fighter talks about his future. A
narrower one: "A callout alone, where another fighter names him as the
opponent he wants, is that fighter's story." Variants, levels unchanged:
*narrow* (v7.6 opening) and *how_much_narrow* (v6's opening). Failure:
claim-099 lost again, or claims 014 and 033 still wrong.

*Two runs* (how central right, training / validation; control 137 / 32
both times):

| variant | run 1 | run 2 |
|---|---|---|
| narrow | 140 / 32 (+4 in 3 claims, −1) | 141 / 31 (+5 in 4, −1; validation −1) |
| how_much_narrow | 140 / 33 (+7 in 6 claims, −4 in 2) | 139 / 33 (+6 in 5, −4 in 2) |

*What it shows.* narrow gains the same articles both times: #170 and
#174 (claim-014, Makhachev on Topuria's comeback), #803 (claim-097) and
#977 (claim-112); it loses only #892 (claim-099), which every variant in
E12 lost too. The Tsarukyan articles of claim-033 stay wrong. All nine
right rises by 3 and 4 on training, 0 and 0 on validation. With the narrow
sentence the opening is no longer neutral: v6's opening loses three of the
claim-099 callouts the rule cites (#871, #892, #921) and #78. "What is new
about him" is what holds the callout rule once the sentence stops doing
it alone.

*Decision: narrow passes the acceptance rule* (training +4 and +5 in at
least 3 claims, validation within 1, two agreeing runs; leave-claims-out:
designed on claims 014, 033 and 099, it gains #803 and #977 outside them
in both runs). how_much_narrow is rejected. Adopted as v7.7.

**v7.7** = v7.6 plus E13. All nine right 96 / 155 and 20 / 40 (v7.6:
94 / 20, then 94 / 19). Against the v7.6 run, how central gained #170
(claim-014) and #803 (claim-097) and lost #892 (claim-099) and #1161
(claim-126, an absent-from-text article that changes between runs);
validation unchanged. A full run on another day carries the run-to-run
noise, so the side-by-side runs of E13 are the fairer measure of the
change; the full run agrees with them and adds no surprise.
