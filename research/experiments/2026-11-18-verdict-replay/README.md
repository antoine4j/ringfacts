# Would the health rule ever speak for the two quiet fighters? — 2026-11-18

Self-feeding architecture, spec unknown E8 ("whether the 30-day window and
20-article minimum hold up"). Informs the architecture's decision 3 (what
floor to accept for Donchenko), the pass rule for the comparison week
(Launch Map 10.8) and the starting thresholds of the alerts. Run 18
November 2026 (UTC) from the laptop, on top of the source review's branch.

**Question.** The architecture judges the intake's health per fighter over
a rolling 30 days: a verdict only when the window holds at least 20
articles, and an alert when the readable share is under the floor (75% over
30 days, "with 20 articles or more"); a second alert fires when no article
is found for a fighter for 7 days. Replayed day by day over production's
whole record, on what share of days would Amosov and Donchenko have had a
verdict at all? When it spoke, what would it have said? How long are the
silent stretches? Could a one-week side-by-side of both bots (10.8) tell
anything for them, given their weekly article counts? And how do the
answers move at windows of 30, 60 and 90 days and minimums of 10 and 20?

## Set

- **Production's record, 7 Aug to 18 Nov 2026** (104 days; the last full UTC
  day before this run). Read-only through the `v0_feed` role, on a session
  that refuses writes. Mshale left out. Counted as in the source review:
  without the `wrong_subject` and `url` holds. **2,357 articles: Amosov
  133, Donchenko 144, Topuria 2,080.**
- **A day** is the UTC day production stored the article (`seen_at`), the
  same date the source review's "last 30 days" uses.
- **Readable** is the source review's definition, applied to the text
  production stored: a reading rung, at least 400 characters, naming the
  fighter. Checked against that experiment's own file: the 1,796 articles
  both hold agree on all 1,796 verdicts. This is production's reader on
  Cloud Run, not v0's; v0's will read more (see the end).
- **Floor** 75% and the **7-day silence** alert are the architecture's
  starting thresholds.

## Method

1. `pull.mjs` reads the record once and keeps, per article, its fighter,
   its day and the readable verdict. No headline, address or text is kept.
2. `replay.mjs`, for each fighter and each day D with a full window behind
   it: the articles found and the readable ones in the W days ending on D.
   **Verdict** when found is at least the minimum; the verdict is *under the
   floor* when readable / found is below 75%. A day with fewer articles is
   **silent**. Windows 30, 60 and 90 days, minimums 10 and 20. Days before a
   full window exists are not judged, so a longer window judges fewer days
   (75, 45 and 15) from the same record.
3. The comparison week: every 7-day window of the record (98 of them), the
   spread of article counts per fighter, and the width of the 95% (Wilson)
   interval around a week's readable share. And, from every start day,
   how many days it takes to gather 20 articles.

No model calls, no outside requests. Cost: $0.

## Results

### Where the articles fall

Both quiet fighters' record is two bursts and a long quiet. Donchenko: 114
of his 144 articles come in the two weeks of 31 Aug to 13 Sep (his fight);
his last article is 2 Oct, so he has had none for 47 days. Amosov: 72 of
133 come in 2 Nov to 15 Nov, 17 in the week of 28 Sep, and fewer than 10
in every other week. Topuria has at least 49 articles in every
week.

### The rule at its starting setting (30 days, minimum 20, floor 75%)

| | Days judged | Days with a verdict | Said "under the floor" | Share on those days | Silent stretches (longest) |
|---|---|---|---|---|---|
| Amosov | 75 | 43 (57%) | 43 of 43 | 22% to 68% | 2 (24 days, 5 Sep to 28 Sep) |
| Donchenko | 75 | 35 (47%) | 35 of 35 | 22% to 66% | 1 (40 days, from 10 Oct, to the end) |
| Topuria | 75 | 75 (100%) | 21 of 75 | 70% to 86% | none |

Amosov's first verdict is 29 Sep and Donchenko's 5 Sep, both inside a
burst of articles. Neither fighter's readable share reaches 75% on any day
the rule speaks: when it spoke, it said "under the floor" every time, so
for them the alert would have been on for the whole of every verdict. The
newest article in a verdict's window was a median 1 day old for Amosov and
2 for Donchenko, at most 11 and 13.

### Windows and minimums

Days judged, then days with a verdict; "under" is verdict days under 75%;
"silent" is the number of silent stretches and the longest in days; "age"
is the median days since the newest article in the window on a verdict day.

| Window | Min | Amosov judged / verdict / under / silent / age | Donchenko judged / verdict / under / silent / age | Topuria verdict / under |
|---|---|---|---|---|
| 30 | 10 | 75 / 64 / 64 / 2, 10 d / 2 | 75 / 40 / 40 / 1, 35 d / 3 | 75 / 21 |
| 30 | 20 | 75 / 43 / 43 / 2, 24 d / 1 | 75 / 35 / 35 / 1, 40 d / 2 | 75 / 21 |
| 60 | 10 | 45 / 45 / 45 / 0 / 3 | 45 / 40 / 40 / 1, 5 d / 23 | 45 / 10 |
| 60 | 20 | 45 / 45 / 45 / 0 / 3 | 45 / 35 / 35 / 1, 10 d / 20 | 45 / 10 |
| 90 | 10 | 15 / 15 / 15 / 0 / 0 | 15 / 15 / 15 / 0 / 40 | 15 / 0 |
| 90 | 20 | 15 / 15 / 15 / 0 / 0 | 15 / 15 / 15 / 0 / 40 | 15 / 0 |

Read across: the minimum matters only at 30 days (10 instead of 20 adds 21
Amosov days and 5 Donchenko days of verdict). A longer window removes the
silence, but for Donchenko only by judging old news: at 60 days the
verdict on a typical day rests on articles whose newest is 20 to 23 days
old, at 90 days 40 days old (the same September fight, read as if current).
At every setting both quiet fighters sit under 75% on every verdict day.
The 90-day rows cover only the last 15 days of the record and show how
little this record can say about them.

### The "no article" alert (7 days)

Amosov: would have fired on 19 days, in 3 episodes (longest gap between
articles 15 days). Donchenko: 49 days, 3 episodes (longest gap 47 days,
still open). Topuria: never (longest gap 1 day).

### The comparison week (10.8), 98 weekly windows

| | Articles in a week: median (10th percentile, highest) | Weeks with none | Weeks with 5 or more | Weeks with 20 or more | Median width of a week's 95% interval on the readable share |
|---|---|---|---|---|---|
| Amosov | 4 (0, 70) | 19% | 42% | 8% | 57 points |
| Donchenko | 1 (0, 99) | 50% | 36% | 11% | 53 points |
| Topuria | 123 (74, 294) | 0% | 100% | 100% | 15 points |

From a random start day, Amosov took a median 26 days to gather 20
articles (longest 48; 95 of 104 start days got there before the record
ended, so the true figure is a little higher). Donchenko got to 20 from
only 35 of 104 start days, all between 7 Aug and 10 Sep (the run-up to
and week of his September fight); from the other 69 he never did.

What a one-week comparison can and cannot show, by the pass rule's three
rows (section 6 of the spec): "every article only production found is
explained" works at any count, including a week with none (it passes with
nothing to explain). "v0's readable share is at least production's for each
fighter" is a share of 0 to 4 articles for Amosov and 0 to 1 for Donchenko
in a typical week, where one article is 25 to 100 points: it cannot tell a
reader that is better from one that is worse, unless the week falls on a
burst of news (Amosov's two November weeks had 43 and 29 articles; Donchenko's
September weeks 84 and 30).

## What it suggests (findings, not decisions)

On this record, a 75% floor judged over 30 days would have said "under"
whenever it said anything about Amosov or Donchenko, and said nothing for
43% and 53% of days (at minimum 20). The numbers rule out reading a
one-week comparison, or a 30-day silence, as evidence about either
fighter's readable share unless a burst of news falls inside the week; and they
rule out a 75% floor as a signal for Donchenko, since the source review's
ceiling for him is 59% and the replay never saw him above 66%.

## What it does not settle

- **Production's reader, not v0's.** The shares are production's stored
  texts. v0's readers and Jina should read more; the source review's
  ceilings (Amosov 74%, Donchenko 59%, over the record to 30 Oct) bound
  them. A replay with the ceiling as the readable verdict was not run: it
  needs the outlet of each article, which this experiment does not keep.
  Amosov's ceiling is just under 75%, so whether his verdict days would
  clear the floor at the ceiling is open.
- **Two bursts are the whole story.** Each quiet fighter has one burst
  of articles in the record (Donchenko's is his September fight). A longer record would
  change the silent shares; the figures describe these 104 days only.
- **Day boundaries and the window start.** UTC days of `seen_at`. A window
  with no full record behind it is not judged, so the 60- and 90-day rows
  describe the last 45 and 15 days only. Using the publication date
  instead of the storage date was not tried.
- **The record is production's finds,** which depend on its feeds and on
  Google's relevance order; v0's own intake may find more or fewer
  articles per week, so its counts could clear a threshold production's
  would not (inferred).
- **The interval widths** treat a week's articles as independent draws; one
  event's articles are not, so the true uncertainty is wider.

Cost: $0 (no model calls, no outside requests). `data/articles.json` (ids,
fighters, days, readable verdicts) stays in the git-ignored `data/` of the
main checkout; `results.json` holds the counts.
