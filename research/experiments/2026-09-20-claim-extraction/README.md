# Claim extraction — does a one-sentence claim separate stories?

Started 2026-09-20. Nothing committed. Uses the **same frozen 300 articles** as
`../2026-09-17-role-questions/data/articles.json` (never re-pulled) and the
classifier answers already measured there.

## The hypothesis, stated before any run

An LLM-extracted **claim** — one plain sentence, who did what to whom, naming the
fighter — carries the article's substance better than its headline does. If so,
articles about the **same story** will sit closer together in embedding space,
and articles about **different stories** further apart, than they do today.

Terms, as agreed with Anton 2026-09-20:
- **claim** = one article's version of the news. One article, one sentence.
- **story** = the real-world thing many articles share. Many claims, one story.

## The ruler — same-story separation, no grading needed

Build a set of **story clusters** over the 300 articles (Fable subagents read
each article once, group within fighter-time windows with overlap, then a
merge pass over one-line cluster descriptions). Then for each arm compute the
cosine similarity of every same-story pair and every different-story pair
(same fighter, within 3 days — the pairs that actually confuse dedup).

**Success = the two distributions separate.** Report the overlap: what share of
different-story pairs score above the median same-story pair, and the best
single threshold's error rate. Lower is better.

**Three arms, same embedding model as production (`gemini-embedding-001`, 768d):**

1. headline only
2. headline + first 1500 chars — **what production embeds today**; the baseline
3. the extracted claim — the hypothesis

Production measured five same-story pairs at 0.71–0.76 and different-story
neighbours at 0.75–0.80 (TODO 3b). That overlap is the thing to beat, but it
is **recomputed here on the same clusters**, not carried over.

## One variable at a time

Extraction is under test. The embedding is the ruler and is held fixed. Dedup
(embedding vs LLM vs field-matching) is a later experiment; a third option to
keep in mind — match on structured fields (opponent, event, date) with no
similarity at all — is noted, not tested.

## Extraction model

Qwen3.8 Flash via OpenRouter (`OPENROUTER_TEST_API_KEY`), the cheapest model
that came near Haiku on the decider scoreboard. **~$0.08 per pass over 300.**
Whole body, not an excerpt. A later follow-up (Anton): trim the body to a window
around the fighter's name and see whether results hold.

## Known limits, said up front

- The ruler is a model's judgement (Fable), not Anton's. Questionable clusters
  are surfaced to him; he need not read everything.
- Extraction and clustering are both LLM judgements and could share blind
  spots. They are different tasks on different inputs; acceptable for a test.

## Where this got to — 2026-09-21 morning

Five extraction passes on Qwen3.8 Flash, **$0.40 of the $1.00 budget**, one
replicate, every change logged with its prediction before it ran. Full
blow-by-blow in `ITERATIONS.md`.

### The result

| text embedded | AUC full | AUC balanced (hard stories) | tail overlap | errors at best threshold |
|---|---|---|---|---|
| headline only | 0.895 | 0.875 | 5.7% | 572 / 6542 |
| headline + lead — **what production embeds today** | 0.918 | 0.918 | 5.0% | 542 / 6542 |
| extracted claim alone (pass 4) | 0.925 | 0.896 | 2.2% | 440 / 5503 |
| **claim + occasion, in front of headline + lead (pass 4)** | **0.942** | **0.929** | **1.2%** | **396 / 6542** |

Noise floor, measured with a byte-identical replicate: about ±8 errors,
±0.003 AUC. So:

1. **The claim alone does not beat production.** It ties on the headline
   number and loses on hard stories. Short one-sentence claims about the same
   fighter crowd together in embedding space.
2. **The claim in front of production's own input beats it clearly** — 27%
   fewer errors at production's best threshold, on the identical pair set,
   and the first text to win on the balanced view. The sentence carries the
   substance; the lead carries the distinguishing detail. **For the
   whiteboard: the Extractor's sentence goes INTO the dedup embedding
   alongside the text, not instead of it.**
3. **Where and when matters, and word order matters.** An `occasion` field
   ("MightyCast podcast", "post-fight presser") is worth +0.013 AUC, and
   putting it first in the embedded text is worth more than appending it.

### What the prompt learned, pass by pass

- Pass 1 (approved prompt + "examples are scenarios, not templates"): claims
  came back as the well-known event the article recalls — previews and
  next-day columns as "Donchenko is scheduled to fight / defeated Soriano".
- Pass 2: "the article's own news, what a reader learns here and nowhere
  earlier" + `occasion`. Fixed the preview. Best ruler score of the run.
- Pass 3: a `kind` field decided FIRST (field order is fill order), one fact
  per claim, about-someone-else → NO CLAIM. Fixed the callout-packed-with-the-
  result, the meta-phrasing and the unnamed-fighter claims — and over-fired
  "about someone else" on eighteen articles where another fighter talks
  ABOUT him. The classifier's `background` defect, reproduced. Regression.
- Pass 4: the classifier's delete test ("delete every sentence naming him; if
  the story still stands, it is about someone else"). Recovered all of them.
  Ties pass 2 on the ruler; cleaner claims. **The candidate prompt is
  `prompt-p4.md`.**

### The finding that matters more than the score

**Three quarters of the remaining false merges, and all of the big misses,
are one disagreement about what a "story" is.** The ruler (built by reading)
groups by *occasion*: one interview, one fight, one column. The extractor
separates by *fact*: six previews restating one booking are one claim; one
long interview published in instalments is several. For "have we told the
group this already?" the fact is what the reader cares about. For "show me
every article in this story" (TODO item 7) the occasion is. **That choice is
Anton's, and the answer may differ by stage.** Arm 4 hedges both, which is
part of why it wins.

### Not cracked

- **#817**, a next-day column, is extracted as the fight result in all five
  passes, through four prompt shapes. Wording will not move it. A date check
  in code — fight date well before article date → not a new event — would.
- **Temperature 0 is not deterministic through OpenRouter**: 136 of 300
  claims re-worded on identical input. Harmless for the score, important for
  anything that compares two extractions of one article.
- Two claims in 300 still fail to name the fighter.
- Qwen3.8 Flash was the only model tried, per the brief. Whether Haiku
  extracts better is a different experiment.

### What's next

**Needs Anton — these change what gets built**
1. **Fact or occasion?** The one real decision. Three quarters of the residual
   error is this disagreement. It may differ by stage: fact-level for "have we
   told the group already", occasion-level for the reading app (TODO 7).
2. **Is arm 4 worth shipping?** It cuts dedup errors 27% at production's own
   threshold — but measured on a frozen 300-article sample, never live.
3. **Budget**: ~$0.60 of the $1.00 unspent. Which of the below is worth it.

**Doable without him, roughly in value order**
4. **The #817 date check, in code not prompt.** If the fight date is well
   before the article date, it is not a new event. Kills the one failure five
   prompt passes could not. Free — the extractor already returns `date`.
5. **Anton's excerpt idea, and it matters more than it sounds.** Trim the body
   to a window around the fighter's name and re-run arm 4. Production only
   sends the first 1500 characters, so if a name-centred window holds up, the
   Extractor gets better input for the same tokens. ~$0.06.
6. **The third dedup option, properly tested.** Match on the structured fields
   (opponent / event / date) with no similarity at all. Field agreement was
   measured (actor 98% same-story vs 36% different; event 67% vs 43%) but
   never scored as a dedup. Free — no model calls, fields already extracted.
7. **Embedding vs embedding-then-LLM.** Anton raised it and it was never
   tested: production's shape is top-K by embedding, then an LLM decides.
   Does the LLM pass earn its cost once claims are in the embedding? ~$0.20.
8. **A second extraction model.** Only Qwen3.8 Flash was tried, per the brief.
   The decider scoreboard is a different task and does not transfer.
9. **The threshold.** Production uses 0.80; arm 4's best is 0.90. A one-line
   change, but validate before touching production.

**A direction, not yet a pass — Anton, 2026-09-22, reading the report**
9b. **Extract everything said about the watched fighter, not one fact.** His
    words: *"We need to extract everything that was said about our fighter in
    that article I think, otherwise we are losing fidelity. But it's for the
    future passes."* Today's prompt returns ONE sentence, ONE fact, naming him;
    when Makhachev says two things about Amosov in one interview, one is
    dropped. **Concrete case, story-125:** Makhachev's reason for not rating
    Amosov ("someone stopped his wrestling") is in the text of all three
    articles; the extractor kept it in one (#1146) and dropped it in two
    (#1150, #1160). Anton spotted it on first read. Keep the exclusion of
    what is said about others — that part is
    by design and he confirmed it. What changes: `claim` becomes a list of
    facts about him (or a lead claim plus "also said"). What it touches:
    (a) the dedup embedding — arm 4 was measured with one sentence in front
    of the lead, and several sentences may crowd or may sharpen; re-score,
    do not assume; (b) the fact-vs-occasion split — several facts from one
    occasion is exactly the case the storyboard's weekly digest agent needs
    (TODO 7), so the richer extraction feeds that even if dedup keeps using
    only the lead fact. ~$0.10 per pass; the prompt is the only change.
    **Second case, story-059 (2026-09-25):** MMA Mania led with Tsarukyan's
    Pimblett remark, MMA Fighting led with his title-defence remark and
    closed with the same Pimblett remark word for word. The two one-sentence
    extracts looked unrelated; the bodies shared a quote. **The open
    question he named on it, to test, not assume:** *"what if there's more
    than one fact — and if we change the prompt, how is grouping going to
    change? Grouping might get more difficult if the extract is bigger. So
    it's an open question that we'll need to test."* Two directions it can
    go: a shared quote surfaces in both extracts and pulls them together, or
    a longer extract carries more unshared material and pushes them apart.
    Point (a) above is the measurement.

9d. **Predictions: extract the pick, and the odds if given** — Anton,
    2026-09-23, ruling the Soriano predictions one story: *"for predictions
    we may ask the model to extract who is the predicted winner in a given
    prediction, or maybe even what odds are, so it can be later reported by
    the digest agent."* Two fields on `analysis` claims that are picks:
    `predicted_winner`, `odds`. Cheap; same pass as 9b. On the sample: 12
    picks with text, 8 Soriano, 4 Donchenko, one odds line (Donchenko −238).

**Anton's read of the result — 2026-09-22, after reviewing the report**
9c. *"Embedding comparison is useless for this task, unless we increase the
    extract size to include more details — but that may add more disparity
    than precision. Basically, we need to find a way to match each new
    article to one of the existing stories. And that is a real problem that
    current production struggles with too."* The sharper form: similarity
    finds candidates (arm 4's 27% is real) but cannot decide membership —
    the claim-only threshold that best fits the ruler is 0.95, under which
    three near-identical claims (story-125, 0.91–0.94) fall "apart". The
    join-or-start-a-story step he named for the whiteboard is a matching
    problem, to be designed and tested as its own stage.

9e. **Test whether the matcher knows one source under several names** —
    Anton, 2026-09-25, ruling story-014 correct: *"does the model understand
    that Demetrious Johnson is the same guy as Mighty Mouse, and that
    MightyCast is Demetrious Johnson's podcast? The when-and-where source is
    cited slightly differently in different extracts, but it's ultimately the
    same source."* The six articles of one hour-long podcast got six
    occasion strings, identical on both runs: "Interview with Demetrious
    Johnson ahead of UFC 330", "MightyCast podcast", "Demetrious Johnson's
    podcast", "Interview with Demetrious Johnson", "Interview with Demetrius
    Johnson", "Conversation with Demetrious Johnson". Outlets also quote
    different parts of a long sitting, in a different order — expected, not
    a grouping fault. A test for the matching stage: given two of these,
    does it join them, and does it need to be told the aliases?

**Blocked**
10. Live validation — the sample is frozen and must not be re-pulled.
11. A bigger blind set — 22 articles is exhausted, and only Anton can grade it.

### The ruler after Anton's review — v3, 2026-09-25
All 48 multi-article stories ruled (`golden/verdicts.md`): 45 as built, two splits
(094: #743 out alone; 015: Merab/Helen Yee apart from Gallo/Jorge Ebro),
one merge (ten Soriano prediction stories into story-066, by type of news).
`clusters.json` is now v3, 129 stories; v2 is `clusters-v2.json`,
`scores-v2.json` is every arm scored against it. Singletons not yet
reviewed. Rescored from the cached embeddings, no new calls:

| arm | pairs same/diff | AUC v2 → v3 | best threshold | errors v2 → v3 |
|---|---|---|---|---|
| 1 headline | 745 / 5,797 | 0.895 → 0.876 | 0.84 | 572 → 619 |
| 2 headline + lead (production) | 745 / 5,797 | 0.918 → 0.908 | 0.89 | 542 → 609 |
| 3 claim | 723 / 4,780 | 0.906 → 0.914 | 0.92 | 472 → 499 |
| 3o claim + occasion | 723 / 4,780 | 0.919 → 0.922 | 0.95 | 452 → 501 |
| 3q occasion-first + claim | 723 / 4,780 | 0.925 → 0.926 | 0.92 | 440 → 483 |
| 4 occasion-first claim + headline + lead | 745 / 5,797 | 0.942 → 0.941 | 0.90 → 0.89 | 396 → 448 |

Read: the merge added 69 same-story pairs, nearly all of them two outlets'
picks for the same fight — the pairs an embedding is worst at, since the
texts share only the two names and the event. Every arm's error count rose
for that reason; the ranking of the arms did not move (4 > 3q > 3o > 3 > 2
> 1 on AUC, as before). The production arm lost the most (AUC −0.010,
errors +67), the claim arms gained slightly on AUC. Nothing here changes a
conclusion; it re-states that predictions are a type-of-news story the
embedding cannot assemble.

### The ruler after the singleton pass — v4, 2026-09-27
Seven singleton pairs Fable could not call were ruled (golden/verdicts.md):
six stand as built, one joins — #565, an Uncrowned column built on
Gaethje's Sports Illustrated quotes, into story-054, the interview itself.
128 stories. v3 is kept as `clusters-v3.json` and `scores-v3.json`; v4 is
built by `golden/tools/ruler-v4.py`. Rescored from the cached embeddings
with the network blocked, so no call could happen:

| arm | pairs same/diff | AUC v3 → v4 | best threshold | errors v3 → v4 |
|---|---|---|---|---|
| 1 headline | 748 / 5,794 | 0.876 → 0.876 | 0.84 | 619 → 622 |
| 2 headline + lead (production) | 748 / 5,794 | 0.908 → 0.908 | 0.89 | 609 → 612 |
| 3 claim | 726 / 4,777 | 0.914 → 0.913 | 0.92 | 499 → 502 |
| 3o claim + occasion | 726 / 4,777 | 0.922 → 0.921 | 0.95 | 501 → 504 |
| 3q occasion-first + claim | 726 / 4,777 | 0.926 → 0.925 | 0.92 | 483 → 486 |
| 4 occasion-first claim + headline + lead | 748 / 5,794 | 0.941 → 0.941 | 0.89 | 448 → 451 |

Read: the join turns three different-story pairs into same-story pairs
(#565 with #476, #492, #503; the other three members are four days away,
outside the 3-day window). Every arm misses all three at its own best
threshold, so every arm gains exactly three errors and the ranking does
not move. #565 is a column: it quotes the interview but writes around it,
which is the case the embedding is worst at. Nothing here changes a
conclusion.

### Reproduce
    PASS=n python3 run.py --one        # one live call: reasoning tokens, cost
    PASS=n python3 run.py --yes        # ~$0.06–0.09 per pass, cached
    python3 score.py --claims claims-pN.json
The prompt each pass ran with is `prompt-pN.md`. `clusters.json` is the
ruler (v2); `clusters-v1-chained.json` is the one with the merge bug, kept.

## Files

`batches/` inputs for the clustering agents · `clusters.json` the ruler ·
`prompt.md` the extraction prompt (reviewed by Anton before any spend) ·
`run.py` extraction · `score.py` the three arms · `ITERATIONS.md` append-only.

## The test-set score of pass 4 (task 5.7), procedure written before it ran

*Written 2026-10-05, before any test-side number was computed.* v0 freezes
pass 4 as its Claim extractor (5); the archive run re-answers every
article with it, so it is scored once on the test set first, as the
classifier was (D30 in docs/superpowers/specs/2026-10-04-v0-design.md).

**Nothing is sent.** Pass 4's extracts of all 300 golden articles, and
their arm-4 embeddings, were made on 2026-09-20, before the golden set was
split (golden/answers/extractor.json, emb-cache/4-p4/). The score reads
them; it costs nothing. The ruler is Anton's ruled claims
(golden/claims.json), not the Fable clusters this experiment started with.

**What is scored**, on the 105 test articles, beside the same numbers on
the 195 training and validation articles computed in the same run
(`test_score.py`):

1. **Shortlist recall**, v0's actual use (D22): each article that joins a
   ruled claim with an earlier article, in date order; candidates are that
   fighter's ruled claims with an article in the 14 days before it, on the
   same side; ranked by their closest earlier article's cosine similarity
   on the arm-4 text. Reported: right claim first, in the top 3, in the
   top 5. Training and validation measured 93.8%, 97.7%, 98.5%.
2. **Separation**, this experiment's original ruler on the ruled claims:
   every pair of articles of one fighter within 3 days, same claim or
   not; the AUC (the chance a same-claim pair scores above a
   different-claim pair) for arm 4 against arm 2, headline and lead, what
   production embeds.
3. **"NO CLAIM" on career-event articles:** articles whose key fact is a
   result, next fight or health, and whose extract is NO CLAIM, so a
   tier-1 post would fall back to the headline.
4. **The noise floor:** the share of articles whose second, unchanged run
   wrote a different sentence.

**Read in advance as:** pass 4 holds if the test side's top-5 recall is
95% or more and arm 4's AUC is above arm 2's. Either failing is recorded
as a finding before the archive run, not a block (no pass mark was ever
set for the extractor). Which test articles miss is not listed, as for
the classifier: the test set stays closed.

**The result** (2026-10-05, `python3 test_score.py --final`, run once; the
script first reproduced the training and validation shortlist figures
above exactly, so it measures what D22 measured):

| | training and validation (195) | test (105) |
|---|---|---|
| 1. shortlist: right claim first / top 3 / top 5 | 93.8% / 97.7% / 98.5% of 130 joins | 92.9% / 97.6% / **97.6%** of 42 joins |
| 2. AUC, arm 4 against headline and lead | 0.939 against 0.899 | **0.942 against 0.950** |
| 3. NO CLAIM on career-event articles | 0 of 46 | 0 of 15 |
| 4. second run wrote a different sentence | 88 of 195 (45%) | 48 of 105 (46%) |

**By the reading written in advance, pass 4 does not hold:** the shortlist
passes (97.6%, one join of 42 missed), but on the test articles the
claim sentence in front of the headline and lead no longer separates
claims better than headline and lead alone. The gap, 0.008, is smaller
than the standard error of either AUC on 95 same-claim pairs (about 0.017
by Hanley and McNeil; rough, since pairs share articles), so it says "no
gain confirmed on unseen articles", not "worse". What v0 relies on, the
right claim reaching JEV's shortlist, held. Recorded as a finding; it does
not block the archive run. The sentence's wording is unstable (nearly
half change on an identical rerun), which matters for the tier-1 message
more than for grouping.
