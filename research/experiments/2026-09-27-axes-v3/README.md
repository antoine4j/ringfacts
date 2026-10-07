# Axes v3 — the classifier asked on the approved axes

**Question.** Can the classifier place each golden article on the axes of
[golden/axes.md](../../../golden/axes.md) — gate, source, act, fact, how firm —
steadily, and does every axis have the values the articles need?

**Setup.** JEV (`jev-1.13.0`), one call per article, 300 golden articles.
Ten questions: the five axes, each paired with a question on whether its
options fit (the in-list escape moved out: v2 chose it once in 1,500
answers while missing a value it needed). Passes 1–3 in three option orders
(original, reversed, shuffled), majority of three; pass 4 repeats pass 1
exactly, for the noise floor. The classifier sees the fighter's name, the
headline, outlet, date and the saved text, nothing else — no fighter
profile (Anton, 2026-09-27). No labels exist yet: everything below is how
the machine behaves, not whether it is right. About $0.20 of JEV, estimated
from earlier passes' cost (the API returns tokens, not a price: 1.24 M in,
0.18 M out per pass).

**Files.** `classifier-v3/questions.json` (as asked; `questions-p1..4.json`
per pass), `run-classifier.py`, `classifier-v3/results-p1..4.json`,
`consolidate.py` → `golden/answers/classifier-v3.json` and `measures.json`,
`review.py` → the question review page. `raw/` is git-ignored.

## What came out (article level, 300)

| question | all three orders agree | changed with the option order | changed on an identical repeat |
|---|---|---|---|
| gate | 288 | 12 | 6 |
| source | 266 | 34 | 6 |
| act | 267 | 33 | 15 |
| fact | 259 | 41 | 14 |
| firmness | 261 | 39 | 9 |

- **The noise floor is 2–5%.** An identical repeat changes 6–15 answers in
  300. Any difference between versions smaller than that is not a finding.
- **Every value is used.** The values v2 lacked now carry real weight:
  *gives news of him* 43 articles, *steers him* 28 (v2 never used its
  steering option), *his manager* 13, *his team* 10.
- **The gate is stricter than v2's derived rule.** Claims: 49 about him, 13
  partly, 66 not (v2's rule: 59 / 18 / 51). 18 claims moved from yes or
  partly to not; in 37 claims the classifier's gate and the extractor
  disagree on "not about him" (each program's majority over the claim's
  articles; 43 if any single article counts). Which is right needs Anton's check.
- **How firm is the weakest axis.** It should apply only to a booking, a
  return or a career move, but 45 articles about him carry a firmness on
  another kind of fact (a result, say), and 11 bookings or returns got "no
  such fact". Its fit question says "none fits" 49 times, mostly on
  results and "none" facts: the model finds "no such fact" an odd answer
  where there is a fact of another kind.
- **Act depends on source, and 23 of the 205 articles not gated out break
  that rule** (11 claims): a source/act contradiction is now a doubt flag.
- **The fit questions rarely fire outside firmness:** source 5, act 3,
  fact 15 (10 of them on articles gated out). Where they fire, the main
  answer's confidence is not reliably low (fact: 0.88 on "none fits" vs
  0.65 on "fits well"), so they do say something confidence does not — but
  too rarely yet to prove their worth.
- **Most claims about him sit in one cell:** himself × speaks of himself,
  19 of 62. The other 43 spread over 24 cells.

## Next

1. Anton checks the gate on the map (v3): the "not about him" slice and the
   43 disagreements.
2. Firmness: ask it of the article's main fact whatever its kind, or derive
   it only for booking / return / career move — to decide before v4.
3. Spot-check source × act, doubtful claims first; the corrections become
   the labels.
