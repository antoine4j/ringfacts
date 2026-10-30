# Headline only: what the classifier gets right without the article — 2026-10-30

Launch Map task 3.10, for goal G1 (nothing real is missed). Run 29 October
2026 from the laptop. It measures; it decides nothing.

**Question.** When no reader can open an article, v0 counts it and never
classifies it. Even with every free reader, about half of Amosov's and
Donchenko's articles stay unreadable (outlets behind Cloudflare's bot
check). Could v0's classifier get the news right from what the feed shows,
the headline and its summary, so those articles are judged instead of
skipped?

**Conclusion.** On the headline alone, v0's classifier (v7.7) still found
**30 of 46 career facts** (a result, next fight or health news) that the
labels mark (29 on a second run), against 33 on the full text, and the
decider would still have posted **26 of the 29 articles the labels put in
"post"** (25 on the second run), with **4 false posts in 195** in both
runs, against 4 and 5 on the full text. What it loses is the middle: 33
articles land in a different tier than on the full text (34 on the second
run), 25 of them more cautious, mostly digest material dropped because
the headline does not show that the article is about him. Where the headline
does not name the fighter (54 articles), it drops nearly everything,
including 2 of 3 post-worthy results; on Ukrainian-language headlines (42
articles), it matched the full text (1 tier crossing; 2 on the second run).
**The headline side is stable enough to read that gap:** sent twice, it
crosses a tier on 3 of 195 articles (the full text against itself: 1), so
the 33 crossings are 11 times its own noise, and 32 of them recur in both
runs.

**The "summary" adds nothing.** The feed's preview (`rss_description`) is
Google's, and it is the headline again plus the outlet's name in 153 of the
157 articles that have one. The other 4 are Google's list of related
coverage (other outlets' headlines), not the article's own preview. The 38
without one are mostly direct publisher-feed items (34), whose own feed
text production does not store. So "headline and summary" measured here is
headline alone.

## Sets

- **Training** (split "tune", 155 articles) and **validation** (split
  "check", 40) of the golden set (`golden/split.json`). **No test-side
  article was read or sent**; the test set stays unseen for the next
  classifier version.
- By fighter: Topuria 112; Amosov 14 and Donchenko 69 together, 83.
- Labels: `golden/labels.json`, nine answers per article; the answers in
  `golden/coin-flips.json` count either way.

## Method

1. `pull.mjs` read `rss_description` for the 195 ids from production's
   `items` table, through the `v0_feed` role (it can only read that table),
   inside a read-only transaction.
2. `build.mjs` removed the HTML and decoded its codes (`&nbsp;`, `&#39;`),
   and counted the words the preview adds beyond the headline and the
   outlet's name. The **headline side** is the headline, a blank line, then
   the preview when it adds a word (4 articles), else the headline alone
   (191). `summaries.json` holds, per id, the preview's length and added
   words, no text.
3. `run.ts` sent each headline side twice (runs `headline-a` and
   `headline-b`, the same script and input, about ten minutes apart on the same
   evening) through v0's own classifier
   (`v0/pipeline/stations/classifier/classifier.ts` `classify`, imported
   unchanged; JEV `jev-1.13.0`), with the experiments' test key from
   `research/bench/.env.bench`, never live v0's. The headline goes in the
   headline field as always, and the headline side in the article-text
   field. Four at a time, stored per article in `data/runs/headline-a/` and
   `data/runs/headline-b/` in the shape of the clean-text experiment's runs (no extract: only the
   classifier runs).
4. `compare.ts` scored both headline runs beside the full saved text (the
   clean-text experiment's `saved-a`) and the same text sent again
   (`saved-b`, the full-text noise floor), and compared `headline-a` with
   `headline-b` (the headline noise floor), on exactly the same 195
   articles. Tiers come from v0's
   decider (`v0/pipeline/settings/tiers.ts`) with the live settings, read
   once in a read-only transaction as `../2026-10-20-clean-text/read-settings.mjs`
   does: version 1, identical to that experiment's copy. `results.json`
   holds every count, ids only.

**Terms.** A *career fact* is a "what new fact" answer of result, next fight
or health. A *false career fact* (false alarm) is a career fact on an
article whose label has none. *Label tier* is the tier the decider gives the
labels' own answers. A *tier crossing* is a move between post, digest and
drop; *more cautious* means toward drop.

## Results

### Scores against the labels

| Training (155) | Headline side, run a | Headline side, run b | Full text | Full text again (noise) |
|---|---|---|---|---|
| Answers right, of 1,395 | **1,170** | **1,170** | 1,280 | 1,276 |
| All nine right | **52** | **53** | 95 | 92 |
| Career facts recognised, of 44 | **29** | **28** | 32 | 31 |
| False career facts | 1 | 1 | 5 | 5 |
| At the label tier | **129** | **128** | 147 | 147 |
| Label "post" reaching post, of 28 | **25** | **24** | 28 | 28 |
| Post where the label is not post | 1 | 1 | 4 | 4 |

| Validation (40) | Headline side, run a | Headline side, run b | Full text | Full text again (noise) |
|---|---|---|---|---|
| Answers right, of 360 | **293** | **291** | 326 | 319 |
| All nine right | **11** | **10** | 20 | 18 |
| Career facts recognised, of 2 | 1 | 1 | 1 | 1 |
| False career facts | 3 | 3 | 2 | 3 |
| At the label tier | **31** | **31** | 35 | 34 |
| Label "post" reaching post, of 1 | 1 | 1 | 1 | 1 |
| Post where the label is not post | 3 | 3 | 0 | 1 |

Right per question, all 195 (headline side run a, run b / full text):
centrality **108, 110** / 173, act 134, 135 / 160, source 158, 155 / 181,
he speaks 176, 176 / 194, firmness 160, 160 / 170, what new fact 164, 163
/ 168; the three yes/no news questions are within 6 of each other. The loss is in *how central he is*
and *who speaks*, which a headline rarely shows; the fact is nearly kept.

### Agreement with the full text, all 195

| | Full-text noise floor (full text twice) | **Headline noise floor** (run a vs run b) | Headline run a vs full text | Headline run b vs full text |
|---|---|---|---|---|
| Same nine answers | 188 | **178** | **66** | 66 |
| Answers changed, of 1,755 | 12 | **22** | **284** | 289 |
| Tier crossings | 1 | **3** | **33** | 34 |
| … more cautious / more eager | 0 / 1 | **2 / 1** | **25 / 8** | 26 / 8 |
| Career fact lost / invented | 1 / 1 | **1 / 0** | 12 / 6 | 13 / 6 |

Training alone: run a vs full text 28 crossings (full-text noise 0,
headline noise 3); validation: 5 (full-text noise 1, headline noise 0).

The headline noise floor, answer by answer: of the 22 answers that changed
between the two headline runs, 8 are *how central he is*, 5 *what the
article does*, 4 firmness, 3 source, 1 each the fact and the result
question. The 3 articles that changed tier between the runs (#102, #608,
#779) move one each digest → drop, drop → digest and post → digest (#779
is a Ukrainian-language result that run b answered as "no fact"); only #608 is
also among the 33 crossings against the full text. Run b crosses 34
against the full text, and 32 articles cross in both runs, so the
crossings against the full text are the same articles each time.

The 33 crossings: digest → drop 18, post → digest 5, drop → digest 4,
post → drop 2, drop → post 2, digest → post 2. **All 18 digest → drop
moves go through the gate**: centrality falls from "one of several" or
"main subject" to "only mentioned" or "not in the content". Tier counts
(post / digest / drop): labels 29 / 117 / 49, full text 33 / 110 / 52,
headline side 30 / 99 / 66.

Of the 6 career facts the headline side invents against the full text, 3
match the label's own fact (#803, #828, #862, next fight); 3 do not (#500,
#672, #879).

### Career facts and posts, by group (G1)

Each cell is headline side / full text / full text again.

| Group | Articles | Career facts recognised | False career facts | Label "post" reaching post | Tier crossings vs full text (full-text noise; headline noise) |
|---|---|---|---|---|---|
| All | 195 | **30** / 33 / 32 of 46 | 4 / 7 / 8 | **26** / 29 / 29 of 29 | 33 (1; 3) |
| Topuria | 112 | 4 / 3 / 2 of 15 | 2 / 4 / 4 | none labelled post | 14 (0; 1) |
| Amosov and Donchenko | 83 | **26** / 30 / 30 of 31 | 2 / 3 / 4 | **26** / 29 / 29 of 29 | 19 (1; 2) |
| Headline names him | 141 | **29** / 29 / 28 of 42 | 3 / 7 / 8 | 25 / 26 / 26 of 26 | 20 (1; 2) |
| Headline does not name him | 54 | **1** / 4 / 4 of 4 | 1 / 0 / 0 | **1** / 3 / 3 of 3 | 13 (0; 1) |
| Ukrainian-language headline | 42 | **24** / 24 / 24 of 25 | 0 / 0 / 1 | **24** / 24 / 24 of 24 | **1 (1; 1)** |
| Latin-script headline | 153 | 6 / 9 / 8 of 21 | 4 / 7 / 7 | 2 / 5 / 5 of 5 | 32 (0; 2) |
| Preview adds words | 4 | none labelled | 0 / 0 / 0 | none labelled | 0 (0; 0) |
| Headline alone | 191 | 30 / 33 / 32 of 46 | 4 / 7 / 8 | 26 / 29 / 29 of 29 | 33 (1; 3) |

The headline cells are run a. Run b recognises 29 of 46 career facts
overall (Ukrainian-language headlines 23 of 25, the one lost being #779),
reaches post on 25 of the 29 labelled post (Ukrainian 23 of 24), and has
the same number of false career facts in every group.

"Names him" means a watchlist name stem (`watchlist.js` `matchNames`, e.g.
"Donchenko", "Донченк") appears in the headline. The three post-worthy
articles the headline side misses are Donchenko results in English (#714,
#737, #746): two event-results pages whose headline does not name him,
called "not in the content", and his post-fight interview, whose headline
names him but not the result.
The full text recognises only 3 of Topuria's 15 career facts too; that is
the classifier's known weakness on his articles, not something the
headline adds.

The 42 Ukrainian-language headlines come from Ukrainian outlets (Sport.ua
15, XSPORT 5, Champion.com.ua 4, 112.ua 4, others), 39 of them Donchenko's,
23 of them his result.

## What it suggests (inferred, not measured)

- **The gain.** An unreadable article gets no decision today. Judged on
  its headline, most real career news would reach the group: in this set,
  9 in 10 of the post-worthy articles, and 26 of 31 career facts for
  Amosov and Donchenko, the two fighters with the most unreadable
  articles. False posts did not rise (4 in 195, as on the full text).
- **The risk.** Digest material gets dropped: the headline rarely shows how
  central he is, so the gate drops articles that are about him. And an
  English headline that does not name him, typical of event-results
  roundups, is dropped even when it carries his result. Since these
  articles get nothing today, this is a smaller loss than skipping them,
  not a new loss; but a headline-only drop would look like a decision.
- **Where it works best is where it is needed.** Ukrainian outlets, the
  ones that refuse every free reader, write the news and his name into
  the headline; there the headline side matched the full
  text. That rests on one fight week, mostly one result.
- **The summary is not a lever.** Google's preview repeats the headline.
  Reading an outlet's own feed text for direct-feed items would need
  production (or v0) to store it.
- **The headline's own noise does not explain the 33 crossings.** Sent
  twice, the headline side crosses a tier on 3 of 195 articles (the full
  text against itself: 1) and changes 22 of 1,755 answers (full text: 12).
  So it is noisier than the full text, but the 33 crossings against the
  full text are 11 times its own noise, and 32 of them recur in run b
  (34 there). The wobble between runs (about 1 article in 65, mostly the
  centrality answer) is small beside the 1 in 6 that losing the article's
  text moves, and the loss goes the same way both times (25 and 26 more
  cautious, 8 and 8 more eager). The gap is not run-to-run chance. The
  recognised career facts (30, then 29) and the post-worthy reaching post
  (26, then 25) move by 1 between runs, more than the full text's (33, 32
  and 29, 29), so read them as "about 30 of 46" and "about 26 of 29".

## What it does not settle

- **Two runs per article.** The headline side was sent twice, about ten
  minutes apart, so the noise floor is one pair of runs: 3 crossings in
  195 is a count, not a rate, and a third run might give a different one. It does
  not measure drift between days or a new model snapshot.
- **Readable articles stood in for unreadable ones.** The golden set was
  drawn from articles with text, so these are the headlines of articles a
  reader could open. The headlines of Tribuna's and Sport.ua's refused
  articles today may differ (Sport.ua's 15 here were readable in
  September).
- **The summary field is Google's.** An outlet's own feed summary may carry
  the article's first sentences; nothing here measures that.
- **One fight week.** Every result is the Donchenko–Soriano fight; the 24
  post-worthy Ukrainian headlines are mostly that one result.
- **The classifier was tuned on full texts.** v7.7's questions were tuned
  over 18 passes on these articles' text; a prompt written for headlines
  (for example, centrality judged from the headline alone) was not tried.
- **Validation is small**: 40 articles, 2 career facts, 1 post-worthy.

## Cost

**$0.074 measured** for 390 classifier calls: $0.0372 for `headline-a` and
$0.0372 for `headline-b`, each 886,056 JEV input tokens (the same input
twice) at JEV's published $0.042 per million (the usage fields of each
reply; the script prices input tokens only). The feed and settings reads
cost nothing. Spend limit set at $0.60 across the folder's runs.

## Files

- `pull.mjs`, `build.mjs`, `run.ts`, `compare.ts`: the four steps, in order.
- `summaries.json`: per id, whether a preview exists, its length, the words
  it adds, and whether it is Google's related-coverage list. No text.
- `results.json`: every count, per group, ids only: the four runs' scores,
  each headline run against the full text, the headline noise floor, the
  crossings the two headline runs share, and the cost per run.
- `data/` (git-ignored): the raw previews, the headline sides, the
  classifier's stored replies, the live settings and the run log.
