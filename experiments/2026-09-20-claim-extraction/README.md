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

## Files

`batches/` inputs for the clustering agents · `clusters.json` the ruler ·
`prompt.md` the extraction prompt (reviewed by Anton before any spend) ·
`run.py` extraction · `score.py` the three arms · `ITERATIONS.md` append-only.
