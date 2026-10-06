# Storyboard: a standing scoreboard of how precise the pipeline is

**Status:** idea, parked 6 Oct 2026. Sketched in one pass, open questions
below; needs a proper design session before anything is built. Builds on
the measurement plan of the [v0 design](2026-10-04-v0-design.md)
(section 13, and section 11, "What it measures").

## The problem

Anyone shown the project asks how precise it is. Today the answer lives in
replay result files and review rows that nothing adds up. The v0 design
already names two live measures from the review marks (over-merging and
over-splitting) but they were never built.

## Two sources, shown side by side, each with its weakness

**1. The golden replay: fair, but old articles.** The Classifier to the
Decider re-run on the golden set's training and validation articles,
scored against Anton's labels (`v0/pipeline/measure/replay-score.ts`).
Numbers from the replay of 5 Oct 2026
(`replay-results/2026-10-05T1019-earliest-on-tie.json`):

| | Training (155 articles) | Validation (40 articles) |
|---|---|---|
| Grouping, pair precision | 0.62 | 0.93 |
| Grouping, pair recall | 0.83 | 0.70 |
| Classifier, all nine answers right | 95 of 155 | 19 of 40 |

*Pair precision*: of the pairs of articles v0 put in one claim, the share
the ruled claims also put together; low means over-merging. *Pair recall*:
of the pairs the ruled claims put together, the share v0 did too; low
means over-splitting. Validation is the fairer column (nothing was tuned
on it) and the smaller one. The test set has not been run.

**2. Anton's live review: current, but skewed and small.** Marks in force
on 6 Oct 2026:

- 57 readings marked, in 14 claims, of 428 claims in all (about 3%);
- 2 marked as not belonging: over-merging **3.5% (2 of 57)**, with a 95%
  interval (Wilson) of **1.0% to 11.9%**;
- 1 "same claim as" link: the only over-splitting signal so far.

The skew: Anton reviews the claims he opens, not a random draw, so these
numbers describe the claims he found interesting. The v0 design's guard
stands: they are reported with their counts and never compared with the
golden set's.

## Countering the skew: a fixed random sample (proposed)

- The storyboard picks every Nth claim by a fixed rule (a hash of its id):
  no new table, and nothing Anton chooses can sway it. Sample claims carry
  a small marker; a filter lists the unreviewed ones.
- The scoreboard shows two rows: **the sample** (fair, when all of it is
  reviewed) and **everything reviewed** (more data, skewed).
- Load, measured: about **6 new claims a day** (86 claims whose first
  article was published in the 14 days to 6 Oct). One in 10 is about 4
  sample claims a week; one in 3 about 2 a day.

## What it can measure, and what it cannot

| Question | From | Ready |
|---|---|---|
| Over-merging (G3, and G1 when news is swallowed) | ✕ marks | yes |
| Over-splitting (G3, repeats) | "same claim as" links | yes |
| Wrong tier, junk posted (G2) | review of the answers behind a tier | needs [the parked answer-review idea](2026-10-06-review-classifier-answers.md) |
| Classifier right, per question | the same | needs it too |
| Missed news (G1) | nothing on the storyboard | never from review: an article that never arrived cannot be reviewed. Stays the monthly recall probe of [goals.md](../../goals.md) |

So the scoreboard would start with grouping, and the answer-review idea
would add the tier and classifier rows.

## Open questions

1. **Where:** a "scores" page in the menu (room for both sources and their
   caveats; the sketch's recommendation), or a one-line strip on the
   claims list?
2. **The random sample:** build it, and at what rate (1 in 10, 1 in 3)?
   Or start with "everything reviewed" only?
3. **Over-splitting, as a number:** the v0 design says "how many claims
   linked into how many groups". Against what denominator: the reviewed
   claims, the sample, all claims of the period?
4. **Which period:** all time, the last 7 days, or both? The pipeline's
   settings change; a number mixing versions describes none of them.
5. **Versions:** should each live number be split by classifier, grouping
   and settings version, the way the replay is?
6. **The replay:** show the last stored result, or re-run on a schedule?
   And when, if ever, the one test-set run happens, and where it shows.
7. **Error bars:** the Wilson interval on every share, or only beside the
   headline numbers?
8. **The audience:** a page for Anton's own tuning, or one fit to show
   strangers (README, CV link)? The second wants plainer words and the
   caveats up front.
