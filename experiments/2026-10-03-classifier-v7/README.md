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

**Round 4** = round 3 plus E2. A full round on both sets ($0.052):
articles with all nine right **90 of 155** on training and **19 of 40** on
validation (round 3: 87 and 17). From here on variants are scored inside
round 4's answers.

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
with `plans` the model answers "gives news of him", but the fact answer is
still "no fact", and the tie "gives news never goes with no fact" then
replaces it. The fact rumour fix (E1) and this act fix are both needed,
and both were designed on that one claim.

### E6. The fact question decomposed into one yes/no per kind (rejected)

*Hypothesis.* The vendor's main advice: ask one condition per yes/no
question and combine in code. Seven yes/no questions, one per kind of fact
(next fight, result, fight week event, health, career move, personal life,
status update), each built from that option's own text in the standing
choice, so the test is about the shape, not new wording. A yes/no has no
option order. Combined in `decompose.py` under five rules: the most likely
kind or no fact below 0.5 (`kinds`); a separate "is there a new fact"
question first (`kinds_gated`); the three news flags standing in for their
kinds (`flags_and_kinds`); the standing choice, but a confident kind
overrides its "no fact" (`control_rescued`); the standing choice, but "no
fact" when no kind is a clear yes (`control_vetoed`). The line is 0.5
throughout, not fitted. Failure: "no fact" articles getting a kind on the
validation set, as in round 2.

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
calls "no fact" articles health (3) or next fight (2): the round 2 pattern
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

**Round 5** = round 4 plus E4 (examples invented), run in full ($0.052):
**91 of 155** on training, **18 of 40** on validation. Later experiments
are scored beside round 5.

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
| round 5, as saved | 91 / 18 | |
| cleaned | 92 / 17 | fact 128 → 131 and firmness 131 → 134 on training, how central 138 → 133; validation fact 33 → 32 |
| short (4,000 characters) | 83 / 17 | worse on training by 8 |

*Decision: cleaning makes no measurable difference, so nothing is adopted
and there is nothing to hand to the body-extraction station on these
numbers.* The gains and losses per question are the size of the noise and
point both ways. Cutting the text short costs whole articles: the news of
a long interview is often deep in it. As agreed, cleaning was tried as an
experiment and is reported, not adopted.
