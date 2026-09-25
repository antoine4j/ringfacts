# Answers to buckets — which answers place an article, and which isolate a claim

**2026-09-25. Read `REPORT.html` first, then `TYPES.html`** (`python3 build-report.py` regenerates
it): executive summary, plain-English method, findings, the proposed mapping
from classifier and extractor answers to bucket 1 / 2 / 3, and the proposed
question set. This file is the index.

## The two questions, from Anton

1. Is there a better design for the classifier's questions and the
   extractor's fields that better isolates the groupings in the golden set
   (a claim = one occasion)?
2. What combination of answers should put an article in bucket 1, 2 or 3?
   And which questions or options proved useless?

## The short answer

- Today's rules agree with Anton's graded bucket on 76% of the 154 golden
  articles he graded (83% of the 76 that are not repeats). `sourcing` decides
  35 buckets in 300; `whose_judgement` decides none; the "already known" half
  of `novelty` dropped nine articles he graded 2.
- Five redesigned questions (role + "one of many on a list", speaker, act,
  kind with the booking's firmness folded in, depth) with a corrected mapping
  reach 84% / 88% on the same rows. In-sample: the rules were corrected while
  looking at the misses.
- No answer isolates a claim alone. Speaker + origin person is a perfect
  join in this sample but covers 12% of same-claim pairs; the person behind
  the occasion is the most stable field (one value in 35 of 47 claims vs 4 of
  47 for the free-text occasion) and must be asked for harder (filled on 63
  of 300). High-recall signals merge different claims too. The rest needs a
  reader: the join-or-start stage.

## Files

| file | what |
|---|---|
| `measure.py` → `measures.json` | offline: ground truth from the grading files, today's rules replayed, question sensitivity, grouping signals on 6,542 pairs, within-claim consistency |
| `classifier-v2/questions.json`, `run-classifier.py` | the five questions; JEV, three option orders per set; `questions-p1..3` = first wording, `p4..6` = with `one_of_many_on_a_list`; `results-p*.json`; `raw/` cache (git-ignored) |
| `extractor-v2/prompt.md`, `run-extractor.py` | twelve fields; Qwen3.8 Flash via OpenRouter on the TEST key; `results-p1.json` and the identical replicate `results-p2.json`; `raw/` cache (git-ignored) |
| `score.py` → `scores-A.json` / `scores-B.json` | the v2 consensus, the mapping (old rules, v2 draft, v2 corrected, with and without the speaker gate) against Anton's buckets; extractor v2 grouping signals, consistency, replicate |
| `sensitivity-v2.json` | which v2 question the bucket depends on, which options no rule reads |
| `build-report.py` → `REPORT.html` | the write-up; every number pulled from the JSON files |
| `types.py` → `TYPES.html`, `types.json` | the second report: what types of news the 129 claims are, sorted by hand into four families and 28 types; one reader's sorting, not a ruling |

## Ground truth, stated once

Buckets come from `docs/grading/2026-09-05-all-articles.md` and
`2026-09-04-posted-30d.md`: rows Anton wrote a digit on (about nine) or
confirmed "as graded" (the rest); a repeat inherits its root's bucket from
the same file. Not golden rulings: the golden set carries his rulings on
grouping only. Two clusters of inherited labels look wrong (seven "breaks
silence" write-ups as bucket 1; two weigh-ins as bucket 1) and were left as
they are.

## Spent

Classifier: six passes of 300, about $0.05 each by token count (not metered
by the API), about $0.30. Extractor: two passes, $0.149 and $0.043 as metered
by OpenRouter (the second pass came back cheaper; same model, same prompt,
same 300 bodies). Budget was $1.50 each. Nothing in `golden/` or in the
earlier experiments was written.
