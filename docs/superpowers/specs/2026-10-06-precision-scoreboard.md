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

Answered one at a time from 9 Oct 2026; each answer is recorded under
"Decisions" below and the question is marked settled.

1. **Where** (settled 9 Oct, see D1): a "scores" page in the menu (room for both sources and their
   caveats; the sketch's recommendation), or a one-line strip on the
   claims list?
2. **The random sample** (settled 9 Oct, see D4): build it, and at what rate (1 in 10, 1 in 3)?
   Or start with "everything reviewed" only?
3. **Over-splitting, as a number** (settled 9 Oct, see D2): the v0 design says "how many claims
   linked into how many groups". Against what denominator: the reviewed
   claims, the sample, all claims of the period?
4. **Which period** (settled 9 Oct, see D5): all time, the last 7 days, or both? The pipeline's
   settings change; a number mixing versions describes none of them.
5. **Versions** (settled 9 Oct, see D6): should each live number be split by classifier, grouping
   and settings version, the way the replay is?
6. **The replay** (settled 9 Oct, see D7): show the last stored result, or re-run on a schedule?
   And when, if ever, the one test-set run happens, and where it shows.
7. **Error bars** (settled 9 Oct, see D9): the Wilson interval on every share, or only beside the
   headline numbers?
8. **The audience** (settled 9 Oct, see D10): a page for Anton's own tuning, or one fit to show
   visitors (README, the public pages)? The second wants plainer words and the
   caveats up front.

## Decisions

**D1. Where (9 Oct 2026): both a page and a strip.** A new "scores" page
in the storyboard's menu is the source of truth, with room for each
number's date, method and weakness. The claims list gets a one-line strip
with the headline numbers, so they are in view and seen to change while
claims are being reviewed; it links to the page. Nothing in the
storyboard is removed or replaced to make room: the `/replay` placeholder,
the `/compare` page and the live/replay switch in the top bar all stay,
and the scores page is added beside them. Considered and rejected: the
page alone (the number out of sight while reviewing) and the strip alone
(no room for the caveats the v0 design requires next to every live
number).

**D2. The numbers (9 Oct 2026): six live numbers and one reference.**
The scoreboard is kept small on purpose; it is a launch instrument, not a
study. Three grooming numbers come from the review marks:

| Number | Share of | Counts |
|---|---|---|
| Over-merge | readings in sealed claims | readings marked ✕ (does not belong) |
| Over-split | sealed claims | claims linked "same claim as" another |
| Wrong tier | sealed claims | claims marked as deserving another tier |

Three launch-bar numbers, the bar of [goals.md](../../goals.md) read off the
page: **career events missed**, from a hand-kept list of the events known
to have happened in the period, each marked arrived, posted or missed, with
the date of the last check (the maintainer expects to know of any event
anyway; the list is the heuristic that makes the count checkable);
**repeats noticed in tier 1**, the "same claim as" links where both claims
went out as tier-1 posts (a half that only reached a digest does not
count: the digest absorbs it); and **the 👎 share**, posts and digests
whose latest reaction is 👎, from the `reactions` table, which needs no
grading. Every share carries its count beside it. The reference is the
golden replay's stored result (D7 says how), beside them, never mixed.
Left for after the launch: the wrong-answer rate per classifier question
(needs [the answer-review idea](2026-10-06-review-classifier-answers.md)),
and 3.11's clean-text line, one row when that run happens.

**D3. The marks (9 Oct 2026): three, one of them new.** A reading belongs
in its claim or not (`review_readings`, exists); two claims are one
(`review_same_claims`, exists); and, new, **a claim should have been
Post, Digest or Drop**: one tap on the claim page, stored in a
`review_tiers` table shaped like `review_readings` (claim, the tier it had,
the tier it should have had, author, time; append-only, the newest row in
force, `v0_editor` may insert). The mark is at the claim level, where the
maintainer reviews, not per reading. The fuller version, correcting the
classifier's answers so a wrong tier can be traced to a wrong answer or a
wrong setting, stays parked; a bare "should have been" is enough for the
rate.

**D4. Grading (9 Oct 2026): whatever can be reviewed, claim by claim,
no sample.** No rhythm, no quota. The maintainer reviews the claims they
open and seals each one: a claim counts in any number only when every
reading in it carries a mark (the claims list's "reviewed" state,
`v0/storyboard/lib/filters.ts`); a sealed claim that gains an article
drops out until it is sealed again, and the page counts those ("4 claims
reopened by new articles"). The numbers are therefore over the claims
the maintainer chose, and the page says so under each one, in words
("over the 14 claims reviewed, chosen by hand, not drawn at random").
The rule-drawn sample of the proposal above is kept in the back pocket
for when a fair number is wanted and the load allows; nothing built now
prevents it.

**D5. The period (9 Oct 2026): one picker, all time by default.** The
scores page has one date picker and both sections follow it; two pickers
would put two periods in view at once, the mixing question 4 warned
about. The default is all time. The storyboard's presets (last 7 days,
last 30 days, this week, a custom range) narrow it, and the launch-bar
card carries its own sentence, "judged over the last 14 days", with a
preset for that. A claim is in the period by the claims list's existing
rule: when at least one of its articles was published in it, and then it
counts whole, the readings outside the period included (they are marked
too, since sealing marks every reading). The strip on the claims list is
all time, always.

**D6. Versions (9 Oct 2026): no split; name the versions in force, and
warn when they changed inside the period.** Each section names the
classifier, grouping and settings versions in force at the end of the
period. When any of them changed inside the period, a line under the
numbers says so, with the dates ("classifier v7.7 from 3 Oct, v7.6
before: these numbers mix the two"), and it is the reader's job to pick a
period that sits inside one version. A row per version was considered and
rejected for now: at about six claims a day the rows would be thin, and
the date picker already gives a per-version number when one is wanted.

**D7. The replay (9 Oct 2026): the stored result, re-run by hand on a
station change, never on a timer.** A replay is the pipeline sitting the
golden set's exam; its mark describes the versions it ran on and nothing
else, so a change to the classifier, the grouping or the tier settings is
not finished until the replay has been re-run and its result committed.
If nothing changed, nothing is re-run. Each run's score is already a
dated JSON file in `v0/pipeline/measure/replay-results/`; the scorer
will also write into it the classifier, grouping and settings versions the
run used, which it does not today. The scores page reads that directory
at build time: the newest file is the headline row, and every older file
is a history row with its date and versions, so the runs can be compared
on one line without a database. The `replay` schema in the database
is the replay's working space and holds the last run only. A
scheduled re-run and a re-run triggered by a version change were
considered and rejected: the first repeats a number for money, the
second is more machinery than the page.

*Added the same day.* **Every run's raw answers are kept as files**,
because each run cost real model calls: before a replay empties the
schema, every table of it is written to `golden/replays/<run>/`, one JSON
array per table plus a manifest with the versions, the date and the score
file it pairs with. The folder is git-ignored like the golden article
text, since the extracts and the raw replies quote the articles, and is
backed up the same way. The 5 Oct run (classifier v7.7, extractor p4,
grouping g1) was saved by hand on 9 Oct, before the save is built into
`replay.ts`. Nothing loads a saved run back into the database, and the
storyboard reads none of this. **The live/replay switch in the
storyboard's top bar is to be removed**: the storyboard is for the live
pipeline, and the switch could only ever show one replay against nothing,
which compares nothing. What replaces it is a separate page, outside the
storyboard, that compares saved runs with each other in detail, grouping
included, read from the saved files; which existing page it grows from is
the next decision. **The test set** (the 105
articles nothing was tuned on) is run once, after the extractor, digest
and grouping themes and before the launch, and shown as a third column
marked with its date and "run once"; until then the column reads "not
yet run".

**D8. Comparing saved replays in detail (9 Oct 2026): a page grown
from the golden review board, outside the storyboard.** The review board
(`golden/board/build.py` → `board.html`, local only because it prints the
articles' text) already lays out every ruled claim with its articles,
the models' answers as chips and the maintainer's ruling. The comparison
page is that board with one more chip per article: the claim the chosen
saved replay put it in, read from `golden/replays/<run>/`. A ruled claim
whose articles carry two different chips was split by the pipeline; one
chip under two ruled claims is a merge; the decision chip beside it shows
the tier. A picker at the top switches between saved runs. Built from
files only, git-ignored like the board (the extracts and raw replies
quote the articles), and built when a second saved run exists to compare.
The claim map, the Answer Key Check and the prompts pages were looked at
and set aside: they are about the classifier's answers, not grouping.

**D9. Error bars (9 Oct 2026): on the headline numbers only; sample
counts and a grey-out for the rest.** The Wilson 95% interval is drawn
beside the headline numbers alone: overall accuracy, and the G1 and G2
pass marks. Every other share shows its count beside it (D2 already
requires this), and a slice of fewer than 30 articles is greyed out
instead of given an interval. Considered and rejected: an interval on
every share, which at about six claims a day would put a wide bar on
nearly every row and bury the few that matter.

**D10. The audience (9 Oct 2026): visitors reading the public showcase
first.** The scores page is written for a reader who does not know the
project: plain words, and each number's date, method and weakness up
front. The maintainer's own tuning needs are met by what D9 already
gives, the count beside every share and the grey-out under 30; no second,
denser view is built.
