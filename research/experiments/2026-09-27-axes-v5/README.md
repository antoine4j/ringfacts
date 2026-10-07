# Axes v5 — the four yes/no questions reworded, one pass

**Status:** pass 1 run 2026-09-27 on `jev-1.13.0`, 0 errors, about 5 cents.
Passes 2–4 not run: one pass first, read, then decide (docs/self-improvement.md §8).
Questions as sent: [`classifier-v5/questions.json`](classifier-v5/questions.json);
rendered: [`questions-review.html`](questions-review.html). On the claim map as version **v5**.

**Question.** v4's yes/no questions said yes far too often: "reports his
result" 224 of 300, "reports his health" 97. Does naming the fighter by
the state field and asking for *news* rather than a mention fix that
without losing the real cases?

## What changed from v4 (only the four yes/no questions)

- **The fighter is named by the state field** ("the fighter named in
  watched_fighter"), as the docs advise, instead of "he" / "his". v4's
  "he speaks" said yes on #261 (another fighter's story) and "his next
  fight" on #953 (Pimblett's next fight).
- **Result and health ask whether it is the article's news**, and their
  `false` definition names the trap: a past fight or injury recalled as
  background. Every Topuria article recalls his June loss
  (docs/lessons.md).
- **Next fight excludes another fighter's next fight** unless he is in it.
- **He speaks** defines yes as his own words in the article, no as others
  speaking about him.

## The check before paying (10 articles, answers written down first)

All ten matched, with one borderline: #991, #90, #833 dropped from about
0.95 to 0.12–0.24 on "reports his result"; #683 (results page) and #732
(his win) stayed at 0.96–0.98. #148 said result 0.63 where no was
expected — its headline is built on "after his defeat". Two answers that
looked wrong were right on reading: #732 has no quote of his in the saved
text, so "he speaks: no" is correct; #148 does report his recovery and no
return in 2026.

## Pass 1 (300 articles)

| yes/no question | v5 yes (> 0.5) | v4 yes | unsure (0.3–0.7) |
|---|---|---|---|
| reports his result | 50 | 224 | 49 |
| reports his next fight | 86 | 122 | 41 |
| reports his health | 50 | 97 | 28 |
| he speaks | 69 | 194 | 19 |

- **The yes/no questions now sit near the fact answer**, which asks for
  the main news: result 88, next fight 75, health 34, source "himself" 86.
- **The fact choice has a milder form of the same trap.** In 45 articles
  the fact says "result" but the yes/no says no; on a sample of 12 the
  yes/no was right in most (#921, Pimblett wants to fight him; #4, Masvidal
  on Amosov), and the fact answer's confidence was often low (0.3–0.7).
  Not changed here: the fact question was not part of this fix.
- **One pass cannot measure stability.** No noise floor, no order effect;
  those need passes 2–4, and only if these questions are kept.

## Files

`run-classifier.py` (`--ids` prints every answer of chosen articles),
`classifier-v5/results-p1.json`, `consolidate.py` → `golden/answers/classifier-v5.json`
(each answer as a sliceable value plus its number), `review.py`.
