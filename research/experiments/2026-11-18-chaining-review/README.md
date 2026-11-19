# Why do claims go mixed: chains, stale leaders or wrong picks? (2026-11-18)

Launch Map task 6.9, first step: the review of real claims. Only the review is
here; the design step waits for the maintainer.

**Question.** Of the claims that the three judges agree hold more than one story
([2026-11-05-three-judges](../2026-11-05-three-judges/README.md)), how many are
**chains** (a story grows through its most similar member and drifts onto
another), how many are **stale leaders** (a story is judged against a label that
no longer fits it), how many are a **plain wrong pick** (the picker took an
article for the claim's story), and how many are the **judges being wrong**
(on reading, it is one story)? And, for the card's sub-question, are the 3 mixed
claims of the golden training replay chains or stale leaders?

**Why.** The card (docs/launch-map.html, 6.9) says the failure that matters
decides which levers on 6.12 are worth building. Over-merging swallows news (G1,
docs/goals.md) and a split story repeats (G3). Against the judges' labels the
pipeline over-merges 14.5% of readings and over-splits 22.1% of claims, but
nobody had opened the over-merged claims and said why each went wrong. The base
labels are the three models' (Opus 5.5, Fable 5.1, Sonnet 5.5), not the
maintainer's, and every call below on top of them is the reviewing agent's own.

## Method

All of it reads; nothing was changed, written to the database, or sent to a
model API. The judges' data and the article text stay in the shared checkout's
git-ignored folders; the tracked files here hold claim ids, reading ids, dates,
numbers and the reviewing agent's own short descriptions, never a sentence from
an article.

1. **Which claims.** `list-mixed-claims.mjs` reads the judges' calls exactly as
   `history-judges.mjs` does, for the 16 judged weeks from Monday 27 Jul to
   Monday 9 Nov (675 claims, 2,295 readings; the week of 16 Nov was still being
   judged by another thread and is left out). **A claim is mixed when at least
   two of the three judges each call at least one of its readings "does not
   belong" or "its own claim".** That gives **112 claims**; **105** when all
   three judges must do so. Where two judges call out the same reading (the
   reading-level rule behind the 14.5%), it is again 112; where all three call
   out the same reading, 98. A reading is *foreign* when at least two judges
   call it out. By fighter: Topuria 100 of 608 claims, Donchenko 6 of 36,
   Amosov 6 of 31.
2. **Which are read.** 112 is more than 60, so: **the 20 largest by article
   count, and a random 40 of the other 92** (seeded, `mulberry32`, seed
   20261118). 60 claims, 898 readings, of which 278 foreign.
3. **How each grew.** `export-claims.mjs` reads, with the session set
   read-only, every grouping row of those claims: the order the readings joined
   (grouping row order), the shortlist the picker saw with **the label each claim
   had at that moment**, the pick's confidence and its probability for "none of
   these", the vector. `trace-claims.mjs` turns them into one trace per claim:
   for every join the nearest earlier member by the stored vectors, its
   similarity to the claim's first reading and to the reading the label came
   from, and the days since the claim began. The reviewing agent read the
   headlines, the extract sentences and the judges' one-line reasons for the
   entering articles of all 60, and the opening of a few bodies where a call was
   close. Most bodies were not read.
4. **The crossing.** The first article, in the order they joined, that reports a
   different story from the claim's first article. By default it is the first
   reading whose foreign status differs from the first reading's; in 3 claims
   (154, 209, 214) the judges disagreed about which story the first reading
   belongs to, and the call names the reading instead. Everything is counted at
   the crossing, because by then the claim held only the first story.
5. **The classes, tested in this order, each with one rule** (`classify-claims.mjs`):
   - *Judges wrong:* on reading, the crossing article and the founding article
     report one story under the maintainer's own test (same fact, goals.md G3).
     The call is the agent's.
   - *Cannot tell:* the stored rows do not show it. The call is the agent's.
   - *Stale leader:* the label shown to the picker at the crossing did not
     describe what the claim held. The call is the agent's.
   - *Chain:* by the numbers, written before any claim was classified: the
     crossing article's similarity to the first reading and to the label's source
     reading is below 0.80 (about the 10th percentile of the right joins in these
     claims), its nearest earlier member is neither of those, that member is closer
     by at least 0.05, and the claim already had three or more readings. This is
     "closest to a late member, not to the first or defining articles".
   - *Wrong pick:* everything else: the picker took the article for the claim's
     story.
6. **Growth after the crossing**, counted apart so a claim is not forced into
   one box: how many more articles of the entering story joined, how many of
   them had another article of that story as nearest member, whether any later
   join passes the chain test, and whether the label moved onto the entering
   story.

## Result

### The claims

| | claims | readings called out by two judges |
|---|---|---|
| Mixed by the rule (at least two judges each call a reading out) | 112 | 354 of 2,295 readings (15.4%) |
| All three judges call some reading out | 105 | |
| Read by hand: the largest 20 | 20 | 200 of 630 |
| Read by hand: a seeded random 40 of the rest | 40 | 78 of 268 |

### The class of each (60 claims read)

| Class | Claims | Which |
|---|---|---|
| Wrong pick | **55** | Topuria 50, Donchenko 3, Amosov 2 |
| Chain (at the crossing) | **1** | 209 (Donchenko) |
| Stale leader (at the crossing) | **0** | |
| Judges wrong | **2** | 279 (Topuria), 351 (Amosov): both are a roundup page that carries the fact as one blurb |
| Cannot tell | **2** | 640, 643 (Topuria): the founding article's saved text is a stub or cut off |

The one chain is thin: the entering article (a rival's reply, claim 209) joined
at confidence 0.33 with a 0.43 probability for "none of these", nearest to
a reading six places on that sat 0.75 from the claim's first. Loosening the chain
test (similarity to anchors below 0.85, margin 0.03) gives 10 of 56; the answer
"at the door it is almost never a chain" does not hang on the threshold, but the
exact count does.

### What the entering article was

56 mixed claims (wrong pick and chain), by what came in, the agent's call:

| What entered | Claims |
|---|---|
| A reaction: another person's or the fans' answer to the claim's event or remark | 14 |
| The same speaker's later or other sitting or post | 13 |
| Another person's remark on the same topic | 11 |
| Another occasion of the same fight or event (post-fight remarks, a result against a preview, a weigh-in) | 9 |
| Coverage: previews, odds, columns | 6 |
| Unrelated to the fighter | 3 |

17 of the 56 rest on a question the maintainer has not ruled (the nine in
`../2026-11-05-three-judges/data/compare/rule-gaps.md`, local): question 2 (one
speaker repeating himself in another sitting) 8, question 3 (previews and
columns) 5, and one each of 1, 5, 8 and 9. The other 39 do not: 13 are reactions
that his 5 Nov ruling on #289 already makes their own claims, and the rest differ
by occasion, speaker or fight.

### How it went wrong at the door

- **Confidence.** Median 0.71. 34 of 56 entering articles came in below 0.8 and 13
  below 0.5; 22 at 0.8 or more, of which 7 at 0.95 or more. The right joins of the
  same claims: 85 of 522 below 0.8 (16%), 20 below 0.5 (4%).
- **Median probability of "none of these" at the crossing: 0.14.**
- **Nearest member.** For 33 of 56 the nearest earlier member was the claim's
  first reading or the reading the label came from. The median similarity to
  those was 0.83, the median similarity to the nearest member 0.84: the entering
  article was usually about as close to the claim's anchors as to anything else.
- **Too early to chain.** 22 of 56 entered a claim with fewer than three earlier
  readings, which cannot be a chain by the test.
- **The window.** 4 of 56 entered more than 14 days after the claim's first
  reading (85: 29 days, 93: 18, 391: 17, 450: 15), each inside the 14-day window
  of a later member 7 to 11 days older than itself. So the window let four claims
  live on, but it is not how most foreign articles got in.
- **Was the right claim there?** Where the judges name the claim the article
  belongs in (22 of 56): on the shortlist in 11, not in 11. Where it was not, the
  right pick was "none of these" or a claim the shortlist did not carry.
- **The extract restated the label.** My proxy (word overlap of the entering
  article's extract sentence with the label, at least half) gives 9 of 56; reading
  gives 4 (265, 330, 364 and 614 are tagged `extract_restates_core`; 351, 640 and
  643, outside the 56, are tagged too). The proxy also catches a speaker saying the
  same thing twice, where the restatement is true.
  The picker is told what the extractor says the article reports; for these the
  extractor said it reports the claim's own story.

### How the other story grew after the door

Of the 56, 33 gained at least one more article of the entering story and 13
gained three or more. In 12 of those 13 most of the later articles had another
article of the entering story as their nearest member (for example 289: 30 of 37,
214: 22 of 26, 85: 9 of 9). In 12 claims at least one later join passes the chain
test (289 has 18 such joins). The label moved onto the entering story in 7 claims:
in 2 it moved onto a *foreign* story after a claim with a core founder (311, 364),
which is the stale-leader pattern, and in 5 a claim founded on a foreign article
moved onto the core story (154, 322, 330, 337, 526), which mends the label.

So in this sample: the foreign story gets in by a wrong pick, then grows by
following its own members, and in a few claims the label follows it. Nothing
here is a chain at the door.

### Per fighter

| | Topuria | Donchenko | Amosov |
|---|---|---|---|
| Claims, all 112 mixed / all claims | 100 / 608 (16.4%) | 6 / 36 (16.7%) | 6 / 31 (19.4%) |
| Read by hand | 53 | 4 | 3 |
| Wrong pick | 50 | 3 | 2 |
| Chain | 0 | 1 | 0 |
| Judges wrong | 1 | 0 | 1 |
| Cannot tell | 2 | 0 | 0 |

Amosov's and Donchenko's counts are small enough that only counts should be
read from them.

### Did any swallow a career event (G1)?

**None clearly; 2 borderline in 60.** A foreign article counted if it reports a
fight booked or changed, a result, a withdrawal or injury, an official return
date, a retirement, or a promotion or contract move (docs/goals.md), and the
claim held another story. Both borderline cases are a return date given by the
fighter's trainer (85) or by the fighter himself (575), neither an official date,
and both would have gone to the digest anyway. Over all 112 mixed claims, the
three readers tag a foreign reading with such an event in 6 claims (43, 85, 159,
182, 592, 604); read, each is a re-telling of an injury or a repeat of a request
or an odds piece, none a new event hidden by another story. The foreign material
is another piece of substance (a second interview, a reaction, another person's
view, another occasion of the same fight) in 47 of 56, and filler (coverage or
unrelated) in 9.

### The golden replay's 3 mixed claims

`replay-mixed.mjs` rebuilds them from the saved run
`2026-10-05T1019-earliest-on-tie` (training side; ruled claims from
golden/claims.json). They are v0 claims 29, 46 and 47 of the replay schema.

| Replay claim | Readings, ruled claims | Crossing | Chain test at the crossing | After the door |
|---|---|---|---|---|
| 29: one fight week of one fight | 12, 5 | 2nd article, a card preview, confidence 0.97, nearest the first at 0.89 | no (1 earlier member) | 10 of 10 later articles nearest to an article of another ruled claim; 3 later joins pass the chain test; the label moved |
| 46: a rumour and the promotion boss's answer | 16, 2 | 7th article, the boss's remark, confidence 0.64, nearest the first at 0.81 | no | label moved to the boss's sentence; 9 of 9 later boss articles nearest to another boss article, confidence about 1.0 |
| 47: a fight result and what followed | 32, 5 | 3rd article, a result report joined an event-wide results page's claim, confidence 0.99, ranked 4th of 5 on the shortlist, nearest 0.82 against 0.79 to the first | no (0.033 margin) | 26 of 28 nearest to another; 9 later joins pass the chain test |

**None of the three entered by chaining; each entered by a pick at moderate to
high confidence, and two then grew by chaining (29, 47), one by the label moving
(46).** None is a stale leader at the door either: the label described the
claim when the article joined. Validation has one more mixed claim (a result and
a later set of remarks, 2 readings), counted nowhere else here. The replay's 46
and 29 are the same stories as live claims 214 and 154 of this review; the live
database grouped them again from scratch.

## Three worked examples

**289, a wrong pick that the claim then fed on.** The claim began on 16 Sep with
the fighter's two X posts announcing his clearance and a jab at his conqueror, and
grew to 73 readings with 38 of them foreign. Twelve readings in, the conqueror's
own X reply joined at confidence 0.93: only a 0.06 probability for "none of these",
the claim's label still the fighter's posts, the reply 0.86 from the first reading.
The maintainer's 5 Nov ruling (every person's reaction is its own claim) says it
is another claim. After it, 37 more foreign readings joined, 30 of them nearest to
another foreign one and 18 passing the chain test, and the label never changed:
the picker kept taking replies, pundits' comments and the commission's statement
for the posts' claim. The judges name claim 255 as the reply's claim; the
stored shortlist did not carry it at the crossing.

**209, the one chain.** A fighter called out an opponent after his win on 5 Sep; the
claim held that callout across outlets. The opponent's Instagram reply (reading
886, 8 Sep) joined at confidence 0.33 with 0.43 for "none of these". Its nearest
member was a third outlet's callout write-up (0.82), its similarity to the first
article, the press-conference report that founded the claim, 0.75. It is the only
entering article in the sample that was far from the founding articles and
reached the claim through a later member. The call that it is a different story
rests on the maintainer's reaction ruling.

**364, a wrong pick on a sentence that was not the article's, then a label that
changed hands.** On 26 to 28 Sep the claim collected the rival's podcast remarks
about the fighter. A report of the rival's coach (reading 1703, 28 Sep) joined at
confidence 0.99; the extractor had written the rival's own remark as its sentence
(word overlap with the label 0.57), so the picker was told the article reported
the claim's story. On 2 Oct a pundit's reading joined at confidence 0.41; the
classifier called it `official_or_done`, which is firmer than the `reported` of
the rival's remarks, and the label rule (the firmest reading, the earliest on a
tie) made its sentence the label. Three more of that pundit's articles then joined
at 0.98 or more. This is the stale-leader pattern (a label that is the firmest
article's, not the claim's), and it happened after the door, not at it.

Two small classes, for completeness: **351** (Amosov) is a morning roundup that
embeds the post debunking a death hoax; it founded the claim and the judges call
the articles that followed foreign, but the roundup reports the same fact as one
blurb, so on reading it is one story. **640** is a stub whose saved text is not the
article; what story it reports cannot be told from the stored rows, so who the
foreign article is cannot be told.

## What the stored rows could not show

- **The text the picker saw.** The grouping row keeps the vector, the shortlist
  with labels, the pick and its probabilities, but not the text that was embedded
  or sent. For two claims (640, 643) the founding article's saved text is a stub or
  cut off, and the judges themselves judged on what remained. What would need
  storing: a `body_problem` flag at join time, or the first 1,500 characters
  actually embedded.
- **Claims outside the shortlist.** Only the top five are stored. Where the
  judges' target claim is not on the shortlist (11 of 22), whether it existed and
  ranked sixth, or did not yet exist, is not in the rows.
- **Why the picker chose.** The pick stores its probabilities for every shortlisted
  label and none, not its reason.
- **Join order for the first ten weeks** is the order of the 5 Oct replay (in
  publication order), because those groupings were written in one run; later
  weeks are live.
- **Which of two stories the founder belongs to** when the judges split (3
  claims). That is the judges' disagreement, not a gap in the rows.

## What it does not settle

- The calls "mixed or one story" and the choice of crossing are one agent's
  reading of headlines, extract sentences and the judges' reasons, mostly
  without the bodies, and were not independently re-read. 4 of 60 are not mixed
  or cannot be told; a second reader might move a few more.
- The base is the three models' labels, 16 judged weeks, not the maintainer's;
  17 of 56 calls depend on rule questions he has not ruled, and a ruling flips
  those.
- 60 of 112 claims: the 20 largest are all in, so counts mix a census of the big
  claims and a 40-in-92 sample of the rest. The largest claims are where growth
  after the door shows (289, 214, 614, 476); the sampled claims have a median of 5
  readings.
- The chain test's thresholds (0.80, 0.05, three members) were fixed before
  classifying and were not tuned on the outcome; they are the agent's, and the
  looser variant is reported.
- The right joins used for comparison are those of mixed claims only. How a
  confidence floor or an extract check would act over claims that never went mixed
  is not measured here.
- Nothing here says which design is right. The card's design step needs the
  maintainer.

## Observations for the 6.12 levers (not a design)

Each is what the numbers above point at, nothing more.

- **"Join only when JEV is confident":** reaches the 34 of 56 entering articles
  below 0.8; the same floor is below 16% of the right joins of the same claims.
  Its cost over claims that never went mixed is unmeasured.
- **"Refuse a join when the extracts name a different opponent, event or date":**
  of 27 entering articles with an event or opponent in both extracts, 12 differ;
  of 279 right joins of the same claims, 43 (15%) do.
- **"A second look at a claim whose newest article disagrees with its label":**
  targets the 7 claims whose label moved, and the stale-leader pattern of 311 and
  364; it would not reach the 22 that entered with fewer than three readings.
- **"Show the judge each claim's first and latest sentence":** the entering article
  was nearest to the first reading or the label's source in 33 of 56, so a first
  sentence would not look wrong to the picker; the latest sentence matters only
  for the claims that grew.
- **"Make the extract's occasion name the fight or event":** meets the 4 to 9
  entries whose extract restated the label (reading, and the word-overlap proxy).
- **"The digest writer merges claims that are one story":** does not meet wrong
  picks, only splits.

## Files

| File | What |
|---|---|
| `list-mixed-claims.mjs` | The 112 mixed claims by the stated rule, the largest 20 and the seeded 40; `results/mixed-claims.json` |
| `export-claims.mjs` | Read-only database export of the 60 claims' grouping rows (git-ignored data) |
| `trace-claims.mjs` | The trace of each claim, the join features and the chain test |
| `classify-claims.mjs`, `classify-claims.test.mjs` | The class rule, the counts, tests; `results/classification.json` |
| `calls.json` | The reviewing agent's own call on each claim, in its own words |
| `lever-numbers.mjs` | The numbers for the observations; `results/lever-numbers.json` |
| `replay-mixed.mjs` | The golden replay's mixed claims; `results/replay-mixed.json` |
| `load-judged.mjs`, `readers-career.mjs` | Read the judges' and readers' files |

Reproduce, from the repository root, with the shared checkout's three-judges data
at `THREE_JUDGES_DATA` and the read-only database address as in
`../2026-11-05-three-judges/export.mjs`: `list-mixed-claims.mjs`,
`export-claims.mjs`, `trace-claims.mjs`, `classify-claims.mjs`,
`lever-numbers.mjs`, `replay-mixed.mjs`.
