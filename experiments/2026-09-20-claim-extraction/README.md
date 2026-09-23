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

**Blocked**
10. Live validation — the sample is frozen and must not be re-pulled.
11. A bigger blind set — 22 articles is exhausted, and only Anton can grade it.

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
