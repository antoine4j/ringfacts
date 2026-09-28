# Axes v4 — the classifier questions rebuilt on JEV's documented capabilities

**Status:** drafted 2026-09-27, reviewed with Anton, **not yet run**.
The questions exactly as sent: [`classifier-v4/questions.json`](classifier-v4/questions.json);
rendered for reading: [`questions-review.html`](questions-review.html)
(`python3 review.py questions-review.html` rebuilds it).

**Question.** Does the classifier place the golden articles more reliably
when each question uses the question type that fits it, and when aboutness
is computed from separate signals instead of asked as one cut?

## The ten questions

| # | key | type | what it asks |
|---|---|---|---|
| Q1 | `centrality` | score, 4 levels | how central he is: not in the content → only mentioned → one of several subjects → the main subject |
| Q2 | `source` | choice + "none of these" | whose words or act the news is (where it originated, never the relaying outlet) |
| Q3 | `act` | choice + "none of these" | what the source does regarding him |
| Q4 | `fact` | choice + "none of these" | the new fact about him, if any |
| Q5 | `firmness` | score, 5 levels | how established the main fact is, whatever its kind: none → a wish → a rumour → reported → official or done |
| Q6 | `reports_his_result` | yes / no | does the article report the outcome of a fight of his? |
| Q7 | `reports_his_booking` | yes / no | …a fight of his set, offered, negotiated or cancelled? |
| Q8 | `reports_his_health` | yes / no | …an injury, medical issue or recovery of his? |
| Q9 | `reports_his_return` | yes / no | …when he will fight again or be available? |
| Q10 | `he_speaks` | yes / no | is he himself quoted, or does he post or write? |

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
