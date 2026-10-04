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
