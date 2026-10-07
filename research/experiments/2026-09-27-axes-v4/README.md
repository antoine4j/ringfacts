# Axes v4 — the classifier questions rebuilt on JEV's documented capabilities

**Status:** run 2026-09-27 on `jev-1.13.0`, four passes, 0 errors in 1,200 calls, about 5 cents a pass. Findings below.
The questions exactly as sent: [`classifier-v4/questions.json`](classifier-v4/questions.json);
rendered for reading: [`questions-review.html`](questions-review.html)
(`python3 review.py questions-review.html` rebuilds it).

**Question.** Does the classifier place the golden articles more reliably
when each question uses the question type that fits it, and when aboutness
is computed from separate signals instead of asked as one cut?

## The nine questions

| # | key | type | what it asks |
|---|---|---|---|
| Q1 | `centrality` | score, 4 levels | how central he is: not in the content → only mentioned → one of several subjects → the main subject |
| Q2 | `source` | choice + "none of these" | whose words or act the news is (where it originated, never the relaying outlet) |
| Q3 | `act` | choice + "none of these" | what the source does regarding him |
| Q4 | `fact` | choice + "none of these" | the new fact about him, if any |
| Q5 | `firmness` | score, 5 levels | how established the main fact is, whatever its kind: none → a wish → a rumour → reported → official or done |
| Q6 | `reports_his_result` | yes / no | does the article report the outcome of a fight of his? |
| Q7 | `reports_his_next_fight` | yes / no | …news of his next fight: an opponent, a date, an offer, a cancellation, or when he will be ready? |
| Q8 | `reports_his_health` | yes / no | …an injury, medical issue or recovery of his? |
| Q9 | `he_speaks` | yes / no | is he himself quoted, or does he post or write? |

## What changed from v3, and why

- **Three question types instead of one.** JEV documents `choice`, `score`
  (ordered levels, returns a position between them) and `noul` (yes / no,
  returns a probability); v1–v3 used only `choice` (docs/lessons.md,
  "What the vendor documents").
- **Aboutness is computed, not asked** (Anton, 2026-09-27). v3's gate cut
  #683 — his result, one line on a results page — as "not about him".
  Q1 now measures centrality only; news about him comes from Q4–Q10;
  aboutness is a formula over both, fitted to Anton's gate labels on the
  tune third, with the cut-off a per-fighter setting. The gate is a
  signal, not a blade (verdicts.md, 2026-09-27).
- **How firm no longer depends on the fact answer.** In v3 it applied only
  to a booking, return or career move and was the weakest axis (45
  articles misapplied, 11 missed): a multi-step question, which the docs
  name as a weak spot. It is now a score asked of the main fact of any kind.
- **Options carry "not for" and examples**, the structure the docs give for
  options the model confuses; the examples are made up, never taken from
  golden articles, so the test third stays unseen.
- **Every question stands alone.** JEV answers each question in isolation.
  v3's paired fit questions saw only bare option names, not their
  definitions ("not even clear what it means for me" — Anton), so they are
  gone; the in-list "none of these" the docs recommend sits inside each
  choice, next to every definition.
- **The article goes as named fields**: watched fighter, headline, outlet,
  date, text — the docs' recommended shape for state.
- **Only choice questions are reordered between passes**: score levels are
  ordered by meaning, yes/no questions have no options.
- **Booking and return are one thing: his next fight.** The draft asked
  them apart, but all 26 articles v3 placed under "return" are Topuria's
  comeback after the Gaethje loss; Donchenko and Amosov have none. A value
  built on one fighter's storyline cannot be tested on anyone else, and
  "ready in December" sat between health and booking. Every fighter is
  always between fights, so the fact value and the yes/no question now ask
  about his next fight (opponent, date, offer, cancellation, readiness);
  how firm (Q5) still separates "ready in December" (reported) from a
  signed bout (official).
- **Next fight and health each say where the other begins.** The docs ask
  for `true` / `false` definitions when a yes/no boundary is subtle, and
  for `not_for` where options overlap. "Ready in December" is his next
  fight; surgery with no word on when he can fight is health; a callout or
  a pundit's pick is opinion, not news of his next fight (it can still
  surface in how firm, as a wish, if a later version asks it that way).

## Not in v4, on purpose

- **Language.** English is JEV's primary language; roughly 130 of the 300
  articles look Spanish, Ukrainian or Russian (a character-based count).
  Giving the classifier the English extract too would mix the two
  programs, so it is its own experiment.
- **A fighter profile**: held off until it can keep itself up to date
  (golden/axes.md).

## Plan

One call on one article to check JEV accepts the structured options and the
score and yes/no types; then four passes of all 300 (three option orders
for the choices, pass 4 an identical repeat for the noise floor), about
$0.06 a pass at $0.042 per million input tokens.

## What came out (article level, 300)

`python3 consolidate.py` → `golden/answers/classifier-v4.json` and
`measures.json`. A choice is the majority of three option orders; a score
is the mean of three positions; a yes/no is the mean of three
probabilities. Machine answers, not labels.

| question | type | passes 1–3 differ | identical repeat changed |
|---|---|---|---|
| centrality | score | 12 | 9 |
| source | choice | 37 | 6 |
| act | choice | 32 | 8 |
| fact | choice | 43 | 9 |
| firmness | score | 32 | 24 |
| reports his result | yes / no | 3 | 3 |
| reports his next fight | yes / no | 3 | 2 |
| reports his health | yes / no | 1 | 0 |
| he speaks | yes / no | 6 | 1 |

- **Stability is at v3's level, and the yes/no questions are the steadiest
  answers yet** (0–3 changes in 300). The choices move with option order as
  much as in v3 (source 37 vs 34, fact 43 vs 41).
- **Firmness moves less than its 24 suggests.** The position shifts by 0.06
  on average between identical repeats (2 articles by more than 0.5); the
  24 are positions near a halfway point rounding to a different level.
  Compare positions, not rounded levels.
- **Centrality carries v3's gate almost exactly.** v3 "about him" → main
  subject 160 of 161; "partly" → one of several 44 of 44; "not about him"
  → not in the content 8, only mentioned 55, one of several 31, main 1.
  The 31 are where the two versions differ, and the place to look first.
- **#683 now separates as designed:** centrality 1.01 (only mentioned),
  fact *result*, firmness 3.99 (official or done). Low centrality with
  firm news is the case a computed aboutness has to catch.
- **The result and health yes/no questions answer "is it mentioned", not
  "is it the news".** Result says yes on 224 of 300, health on 97; 57
  articles get a strong result-yes with another fact as their news
  (#203, Donchenko on where his bonus goes, 0.99; #1031, Dana White says
  Topuria is ready, 0.98). Topuria's June loss and recovery are background
  in most of his articles, and the model reads "does the article report
  the outcome of a fight of his" literally — the weak spot the docs name.
  The fact choice, which asks for the main news, does not have the problem
  (result 88). As asked, these two cannot feed aboutness.
- **Fact now has next fight at 79 and no return value**; health 28,
  career move 2.
- **Source/act contradictions: 27 of 237** articles where he is at least
  one of several subjects (v3: 23 of 205).
- **He speaks (yes 194) and source = himself (88) are different
  measures:** he is quoted in many articles whose news came from someone
  else. 74 he-speaks answers sit between 0.3 and 0.7, the least sure of
  the yes/no questions.

## Next

1. Anton rules on the yes/no wording for result and health: ask whether it
   is *the news* (with `false` = recalled as background), or drop them and
   let the fact choice carry it.
2. Map version v4 (centrality × fact, firmness and the yes/no answers as
   facets); the 31 "not about him → one of several" articles first.
3. Anton's gate check (plan 4.9) on the v4 map.
